import type { CrmCapability, CrmCategoria, CrmConsultaPedido, CrmPartner } from '@/types/crm';

/**
 * "Quem pode fazer isto?" — spec §7.
 *
 * A spec chama a esta a peça mais crítica do sistema, e a razão é a latência: a
 * operadora tem o cliente à espera. O desenho é por isso deliberadamente simples —
 * um índice por `categoria` traz as linhas candidatas (dezenas, não milhares) e o
 * cruzamento com as restrições faz-se em memória, com uma função pura que se pode
 * testar sem base de dados.
 *
 * A alternativa, meter tudo em `$and`/`$or` no Mongo, é mais rápida no papel e bem pior
 * na prática: uma restrição mal traduzida em query é invisível, e aqui um falso
 * positivo manda uma carga ADR para quem não tem certificação.
 */

export interface RequisitosServico {
  categoria: CrmCategoria;
  zona?: string;              // distrito da recolha, minúsculas
  weightKg?: number | null;
  totalCm?: number | null;
  adr?: boolean;              // o serviço exige certificação ADR
  temperatura?: boolean;      // o serviço exige cadeia de frio
  viatura?: string;
}

export interface MotivoExclusao {
  partnerId: string;
  motivo: string;
}

export interface ParceiroElegivel {
  parceiro: CrmPartner;
  capacidade: CrmCapability;
  /** Ordem de entrada: menor entra primeiro. Ver `ordenar()`. */
  rank: number;
}

const ZONA_TUDO = 'nacional';

/**
 * A capacidade cobre o serviço?
 *
 * Um limite ausente ou a `null` é "sem limite" — nunca "zero". A distinção interessa:
 * uma capacidade recém-criada sem `maxWeightKg` tem de aceitar tudo, e não recusar tudo.
 */
export function capacidadeServe(cap: CrmCapability, req: RequisitosServico): { serve: boolean; motivo: string } {
  if (!cap.active) return { serve: false, motivo: 'capacidade inactiva' };
  if (cap.categoria !== req.categoria) return { serve: false, motivo: 'categoria diferente' };

  const zonas = (cap.zonas ?? []).map((z) => z.toLowerCase());
  const zona = (req.zona ?? '').toLowerCase();
  if (zonas.length && !zonas.includes(ZONA_TUDO)) {
    if (!zona) return { serve: false, motivo: 'zona do serviço desconhecida e parceiro não é nacional' };
    if (!zonas.includes(zona)) return { serve: false, motivo: `não cobre ${zona}` };
  }

  const kg = numero(req.weightKg);
  if (kg !== null && numero(cap.maxWeightKg) !== null && kg > (cap.maxWeightKg as number)) {
    return { serve: false, motivo: `${kg} kg acima do máximo do parceiro (${cap.maxWeightKg} kg)` };
  }

  const cm = numero(req.totalCm);
  if (cm !== null && numero(cap.maxDimensionCm) !== null && cm > (cap.maxDimensionCm as number)) {
    return { serve: false, motivo: `${cm} cm acima do máximo do parceiro (${cap.maxDimensionCm} cm)` };
  }

  if (req.adr && !cap.adr) return { serve: false, motivo: 'sem certificação ADR' };
  if (req.temperatura && !cap.temperatura) return { serve: false, motivo: 'sem cadeia de frio' };

  const tipos = (cap.tiposViatura ?? []).map((t) => t.toLowerCase());
  if (tipos.length && req.viatura && !tipos.includes(req.viatura.toLowerCase())) {
    return { serve: false, motivo: `não faz ${req.viatura}` };
  }

  return { serve: true, motivo: 'cobre o pedido' };
}

/**
 * Ordem de entrada dos parceiros elegíveis.
 *
 * O mecanismo de controlo real da spec (§6.5) é a torneira de leads: quem colabora
 * sobe e recebe mais. O score entra aqui à frente da prioridade manual precisamente
 * para que isso aconteça sozinho, sem ninguém ter de reordenar listas à mão.
 */
export function ordenar(elegiveis: ParceiroElegivel[]): ParceiroElegivel[] {
  const pesoEstado: Record<string, number> = { ativo: 0, trial: 1, prospect: 2, suspenso: 9 };
  return [...elegiveis].sort((a, b) => {
    const e = (pesoEstado[a.parceiro.estado] ?? 5) - (pesoEstado[b.parceiro.estado] ?? 5);
    if (e !== 0) return e;
    const s = (b.parceiro.score ?? 0) - (a.parceiro.score ?? 0);
    if (s !== 0) return s;
    return (a.capacidade.prioridade ?? 0) - (b.capacidade.prioridade ?? 0);
  }).map((x, i) => ({ ...x, rank: i }));
}

/** Requisitos derivados de um pedido — a categoria já vem da triagem. */
export function requisitosDoPedido(categoria: CrmCategoria, pedido: CrmConsultaPedido): RequisitosServico {
  return {
    categoria,
    zona: pedido.zona,
    weightKg: pedido.weightKg ?? null,
    totalCm: pedido.totalCm ?? null,
    adr: categoria === 'adr',
    temperatura: categoria === 'temperatura',
    viatura: pedido.viatura,
  };
}

function numero(v: unknown): number | null {
  return typeof v === 'number' && isFinite(v) && v > 0 ? v : null;
}
