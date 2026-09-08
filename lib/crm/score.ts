/**
 * Score do parceiro (spec §6.5).
 *
 * Não serve para relatórios bonitos: serve para abrir e fechar a torneira de leads. É o
 * único mecanismo de controlo que a spec considera real — "o custo é imediato e sentido
 * no bolso" — e é ele que ordena a fila em lib/crm/capacidades.ts.
 *
 * Sem imports de runtime, de propósito: é a condição para ser testado sem Mongo. Quem
 * vai à base buscar as métricas é lib/crm/outcomes.ts.
 */

export interface PesosScore {
  reporte: number;
  recusa: number;
  cliente: number;
  resposta: number;
}

export interface Metricas {
  leadsRecebidas: number;
  reportadas: number;
  recusas: number;
  /**
   * Recusas que o cliente contradisse: o parceiro contestou a lead e o cliente, 48h
   * depois, disse que o transporte ficou resolvido.
   *
   * Contam a dobrar na parcela da recusa. Não é uma acusação — o cliente pode ter
   * resolvido com outra empresa qualquer, e por isso nada é cobrado automaticamente.
   * É uma contagem: quem o faz uma vez tem uma explicação, quem o faz cinco vezes
   * deixa de receber leads. A plataforma acredita à primeira e conta as vezes.
   */
  recusasContraditas: number;
  ganhos: number;
  avaliacaoMedia: number | null;
  respostaMediaMinutos: number | null;
}

export interface ResultadoScore extends Metricas {
  score: number;
  /** Cada parcela em bruto, para o dashboard poder explicar o número. */
  parcelas: PesosScore;
}

/** Um parceiro sem histórico: nem prémio nem castigo, para não nascer no fundo da fila. */
export const SCORE_SEM_HISTORICO = 50;

/**
 * Score de 0 a 100 a partir das três fontes.
 *
 * Os pesos são a questão em aberto da spec §13 e vivem em `crm_config` — vão mudar
 * quando houver dados reais. O que está fixo aqui é a forma:
 *
 *   reporte   quanto do que recebeu foi reportado. É o comportamento que a plataforma
 *             quer comprar, e o que a spec troca pelas leads grátis do trial.
 *   recusa    proporção de leads contestadas, invertida, com as contraditas a pesar
 *             a dobrar. Muitas recusas tanto podem ser leads más como um parceiro a
 *             fugir à factura; de qualquer forma, desce.
 *   cliente   avaliação média do follow-up, normalizada de 1-5 para 0-1.
 *   resposta  rapidez a agir, medida pelos timestamps dos envios.
 *
 * Sem avaliação do cliente ou sem tempos de resposta, essas parcelas ficam no meio
 * (0,5) — não se pune quem ainda não teve oportunidade de ser avaliado.
 */
export function calcularScore(m: Metricas, pesos: PesosScore): ResultadoScore {
  if (m.leadsRecebidas === 0) {
    return { ...m, score: SCORE_SEM_HISTORICO, parcelas: { reporte: 0, recusa: 0, cliente: 0, resposta: 0 } };
  }

  const reporte = clamp(m.reportadas / m.leadsRecebidas);
  const recusa = clamp(1 - (m.recusas + m.recusasContraditas) / m.leadsRecebidas);
  const cliente = m.avaliacaoMedia === null ? 0.5 : clamp((m.avaliacaoMedia - 1) / 4);
  // Uma hora a responder é o alvo; a partir de 24h a parcela é zero.
  const resposta = m.respostaMediaMinutos === null
    ? 0.5
    : clamp(1 - Math.max(0, m.respostaMediaMinutos - 60) / (24 * 60 - 60));

  const parcelas: PesosScore = {
    reporte: reporte * pesos.reporte,
    recusa: recusa * pesos.recusa,
    cliente: cliente * pesos.cliente,
    resposta: resposta * pesos.resposta,
  };

  const total = parcelas.reporte + parcelas.recusa + parcelas.cliente + parcelas.resposta;
  const somaPesos = pesos.reporte + pesos.recusa + pesos.cliente + pesos.resposta;

  return { ...m, score: Math.round((total / (somaPesos || 1)) * 100), parcelas };
}

function clamp(v: number): number {
  return Math.max(0, Math.min(1, isFinite(v) ? v : 0));
}
