// ============================================================================
// Valor de conversão reportado ao Google Ads.
//
// Não é receita — é uma escala de qualidade relativa. O preço cotado a uma lead
// não serve para aqui: é uma cotação, não uma venda, e a maioria não fecha.
// Enviar 47,50 € numas linhas e 0,00 € noutras ensinaria o algoritmo a perseguir
// orçamentos grandes em vez de negócio fechado.
//
// O que estes números dizem ao Google é "esta conversão vale o dobro daquela".
// Com "Maximizar Conversões" o valor é ignorado hoje; fica registado à mesma para
// que, com histórico suficiente, se possa passar a "Maximizar valor de conversões"
// sem ter de reenviar nada.
// ============================================================================

export type ConversionKind =
  /** Quiz concluído: lead registada, com todos os dados. */
  | 'lead'
  /** Quiz abandonado a meio, mas deixou telefone (e quase sempre nome). */
  | 'parcial_telefone'
  /** Quiz abandonado a meio, deixou apenas email. */
  | 'parcial_email';

/**
 * Telefone vale mais do que email num serviço de transporte urgente: quem deixa
 * número quer resposta hoje, quem deixa email está a sondar. A proporção 1 : 0,5 : 0,3
 * reflecte isso sem excluir ninguém da contagem.
 */
export const CONVERSION_VALUE: Record<ConversionKind, number> = {
  lead: 1.0,
  parcial_telefone: 0.5,
  parcial_email: 0.3,
};

export const CONVERSION_CURRENCY = 'EUR';
