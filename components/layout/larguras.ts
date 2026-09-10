/**
 * Largura util do conteudo das paginas do dashboard.
 *
 * Cada pagina tinha o seu limite escrito a mao — 900 aqui, 1100 ali — herdados de quando
 * o ecra de referencia era mais estreito. Num monitor de 1920 sobravam varias centenas de
 * pixeis a direita das tabelas, que e onde ha mais falta deles.
 *
 * Continua a haver um tecto: numa linha de texto muito comprida o olho perde o inicio da
 * seguinte, e num ultrawide sem limite as colunas de uma tabela afastam-se ao ponto de
 * deixar de se ler uma linha inteira. 1600 chega ao fim do ecra nos monitores normais e
 * trava nos grandes.
 *
 * Paragrafos de texto corrido devem continuar a levar o seu proprio maxWidth mais curto,
 * independentemente deste.
 */
export const LARGURA_CONTEUDO = 1600;
