import type { CrmRoute } from '@/types/crm';

/**
 * Máquinas de estado do CRM (spec §8).
 *
 * Regra inviolável nº1 da spec: "nada muda de estado sem registo". A transição e o
 * registo andam juntos de propósito — `transicao()` devolve a entrada de `history` a
 * par do novo estado, e não há forma de obter um sem o outro.
 *
 * O que este módulo NÃO faz é escrever na base: isso é de lib/crm/consultas.ts. Aqui
 * fica só a decisão, sem imports de runtime, para poder ser testada sem Mongo.
 *
 * Os nomes dos estados estão escritos exactamente como na especificação, acentos
 * incluídos, e vivem só aqui: um valor acentuado escrito à mão em dois sítios
 * diferentes é um bug à espera de acontecer.
 */

export const ESTADOS_COMUNS = ['nova', 'triada'] as const;

export const ESTADOS_LEAD_SALE = [
  'qualificada', 'distribuída', 'entregue', 'em_reporte', 'fechada', 'recusada', 'expirada',
] as const;

export const ESTADOS_SUBCONTRACT = [
  'em_cotação', 'proposta_enviada', 'adjudicada', 'em_execução', 'concluída',
] as const;

/** 'falhado' não está na spec: é o que sobra quando o canal recusa o envio. */
export const ESTADOS_DISPATCH = [
  'enviado', 'entregue', 'visto', 'aceite', 'recusado', 'expirado', 'falhado',
] as const;

export type EstadoConsulta =
  | typeof ESTADOS_COMUNS[number]
  | typeof ESTADOS_LEAD_SALE[number]
  | typeof ESTADOS_SUBCONTRACT[number];

export type EstadoDispatch = typeof ESTADOS_DISPATCH[number];

/** Transições legítimas por rota. O que não estiver aqui não acontece. */
const TRANSICOES: Record<CrmRoute, Partial<Record<EstadoConsulta, EstadoConsulta[]>>> = {
  lead_sale: {
    nova:           ['triada'],
    triada:         ['qualificada', 'expirada'],
    qualificada:    ['distribuída', 'expirada'],
    'distribuída':  ['entregue', 'expirada'],
    entregue:       ['em_reporte', 'recusada', 'expirada'],
    em_reporte:     ['fechada', 'recusada', 'expirada'],
    fechada:        [],
    recusada:       ['qualificada'],   // recusa válida devolve a lead ao mercado
    expirada:       [],
  },
  subcontract: {
    nova:               ['triada'],
    triada:             ['em_cotação'],
    'em_cotação':       ['proposta_enviada', 'expirada'],
    proposta_enviada:   ['adjudicada', 'expirada'],
    adjudicada:         ['em_execução'],
    'em_execução':      ['concluída'],
    'concluída':        [],
    expirada:           [],
  },
};

/** Estados a partir dos quais nada mais acontece. */
export const ESTADOS_FINAIS: EstadoConsulta[] = ['fechada', 'expirada', 'concluída'];

export function estadoInicial(): EstadoConsulta {
  return 'nova';
}

export function estadosDaRota(route: CrmRoute): EstadoConsulta[] {
  return route === 'lead_sale'
    ? [...ESTADOS_COMUNS, ...ESTADOS_LEAD_SALE]
    : [...ESTADOS_COMUNS, ...ESTADOS_SUBCONTRACT];
}

export function eEstadoValido(route: CrmRoute, estado: unknown): estado is EstadoConsulta {
  return typeof estado === 'string' && (estadosDaRota(route) as string[]).includes(estado);
}

export function podeTransitar(route: CrmRoute, de: EstadoConsulta, para: EstadoConsulta): boolean {
  return (TRANSICOES[route]?.[de] ?? []).includes(para);
}

export function proximosEstados(route: CrmRoute, de: EstadoConsulta): EstadoConsulta[] {
  return TRANSICOES[route]?.[de] ?? [];
}

export interface Transicao {
  ok: boolean;
  erro?: string;
  entrada?: { estado: EstadoConsulta; timestamp: Date; actor: string; motivo: string };
}

/**
 * Valida uma mudança de estado e produz o registo que a acompanha.
 *
 * O `motivo` é obrigatório porque, sem ele, o `history` fica com a sequência mas sem a
 * explicação — que é a parte que serve para alguma coisa quando se investiga uma lead
 * seis semanas depois.
 */
export function transicao(
  route: CrmRoute,
  de: EstadoConsulta,
  para: EstadoConsulta,
  actor: string,
  motivo: string,
): Transicao {
  if (!eEstadoValido(route, para)) {
    return { ok: false, erro: `estado "${para}" não existe na rota ${route}` };
  }
  if (de === para) {
    return { ok: false, erro: `a consulta já está em "${para}"` };
  }
  if (!podeTransitar(route, de, para)) {
    const possiveis = proximosEstados(route, de);
    return {
      ok: false,
      erro: possiveis.length
        ? `de "${de}" só se pode ir para: ${possiveis.join(', ')}`
        : `"${de}" é um estado final`,
    };
  }
  const texto = motivo.trim();
  if (!texto) {
    return { ok: false, erro: 'motivo obrigatório — nada muda de estado sem registo' };
  }

  return {
    ok: true,
    entrada: { estado: para, timestamp: new Date(), actor: actor || 'sistema', motivo: texto },
  };
}

// ── Dispatch (máquina paralela, spec §8) ─────────────────────────────────────

const TRANSICOES_DISPATCH: Record<EstadoDispatch, EstadoDispatch[]> = {
  enviado:  ['entregue', 'visto', 'aceite', 'recusado', 'expirado', 'falhado'],
  entregue: ['visto', 'aceite', 'recusado', 'expirado'],
  visto:    ['aceite', 'recusado', 'expirado'],
  aceite:   ['recusado'],   // a janela de recusa de 24h abre depois de aceitar
  recusado: [],
  expirado: [],
  falhado:  ['enviado'],    // re-tentativa por outro canal cria outro dispatch; este fica
};

export function podeTransitarDispatch(de: EstadoDispatch, para: EstadoDispatch): boolean {
  return (TRANSICOES_DISPATCH[de] ?? []).includes(para);
}

export function eEstadoDispatchValido(v: unknown): v is EstadoDispatch {
  return typeof v === 'string' && (ESTADOS_DISPATCH as readonly string[]).includes(v);
}
