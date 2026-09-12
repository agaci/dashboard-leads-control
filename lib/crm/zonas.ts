/**
 * Zonas de serviço.
 *
 * Uma zona é o que cruza a morada de recolha de uma lead com a área que um parceiro
 * cobre. Se os dois lados não escreverem a mesma coisa, o cruzamento nunca acontece e
 * ninguém percebe porquê — a lead simplesmente não encontra parceiro.
 *
 * Foi o que aconteceu até 09/09/2026: a zona era extraída como o PRIMEIRO segmento da
 * morada, e o primeiro segmento de "Rua das Flores 12, Lisboa, Portugal" é a rua. Ficava
 * gravado `rua das flores 12` como zona. Só não deu problema porque o único parceiro
 * cobria o país inteiro; qualquer parceiro com zona declarada nunca teria recebido nada.
 *
 * Sem imports de runtime, para poder ser testado sem base de dados.
 */

/** Distritos e regiões autónomas, sem acentos e em minúsculas — como saem de `normalizar()`. */
export const DISTRITOS = [
  'aveiro', 'beja', 'braga', 'braganca', 'castelo branco', 'coimbra', 'evora', 'faro',
  'guarda', 'leiria', 'lisboa', 'portalegre', 'porto', 'santarem', 'setubal',
  'viana do castelo', 'vila real', 'viseu', 'acores', 'madeira',
] as const;

/** Cobre tudo. É o valor por omissão de uma capacidade sem zonas declaradas. */
export const ZONA_NACIONAL = 'nacional';

/**
 * Como se escreve cada zona quando se mostra a alguém.
 *
 * Os slugs são minúsculos e sem acentos porque é assim que se cruzam com a morada de uma
 * lead — e é assim que têm de continuar. Mas mostrá-los tal e qual dá "Braganca" e
 * "Evora", e com `text-transform: capitalize` dá "Viana Do Castelo" e "Todo O País", que
 * ninguém escreve.
 *
 * A tabela é por isso só de apresentação: nada aqui entra numa comparação.
 */
export const NOME_ZONA: Record<string, string> = {
  nacional: 'todo o país',
  aveiro: 'Aveiro',
  beja: 'Beja',
  braga: 'Braga',
  braganca: 'Bragança',
  'castelo branco': 'Castelo Branco',
  coimbra: 'Coimbra',
  evora: 'Évora',
  faro: 'Faro',
  guarda: 'Guarda',
  leiria: 'Leiria',
  lisboa: 'Lisboa',
  portalegre: 'Portalegre',
  porto: 'Porto',
  santarem: 'Santarém',
  setubal: 'Setúbal',
  'viana do castelo': 'Viana do Castelo',
  'vila real': 'Vila Real',
  viseu: 'Viseu',
  acores: 'Açores',
  madeira: 'Madeira',
};

/**
 * O nome de uma zona para mostrar.
 *
 * Uma zona escrita à mão — um concelho, uma ilha — não está na tabela e devolve-se como
 * está: é melhor mostrar "amora" do que inventar.
 */
export function nomeZona(zona: string): string {
  return NOME_ZONA[zona] ?? zona;
}

/** Vários de uma vez, pela ordem em que vieram. */
export function nomesZonas(zonas: readonly string[]): string {
  return zonas.map(nomeZona).join(', ');
}

/**
 * As zonas que uma capacidade grava, a partir do que veio de um formulário.
 *
 * Está aqui, e não dentro de uma rota, porque é uma **decisão de significado** e não uma
 * limpeza: decide o que quer dizer uma lista vazia. E foi por estar escrita duas vezes
 * que as duas rotas ficaram a discordar — o POST guardava `[]`, o PUT convertia `[]` em
 * `['nacional']`, e uma capacidade que passasse pelo segundo ficava presa a "todo o país"
 * para sempre. A partir daí as zonas da ficha do parceiro não tinham efeito nenhum, e
 * quem as editasse via-as gravadas e via a lista continuar a dizer outra coisa.
 *
 * **Vazio quer dizer "as da ficha do parceiro".** Para declarar cobertura nacional na
 * própria capacidade, manda-se `['nacional']` — que é uma afirmação diferente, e é a
 * única que ignora a ficha.
 */
export function zonasDeCapacidade(entrada: unknown): string[] {
  if (!Array.isArray(entrada)) return [];
  return entrada.map((z) => limparZona(String(z))).filter(Boolean);
}

export type Zona = string;

/** Minúsculas sem acentos — a mesma normalização que o resto do CRM usa. */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Zona de uma morada.
 *
 * Procura um distrito conhecido em qualquer parte da morada — é a única forma fiável,
 * porque as moradas do Google vêm como "Rua X nº, Localidade, Portugal" e a posição do
 * distrito varia. Quando não há distrito reconhecível (é o caso de "2565-647 Ramalhal",
 * onde a localidade não dá o distrito sem tabela de códigos postais), fica a localidade:
 * é melhor do que a rua, e a operadora consegue corrigir.
 *
 * Devolve `undefined` para morada vazia — e aí a distribuição só encontra parceiros
 * nacionais, que é o comportamento seguro.
 */
export function zonaDeMorada(morada?: string): Zona | undefined {
  const m = normalizar(String(morada ?? ''));
  if (!m) return undefined;

  // Distrito em qualquer posição. Os mais compridos primeiro, senão "viana" apanhava
  // antes de "viana do castelo".
  const porTamanho = [...DISTRITOS].sort((a, b) => b.length - a.length);
  for (const d of porTamanho) {
    if (new RegExp(`(^|[\\s,])${d}([\\s,]|$)`).test(m)) return d;
  }

  // Sem distrito: a localidade é o último segmento útil, ignorando o país e o código
  // postal. Nunca o primeiro — esse é a rua.
  const partes = m.split(',').map((p) => p.trim()).filter(Boolean)
    .filter((p) => p !== 'portugal');
  if (!partes.length) return undefined;

  const ultima = partes[partes.length - 1];
  return ultima.replace(/^\d{4}(-\d{3})?\s*/, '').trim() || undefined;
}

/** Uma zona declarada por uma pessoa: normaliza e valida contra o vocabulário conhecido. */
export function limparZona(v: string): Zona {
  return normalizar(v);
}

/** É um distrito conhecido, ou 'nacional'? Serve para avisar, não para recusar. */
export function zonaConhecida(z: string): boolean {
  const n = normalizar(z);
  return n === ZONA_NACIONAL || (DISTRITOS as readonly string[]).includes(n);
}

/**
 * As zonas que valem para uma capacidade.
 *
 * Uma capacidade sem zonas herda as do parceiro: declara-se a cobertura uma vez na ficha
 * e só se repete quando um serviço específico tem alcance diferente — ADR só no Porto,
 * por exemplo. Sem parceiro nem capacidade a declarar nada, fica `nacional`, que é o
 * comportamento que havia antes de existirem zonas no parceiro.
 */
export function zonasEfectivas(zonasCapacidade?: string[], zonasParceiro?: string[]): Zona[] {
  const cap = (zonasCapacidade ?? []).filter(Boolean);
  if (cap.length) return cap.map(limparZona);
  const par = (zonasParceiro ?? []).filter(Boolean);
  if (par.length) return par.map(limparZona);
  return [ZONA_NACIONAL];
}
