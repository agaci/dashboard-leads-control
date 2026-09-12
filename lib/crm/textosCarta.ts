import { esc } from '../html.ts';

/**
 * O texto das cartas de apresentação, escrito pela gerente de conta.
 *
 * Até aqui a abertura de cada carta estava em código (lib/crm/apresentacao.ts) e mudá-la
 * era um deploy. Passa a viver na base de dados, editável no dashboard — mas só as três
 * partes onde se ganha ou perde o leitor: o assunto, a abertura, e os parágrafos do
 * "somos a YourBox". Os quatro passos do "como funciona", o fecho e o rodapé continuam
 * em código, porque são a substância da proposta e a parte de RGPD: o ganho de os editar
 * é pequeno e o risco de alguém prometer o que não fazemos não é.
 *
 * **A sintaxe é fechada de propósito, e nenhuma parte dela é HTML.** O texto escrito aqui
 * vai para dentro de um email; deixá-lo passar em cru significava que uma aspa mal posta
 * partia a carta e que uma etiqueta mal-intencionada ia inteira. Há três coisas, e só
 * estas:
 *
 *   {categoria}          uma variável, substituída pelo valor do formulário
 *   **negrito**          fica a negrito
 *   [texto com {campo}]  desaparece inteiro se o campo lá dentro estiver vazio
 *
 * O terceiro é o que resolve a única optativa real — "cerca de 4 por mês", que não se
 * escreve quando não há número. Antes isso era um `if` no código; agora vê-se na frase.
 *
 * **E há uma vantagem que não se vê à primeira.** O código costurava fragmentos de frase,
 * e foi assim que saiu "quem fizesse DE mudanças" — só encontrado a ler o email já
 * renderizado. Quem escreve a frase inteira vê a preposição, e essa classe de erro deixa
 * de existir.
 *
 * Sem imports de runtime, para poder ser testado sem base de dados.
 */

/** As variáveis que uma carta pode usar. O que não estiver aqui não passa na validação. */
export const CAMPOS_CARTA = ['categoria', 'zona', 'pedidos', 'pessoa', 'quemIndicou'] as const;
export type CampoCarta = typeof CAMPOS_CARTA[number];

export const ROTULO_CAMPO: Record<CampoCarta, string> = {
  categoria: 'Categoria',
  zona: 'Zona',
  pedidos: 'Pedidos por mês',
  pessoa: 'Pessoa com quem se falou',
  quemIndicou: 'Quem indicou',
};

export interface TextoCarta {
  assunto: string;
  abertura: string;
  /** Os parágrafos a seguir à abertura. Um por posição. */
  oQueE: string[];
}

const RE_CAMPO = /\{([a-zA-Z]+)\}/g;
const RE_BLOCO = /\[([^\[\]]*)\]/g;

function vazio(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  const s = String(v).trim();
  return s === '' || s === '0';
}

/**
 * Que variáveis um texto usa, e quais delas são indispensáveis.
 *
 * **O texto declara os seus próprios campos obrigatórios**, em vez de haver uma lista à
 * parte: uma variável dentro de `[...]` é opcional, fora é obrigatória. Assim o formulário
 * pede exactamente o que a frase precisa, e não pode divergir dela — que é o que acontece
 * quando as duas coisas se escrevem em sítios diferentes.
 */
export function camposUsados(...textos: string[]): { obrigatorios: CampoCarta[]; opcionais: CampoCarta[] } {
  const obrig = new Set<string>();
  const opc = new Set<string>();

  for (const texto of textos) {
    const t = String(texto ?? '');
    for (const bloco of t.matchAll(RE_BLOCO)) {
      for (const m of bloco[1].matchAll(RE_CAMPO)) opc.add(m[1]);
    }
    // Fora dos blocos: o que sobra depois de os tirar.
    for (const m of t.replace(RE_BLOCO, ' ').matchAll(RE_CAMPO)) obrig.add(m[1]);
  }

  const conhecido = (c: string): c is CampoCarta => (CAMPOS_CARTA as readonly string[]).includes(c);
  return {
    obrigatorios: [...obrig].filter(conhecido),
    // Uma variável obrigatória noutra frase manda: é pedida na mesma.
    opcionais: [...opc].filter(conhecido).filter((c) => !obrig.has(c)),
  };
}

/**
 * O texto pronto para ir no email.
 *
 * A ordem das operações não é arbitrária. Escapa-se **primeiro** o texto do molde e só
 * depois se produz marcação, senão um `<b>` escrito no editor saía como marcação a sério.
 * E os valores entram **no fim**, já escapados: se entrassem antes, um valor com `**` à
 * volta ficava a negrito — a marcação passaria a ser decidida por quem preenche o
 * formulário, e não por quem escreveu a carta.
 */
export function renderizar(texto: string, valores: Record<string, unknown>): string {
  let s = esc(String(texto ?? ''));

  // 1. Blocos opcionais: caem inteiros se faltar alguma variável lá dentro.
  s = s.replace(RE_BLOCO, (_todo, dentro: string) => {
    const campos = [...dentro.matchAll(RE_CAMPO)].map((m) => m[1]);
    return campos.some((c) => vazio(valores[c])) ? '' : dentro;
  });

  // 2. Negrito.
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // 3. Valores, já escapados. Uma variável desconhecida desaparece em vez de ir escrita
  //    para o email — a validação já a devia ter travado na gravação.
  s = s.replace(RE_CAMPO, (_todo, campo: string) => {
    const v = valores[campo];
    return vazio(v) ? '' : esc(v);
  });

  return s.replace(/[ \t]{2,}/g, ' ').trim();
}

/**
 * O texto é gravável?
 *
 * Corre na gravação e não no envio: um erro aqui só se notaria na carta seguinte que
 * alguém mandasse, provavelmente já a um parceiro a sério.
 */
export function validarTexto(t: Partial<TextoCarta>): { ok: boolean; erro?: string } {
  const assunto = String(t.assunto ?? '').trim();
  const abertura = String(t.abertura ?? '').trim();
  if (!assunto) return { ok: false, erro: 'o assunto não pode ficar vazio' };
  if (assunto.length > 120) return { ok: false, erro: 'o assunto é longo de mais: corte para 120 caracteres' };
  if (!abertura) return { ok: false, erro: 'a abertura não pode ficar vazia' };

  const todos = [assunto, abertura, ...(t.oQueE ?? [])];

  for (const texto of todos) {
    const s = String(texto ?? '');

    for (const m of s.matchAll(RE_CAMPO)) {
      if (!(CAMPOS_CARTA as readonly string[]).includes(m[1])) {
        return { ok: false, erro: `a variável {${m[1]}} não existe. Disponíveis: ${CAMPOS_CARTA.map((c) => `{${c}}`).join(', ')}` };
      }
    }

    // Parênteses rectos por fechar deixavam um "[" a ir para o email.
    const abre = (s.match(/\[/g) ?? []).length;
    const fecha = (s.match(/\]/g) ?? []).length;
    if (abre !== fecha) return { ok: false, erro: 'há um [ ou um ] a mais: cada bloco opcional abre e fecha' };
    if (/\[[^\]]*\[/.test(s)) return { ok: false, erro: 'blocos opcionais dentro de blocos opcionais não são suportados' };

    if ((s.match(/\*\*/g) ?? []).length % 2 !== 0) {
      return { ok: false, erro: 'há um ** por fechar: o negrito abre e fecha com dois asteriscos' };
    }
  }

  // O assunto vai no cabeçalho do email, onde não há marcação nenhuma.
  if (/\*\*/.test(assunto)) return { ok: false, erro: 'o assunto não leva negrito' };

  return { ok: true };
}

/**
 * A versão seguinte de um rótulo de versão.
 *
 * Os rótulos são `contexto-v1`, `contexto-v2`. Ficam guardados no registo de cada envio,
 * e é por eles que se sabe, daqui a meio ano, qual das versões é que aquela empresa
 * recebeu — sem isso, quando alguém responder a citar a carta, ninguém sabe ao que está
 * a responder.
 */
export function proximaVersao(actual: string, variante: string): string {
  const m = /-v(\d+)$/.exec(String(actual ?? ''));
  return `${variante}-v${m ? Number(m[1]) + 1 : 2}`;
}
