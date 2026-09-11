/**
 * A escala de cor do mapa.
 *
 * Está aqui, fora do componente, porque é a única parte do mapa onde um erro não se vê:
 * um desenho partido nota-se ao abrir a página, mas uma escala mal calculada pinta um
 * mapa bonito que diz a coisa errada — e ninguém desconfia de um mapa bonito.
 */

/** Quantos tons tem a escala, sem contar o vazio. */
export const DEGRAUS = 5;

/**
 * Em que degrau (0 a 4) cai um valor, ou -1 se for zero.
 *
 * **Relativa ao máximo e não a limiares fixos.** Dois parceiros num distrito querem dizer
 * coisas diferentes conforme o total do país sejam três ou trezentos; uma escala fixa ou
 * saturava tudo à medida que a rede cresce, ou deixava tudo pálido no princípio.
 *
 * **O zero sai da escala.** Um distrito sem ninguém não é "pouco": é o que interessa ver,
 * e o mapa desenha-o vazado. Confundi-lo com o degrau mais fraco era esconder
 * precisamente a informação que se foi lá procurar.
 *
 * O menor valor não nulo fica sempre no degrau 0 e o maior sempre no 4, para a escala usar
 * toda a gama que tem, seja o máximo dois ou duzentos.
 */
export function degrau(valor: number, maximo: number): number {
  if (!(valor > 0)) return -1;
  if (!(maximo > 1)) return DEGRAUS - 1;
  const fraccao = (Math.min(valor, maximo) - 1) / (maximo - 1);
  return Math.max(0, Math.min(DEGRAUS - 1, Math.round(fraccao * (DEGRAUS - 1))));
}
