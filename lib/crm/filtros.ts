import type { CrmCapability, CrmPartner, DimensaoParceiro } from '@/types/crm';
import { podeReceberLeads } from './angariacao.ts';
import { ZONA_NACIONAL, zonasEfectivas } from './zonas.ts';

/**
 * Filtrar, ordenar e contar parceiros.
 *
 * Puro: nao toca na base de dados, e testa-se sem ela. Os imports levam a extensao
 * `.ts` de proposito — e o que o `npm test` precisa para os resolver, e o `tsconfig` tem
 * `allowImportingTsExtensions` por causa disso.
 *
 * **Porque é que isto acontece em memória e não no Mongo.** A zona que um parceiro cobre
 * não está num campo só: uma capacidade sem zonas herda as do parceiro, e um parceiro sem
 * zonas é nacional (ver lib/crm/zonas.ts). Escrever essa herança numa consulta de Mongo 3.0
 * dava uma agregação que ninguém voltaria a perceber — e com as centenas de parceiros de
 * que falamos, filtrar em memória custa milissegundos e mantém a regra num sítio só, com
 * testes.
 *
 * Se um dia forem milhares, o que muda é desnormalizar as zonas efectivas para o documento
 * do parceiro e filtrar lá. A regra continua a ser esta.
 */

export const DIMENSOES: { id: DimensaoParceiro; label: string; nota: string }[] = [
  { id: 'individual', label: 'Só o próprio', nota: 'Uma pessoa, uma viatura.' },
  { id: 'micro',      label: '2 a 5',        nota: 'Empresa familiar ou equipa pequena.' },
  { id: 'pequena',    label: '6 a 20',       nota: 'Aguenta vários serviços em paralelo.' },
  { id: 'media',      label: '21 a 50',      nota: 'Frota e operação própria.' },
  { id: 'grande',     label: 'Mais de 50',   nota: 'Cobertura larga, estrutura montada.' },
];

/** Os ids, para validar o que chega de fora. */
export const DIMENSAO_IDS: readonly string[] = DIMENSOES.map((d) => d.id);

/**
 * O escalao que veio de um formulario, ou nada.
 *
 * Devolve `undefined` em vez de um valor por omissao de proposito: "nao disse" e uma
 * informacao diferente de "e pequena", e a lista mostra-as de maneira diferente.
 */
export function limparDimensao(v: unknown): DimensaoParceiro | undefined {
  const s = String(v ?? '').trim().toLowerCase();
  return DIMENSAO_IDS.includes(s) ? (s as DimensaoParceiro) : undefined;
}

/** Viaturas: um inteiro nao negativo, ou nada. Um numero absurdo e erro de digitacao. */
export function limparViaturas(v: unknown): number | undefined {
  if (v === '' || v === null || v === undefined) return undefined;
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 0 && n <= 9999 ? n : undefined;
}

export const ORDENS = ['nome', 'score', 'saldo', 'contacto', 'dimensao'] as const;
export type Ordem = typeof ORDENS[number];

/** Um parceiro com o que foi preciso ir buscar noutras colecções para o filtrar. */
export interface ParceiroListado {
  parceiro: CrmPartner & { saldo?: number; ultimoContactoEm?: Date | string | null };
  capacidades: CrmCapability[];
}

export interface Filtros {
  q?: string;
  estados?: string[];
  zonas?: string[];
  categorias?: string[];
  dimensoes?: string[];
  atribuidoA?: string;
  /** Só quem está em condições de receber uma lead agora. */
  activos?: boolean;
  /** Só quem tem saldo ou leads de trial por gastar. */
  comSaldo?: boolean;
  /**
   * Cobre a zona filtrada mas não recebe leads.
   *
   * É a lista de telefonemas de cinco minutos que desbloqueia receita sem angariar
   * ninguém: gente que já disse que faz aquilo naquela zona e está parada por saldo,
   * suspensão ou capacidade por activar.
   */
  paradosNaZona?: boolean;
}

/**
 * As zonas que um parceiro cobre, contando a herança.
 *
 * Junta as zonas de todas as capacidades activas com as do próprio parceiro. Uma
 * capacidade sem zonas usa as do parceiro; sem nenhumas dos dois lados, é nacional.
 */
export function zonasDoParceiro(p: Pick<CrmPartner, 'zonas'>, caps: CrmCapability[]): string[] {
  const activas = caps.filter((c) => c.active !== false);
  const todas = new Set<string>();

  for (const c of activas) for (const z of zonasEfectivas(c.zonas, p.zonas)) todas.add(z);
  // Sem capacidades activas, vale o que o parceiro declarou na ficha — é o que a
  // angariação preenche antes de haver capacidades nenhumas.
  if (!activas.length) for (const z of zonasEfectivas([], p.zonas)) todas.add(z);

  return [...todas];
}

/** As categorias que ele declara, só das capacidades activas. */
export function categoriasDoParceiro(caps: CrmCapability[]): string[] {
  return [...new Set(caps.filter((c) => c.active !== false).map((c) => c.categoria))];
}

/** `nacional` cobre tudo — é o que faz um parceiro sem zonas aparecer em qualquer sítio. */
export function cobreZona(zonas: string[], zona: string): boolean {
  return zonas.includes(ZONA_NACIONAL) || zonas.includes(zona);
}

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Tem com que trabalhar: saldo, ou leads de trial por gastar. */
export function temComQueTrabalhar(p: ParceiroListado['parceiro']): boolean {
  return (p.saldo ?? 0) > 0 || (p.leadsGratisRestantes ?? 0) > 0;
}

export function aplicarFiltros(itens: ParceiroListado[], f: Filtros): ParceiroListado[] {
  const q = f.q ? normalizar(f.q) : '';

  return itens.filter(({ parceiro: p, capacidades }) => {
    if (q) {
      // As notas entram na procura. E o campo onde cabe o que nao tem coluna — "plataforma
      // elevatoria", "armazem em Alverca", "faz Lisboa-Porto" — e sem isto so se podia
      // procurar por nome e NIF, que e o que ja se sabe antes de procurar.
      const alvo = normalizar([p.nome, p.nif, p.contacto, p.email, p.morada, p.notas].filter(Boolean).join(' '));
      if (!alvo.includes(q)) return false;
    }
    if (f.estados?.length && !f.estados.includes(p.estado)) return false;
    if (f.dimensoes?.length && !f.dimensoes.includes(p.dimensao ?? '')) return false;
    if (f.atribuidoA && p.atribuidoA !== f.atribuidoA) return false;

    if (f.activos && !podeReceberLeads(p.estado)) return false;
    if (f.comSaldo && !temComQueTrabalhar(p)) return false;

    if (f.categorias?.length) {
      const suas = categoriasDoParceiro(capacidades);
      if (!f.categorias.some((c) => suas.includes(c))) return false;
    }

    if (f.zonas?.length) {
      const suas = zonasDoParceiro(p, capacidades);
      if (!f.zonas.some((z) => cobreZona(suas, z))) return false;
    }

    // Este filtro é o inverso dos outros: quer precisamente quem NÃO está a receber.
    if (f.paradosNaZona && (podeReceberLeads(p.estado) && temComQueTrabalhar(p))) return false;

    return true;
  });
}

const PESO_DIMENSAO: Record<string, number> = {
  individual: 1, micro: 2, pequena: 3, media: 4, grande: 5,
};

export function ordenar(itens: ParceiroListado[], ordem: Ordem = 'nome'): ParceiroListado[] {
  const data = (v: unknown) => (v ? new Date(v as string).getTime() : 0);

  return [...itens].sort((a, b) => {
    const x = a.parceiro, y = b.parceiro;
    switch (ordem) {
      case 'score':    return (y.score ?? 0) - (x.score ?? 0);
      case 'saldo':    return (y.saldo ?? 0) - (x.saldo ?? 0);
      // Mais antigo primeiro: a fila de trabalho é de quem está esquecido há mais tempo.
      case 'contacto': return data(x.ultimoContactoEm) - data(y.ultimoContactoEm);
      case 'dimensao': return (PESO_DIMENSAO[y.dimensao ?? ''] ?? 0) - (PESO_DIMENSAO[x.dimensao ?? ''] ?? 0);
      default:         return String(x.nome ?? '').localeCompare(String(y.nome ?? ''), 'pt');
    }
  });
}

/**
 * Quantos parceiros cobrem cada distrito — o que pinta o mapa.
 *
 * Quem é nacional conta para todos os distritos: é a verdade operacional, porque uma lead
 * de qualquer sítio pode mesmo ir para ele.
 */
export function contarPorDistrito(itens: ParceiroListado[], distritos: readonly string[]): Record<string, number> {
  const conta: Record<string, number> = {};
  for (const d of distritos) conta[d] = 0;

  for (const { parceiro, capacidades } of itens) {
    const zonas = zonasDoParceiro(parceiro, capacidades);
    if (zonas.includes(ZONA_NACIONAL)) {
      for (const d of distritos) conta[d]++;
    } else {
      for (const z of zonas) if (z in conta) conta[z]++;
    }
  }
  return conta;
}
