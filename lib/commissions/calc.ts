import type { Db } from 'mongodb';

/**
 * Cálculo de comissões — réplica do algoritmo da plataforma YourBox
 * (statisticFunction.js), para o portal do parceiro de widget poder mostrar valores
 * que batem com o que a YourBox apura.
 *
 * A YourBox não guarda a comissão de cada serviço: recalcula tudo a partir do histórico
 * quando alguém abre o quadro de comissões. Aqui faz-se o mesmo, lendo a configuração
 * em vigor de `serverSettings` — que é a fonte de verdade. Um parceiro pode ter
 * parâmetros próprios (ver `overrides`), mas o modelo de cálculo é sempre o mesmo.
 *
 * Ver calculo_de_comissoes.md para o algoritmo original.
 */

export type CommissionModel = 'fixed' | 'margin';
export type MarginBase = 'cost' | 'revenue';

export type CommissionConfig = {
  rate: number;              // fracção, ex. 0.05
  referenceMargin: number;   // fracção, ex. 0.5
  model: CommissionModel;
  marginBase: MarginBase;
  startMonth: string | null; // 'AAAA-MM': antes disto o modelo de margem não se aplica
  /** De onde veio cada parâmetro, para a UI poder mostrar "da YourBox" vs "definido aqui" */
  source: { rate: 'yourbox' | 'override'; model: 'yourbox' | 'override'; marginBase: 'yourbox' | 'override'; referenceMargin: 'yourbox' | 'override' };
};

/**
 * Aceita as duas convenções que convivem na base: 5 e 0.05 dão ambos 5%.
 *
 * Armadilha herdada: o valor 1 é lido como 100%, não como 1%. É o ponto cego da regra
 * — mantém-se igual ao original de propósito, para não divergir da YourBox.
 */
export function toRate(n: unknown): number {
  const v = Number(n);
  if (!isFinite(v) || v <= 0) return 0;
  return v > 1 ? v / 100 : v;
}

/** Configuração em vigor: `serverSettings` da YourBox, com override opcional do parceiro. */
export async function loadCommissionConfig(
  db: Db,
  overrides?: {
    commissionPercentage?: number | null;
    commissionModel?: CommissionModel | null;
    commissionMarginBase?: MarginBase | null;
    referenceProfitPercentage?: number | null;
  },
): Promise<CommissionConfig> {
  const ss: any = await db.collection('serverSettings').findOne(
    { commissionPercentage: { $exists: true } },
    { projection: { commissionPercentage: 1, referenceProfitPercentage: 1, commissionModel: 1, commissionMarginBase: 1, commissionModelStartMonth: 1 } },
  );

  const hasOverride = (v: unknown) => v !== null && v !== undefined && v !== '';

  const model: CommissionModel =
    hasOverride(overrides?.commissionModel) ? overrides!.commissionModel as CommissionModel
    : ss?.commissionModel === 'margin' ? 'margin' : 'fixed';

  const marginBase: MarginBase =
    hasOverride(overrides?.commissionMarginBase) ? overrides!.commissionMarginBase as MarginBase
    : ss?.commissionMarginBase === 'revenue' ? 'revenue' : 'cost';

  return {
    rate: hasOverride(overrides?.commissionPercentage)
      ? toRate(overrides!.commissionPercentage)
      : toRate(ss?.commissionPercentage ?? 0.05),
    referenceMargin: hasOverride(overrides?.referenceProfitPercentage)
      ? toRate(overrides!.referenceProfitPercentage)
      : toRate(ss?.referenceProfitPercentage ?? 0),
    model,
    marginBase,
    startMonth: ss?.commissionModelStartMonth || null,
    source: {
      rate:            hasOverride(overrides?.commissionPercentage) ? 'override' : 'yourbox',
      model:           hasOverride(overrides?.commissionModel) ? 'override' : 'yourbox',
      marginBase:      hasOverride(overrides?.commissionMarginBase) ? 'override' : 'yourbox',
      referenceMargin: hasOverride(overrides?.referenceProfitPercentage) ? 'override' : 'yourbox',
    },
  };
}

/**
 * O modelo de margem aplica-se a este mês? O mês de início trava a retroactividade: sem
 * ele, mudar a definição hoje reescreveria comissões de meses já fechados e pagos.
 */
export function usesMargin(cfg: CommissionConfig, year: number, month: number): boolean {
  if (cfg.model !== 'margin') return false;
  if (!cfg.startMonth) return true;
  return `${year}-${String(month).padStart(2, '0')}` >= cfg.startMonth;
}

/** Margem de um serviço ou grupo. `null` quando não é calculável (sem custo de estafeta). */
export function marginOf(price: number, driverPrice: number, base: MarginBase): number | null {
  if (!driverPrice) return null;              // sem custo de estafeta -> não calculável
  if (base === 'revenue') return price ? (price - driverPrice) / price : null;
  return (price - driverPrice) / driverPrice; // markup sobre o custo
}

/**
 * Comissão de um serviço (ou de um grupo, passando os totais do grupo).
 *
 *   fixo = price × rate
 *   sem modelo de margem, sem referência, ou margem não calculável -> fixo
 *   margem <= 0                                                     -> 0
 *   caso contrário  taxa = min(rate × margem/referência, rate)
 *
 * O `min` é o tecto: margem acima da referência nunca paga mais do que o modelo fixo.
 */
export function commissionFor(
  price: number,
  driverPrice: number,
  cfg: CommissionConfig,
  useMargin: boolean,
): number {
  const fixo = price * cfg.rate;
  if (!useMargin) return fixo;
  if (cfg.referenceMargin <= 0) return fixo;

  const margem = marginOf(price, driverPrice, cfg.marginBase);
  if (margem === null) return fixo;
  if (margem <= 0) return 0;

  const taxa = Math.min(cfg.rate * (margem / cfg.referenceMargin), cfg.rate);
  return price * taxa;
}

export type RawService = {
  nr?: number | null;
  clientName?: string | null;
  client?: string | null;
  price?: number | null;
  driverPrice?: number | null;
  timestamp?: Date | string | null;
  usersClient?: { clientKey?: string | null } | null;
};

export type ComputedService = {
  date: Date | string | null;
  nr: number | null;
  client: string | null;
  clientId: string | null;
  price: number;
  driverPrice: number;
  margin: number | null;
  commission: number;
  /** Serviços-perna somados a este, quando houve agrupamento */
  groupedNrs: number[];
};

/**
 * Um serviço composto (ex.: Lisboa->Porto via parceiro) é lançado como vários: o
 * principal leva o preço de venda, as pernas levam só o custo do estafeta com price = 0.
 * A ligação está em `usersClient.clientKey`, onde as pernas guardam o nr do principal.
 *
 * Serviço a serviço a margem não significa nada — o principal aparenta margem enorme e
 * as pernas margem nula. Por isso, no modelo de margem, somam-se os grupos.
 *
 * Guardas do original: a ligação só é aceite se existir mesmo um serviço com esse nr e
 * for do mesmo `clientName`, porque o clientKey é texto livre e referências como
 * `19_CAT_937032126` extraem números que casam com serviços antigos de outros clientes.
 *
 * Nota: agrupa-se dentro do conjunto de serviços recebido. Uma perna cujo principal caia
 * fora do período fica isolada — o original resolve isso ao contar o grupo no mês do
 * principal, que é o que fazemos quando ambos estão presentes.
 */
export function computeServices(
  services: RawService[],
  cfg: CommissionConfig,
  year: number,
  month: number,
): ComputedService[] {
  const useMargin = usesMargin(cfg, year, month);
  const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : 0);

  const base = services.map((s) => ({
    raw: s,
    nr: s.nr ?? null,
    price: num(s.price),
    driverPrice: num(s.driverPrice),
  }));

  // Sem modelo de margem não há agrupamento: cada serviço vale por si.
  if (!useMargin) {
    return base.map((b) => ({
      date:        b.raw.timestamp ?? null,
      nr:          b.nr,
      client:      b.raw.clientName ?? null,
      clientId:    b.raw.client ? String(b.raw.client) : null,
      price:       b.price,
      driverPrice: b.driverPrice,
      margin:      marginOf(b.price, b.driverPrice, cfg.marginBase),
      commission:  commissionFor(b.price, b.driverPrice, cfg, false),
      groupedNrs:  [],
    }));
  }

  const byNr = new Map<number, typeof base[number]>();
  for (const b of base) if (b.nr != null) byNr.set(b.nr, b);

  // perna -> nr do principal (com as guardas do original)
  const parentOf = new Map<typeof base[number], typeof base[number]>();
  for (const b of base) {
    const key = b.raw.usersClient?.clientKey;
    if (!key || typeof key !== 'string') continue;
    for (const m of key.match(/\d+/g) ?? []) {
      const cand = byNr.get(Number(m));
      if (!cand || cand === b) continue;
      if ((cand.raw.clientName ?? null) !== (b.raw.clientName ?? null)) continue; // mesma cliente
      parentOf.set(b, cand);
      break;
    }
  }

  // Agrupar: o principal é o de maior price
  const groups = new Map<typeof base[number], typeof base[number][]>();
  for (const b of base) {
    let head = parentOf.get(b) ?? b;
    // uma perna pode apontar para outra perna
    for (let i = 0; i < 5 && parentOf.has(head); i++) head = parentOf.get(head)!;
    const members = groups.get(head) ?? [];
    members.push(b);
    groups.set(head, members);
  }

  const out: ComputedService[] = [];
  for (const [head, members] of groups) {
    const principal = members.reduce((a, b) => (b.price > a.price ? b : a), head);
    const price = members.reduce((t, m) => t + m.price, 0);
    const driverPrice = members.reduce((t, m) => t + m.driverPrice, 0);
    out.push({
      date:        principal.raw.timestamp ?? null,   // o grupo conta no mês do principal
      nr:          principal.nr,
      client:      principal.raw.clientName ?? null,
      clientId:    principal.raw.client ? String(principal.raw.client) : null,
      price,
      driverPrice,
      margin:      marginOf(price, driverPrice, cfg.marginBase),
      commission:  commissionFor(price, driverPrice, cfg, true),
      groupedNrs:  members.filter((m) => m !== principal).map((m) => m.nr).filter((n): n is number => n != null),
    });
  }

  return out;
}
