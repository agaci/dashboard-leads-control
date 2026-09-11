/**
 * As cartas de apresentação — os emails que abrem a conversa com um parceiro.
 *
 * Não são campanhas. São enviadas à mão, uma a uma, por uma gerente de conta que já
 * escolheu aquela empresa por uma razão concreta e muitas vezes já falou com alguém lá.
 * Por isso não se parecem com marketing: parecem o que são, uma empresa a propor trabalho
 * a outra.
 *
 * **Quatro variantes, porque há quatro situações que mudam mesmo o texto.** O miolo — o
 * que é a YourBox, como funciona, o que se paga — é igual em todas: é a substância da
 * proposta e não há razão para variar. O que muda é a abertura, que é onde se ganha ou
 * perde o leitor, e o pedido final.
 *
 * **Versionadas de propósito.** O texto vai copiado para dentro de cada registo de envio.
 * Se uma carta melhorar, o histórico continua a dizer qual das versões é que aquela
 * pessoa recebeu — senão, quando alguém responder a citá-la, ninguém sabe ao que está a
 * responder. Mesmo princípio do guião de consentimento (lib/crm/guiao.ts).
 *
 * Ao mudar um texto: subir a `versao`, nunca reescrever a que existe.
 *
 * Sem imports de runtime, para poder ser testado sem base de dados.
 */

export const VARIANTES_APRESENTACAO = ['contexto', 'generica', 'pos_chamada', 'indicacao'] as const;
export type VarianteApresentacao = typeof VARIANTES_APRESENTACAO[number];

/** Uma variável que a gerente de conta preenche antes de enviar. */
export interface CampoApresentacao {
  id: string;
  label: string;
  /** Sem isto a carta não faz sentido e o envio recusa. */
  obrigatorio: boolean;
  tipo: 'texto' | 'numero';
  exemplo: string;
  nota?: string;
}

export interface MetaApresentacao {
  id: VarianteApresentacao;
  versao: string;
  nome: string;
  /** Quando é que esta é a carta certa. É o que a gerente de conta lê para escolher. */
  quando: string;
  assunto: string;
  campos: CampoApresentacao[];
}

const CAMPO_ASSINATURA: CampoApresentacao = {
  id: 'assinatura', label: 'Quem assina', obrigatorio: true, tipo: 'texto',
  exemplo: 'Ana Carvalho',
  nota: 'O nome da gerente de conta, não "a equipa YourBox". Quem responder, responde a alguém.',
};

export const APRESENTACOES: MetaApresentacao[] = [
  {
    id: 'contexto',
    versao: 'contexto-v1',
    nome: 'Com procura concreta',
    quando: 'Quando o quadro "Por servir" diz a categoria, a zona e quantas leads se perderam. '
      + 'É a mais forte das quatro: fala de trabalho que existe, com números.',
    assunto: 'Temos pedidos de transporte que não conseguimos servir',
    campos: [
      { id: 'categoria', label: 'Categoria', obrigatorio: true, tipo: 'texto', exemplo: 'mudanças',
        nota: 'Como se diz numa conversa, em minúsculas: "mudanças", "transporte de viaturas".' },
      { id: 'zona', label: 'Zona', obrigatorio: true, tipo: 'texto', exemplo: 'Setúbal' },
      { id: 'pedidosPorMes', label: 'Pedidos por mês', obrigatorio: false, tipo: 'numero', exemplo: '4',
        nota: 'Sai do quadro "Por servir". Deixe vazio se não tiver um número real — inventá-lo custa a conversa toda.' },
      CAMPO_ASSINATURA,
    ],
  },
  {
    id: 'generica',
    versao: 'generica-v1',
    nome: 'Sem números ainda',
    quando: 'Quando a empresa interessa mas ainda não há procura medida naquela célula. '
      + 'Fala do problema em geral, sem inventar números.',
    assunto: 'Temos pedidos de transporte que não conseguimos servir',
    campos: [CAMPO_ASSINATURA],
  },
  {
    id: 'pos_chamada',
    versao: 'pos_chamada-v1',
    nome: 'Depois de falar ao telefone',
    quando: 'Quando já houve chamada e ficou combinado enviar por escrito. '
      + 'Não repete a apresentação — retoma a conversa onde ela ficou.',
    assunto: 'Como combinámos, fica por escrito',
    campos: [
      { id: 'pessoa', label: 'Com quem falou', obrigatorio: true, tipo: 'texto', exemplo: 'o Sr. Ricardo',
        nota: 'Como lhe chamou ao telefone, com o artigo: "o Sr. Ricardo", "a Dra. Marta". '
          + 'Aparece na primeira linha, a seguir a "Falámos há pouco com".' },
      { id: 'categoria', label: 'Categoria', obrigatorio: false, tipo: 'texto', exemplo: 'mudanças' },
      { id: 'zona', label: 'Zona', obrigatorio: false, tipo: 'texto', exemplo: 'Setúbal' },
      CAMPO_ASSINATURA,
    ],
  },
  {
    id: 'indicacao',
    versao: 'indicacao-v1',
    nome: 'Por indicação de alguém',
    quando: 'Quando chegámos a esta empresa por recomendação. Dizer quem indicou logo na '
      + 'primeira linha é o que separa isto de um email frio.',
    assunto: 'Falaram-nos de vocês',
    campos: [
      { id: 'quemIndicou', label: 'Quem indicou', obrigatorio: true, tipo: 'texto',
        exemplo: 'a Transportes Lopes', nota: 'Empresa ou pessoa, como aparecerá escrito na frase.' },
      { id: 'categoria', label: 'Categoria', obrigatorio: false, tipo: 'texto', exemplo: 'mudanças' },
      { id: 'zona', label: 'Zona', obrigatorio: false, tipo: 'texto', exemplo: 'Setúbal' },
      CAMPO_ASSINATURA,
    ],
  },
];

export function metaApresentacao(id: string): MetaApresentacao | undefined {
  return APRESENTACOES.find((a) => a.id === id);
}

export interface DadosApresentacao {
  empresa?: string;
  categoria?: string;
  zona?: string;
  pedidosPorMes?: number | null;
  pessoa?: string;
  quemIndicou?: string;
  assinatura: string;
}

export interface CorpoApresentacao {
  intro: string;
  oQueE: string[];
  comoFunciona: { titulo: string; texto: string }[];
  fecho: string;
}

/**
 * O que se diz, e o que não se diz.
 *
 * Escrito para ser lido por um gerente de transportes em trinta segundos, no telemóvel,
 * entre duas chamadas. Quatro decisões formam-no:
 *
 * **Abre com o que ele ganha, não com quem nós somos.** "Temos pedidos que não
 * conseguimos servir" interessa a quem os pode servir. "A YourBox é uma empresa fundada
 * em..." não interessa a ninguém, e é como começam quase todos os emails deste género.
 *
 * **É específico quando pode ser.** Os números da variante `contexto` saem do quadro "Por
 * servir", que já existe e já é calculado — não são estimativas.
 *
 * **Diz o modelo de negócio à primeira.** Paga-se por lead, as primeiras são grátis, não
 * há exclusividade nem contrato. Guardar isto para "explicar na chamada" faz perder o
 * tempo das duas partes e trata o destinatário como um alvo.
 *
 * **Pede uma coisa só.** Cinco campos. Não pede reunião, não pede resposta, não pede
 * chamada. Uma acção, um botão.
 */
export function corpoApresentacao(variante: VarianteApresentacao, d: DadosApresentacao): CorpoApresentacao {
  // Duas formas do mesmo pedaco, porque servem duas posicoes gramaticais diferentes:
  // "pedidos DE mudancas" leva preposicao, "quem fizesse mudancas" nao. Com uma so,
  // saia "quem fizesse de mudancas".
  const oQue = d.categoria && d.zona
    ? `<strong>${d.categoria}</strong> na zona de <strong>${d.zona}</strong>` : '';
  const onde = oQue ? ` de ${oQue}` : '';

  const intro = {
    contexto:
      `Recebemos pedidos${onde || ' de transporte'} que não conseguimos servir`
      + (d.pedidosPorMes && d.pedidosPorMes > 0 ? ` &mdash; cerca de ${d.pedidosPorMes} por mês.` : '.')
      + ' Se é trabalho que a vossa empresa faz, gostávamos de vos passar esses pedidos.',

    generica:
      'Recebemos todos os meses pedidos de transporte que não conseguimos servir &mdash; '
      + 'por serem de tipos que não fazemos, ou de zonas que não cobrimos. '
      + 'Se é trabalho que a vossa empresa faz, gostávamos de vos passar esses pedidos.',

    pos_chamada:
      `Falámos há pouco com ${d.pessoa ?? 'a vossa empresa'} e ficou combinado enviar isto por escrito. `
      + `Em duas linhas: temos pedidos${onde || ' de transporte'} que não conseguimos servir, `
      + 'e queríamos passá-los para vocês.',

    indicacao:
      `Foi ${d.quemIndicou ?? 'alguém que trabalha connosco'} que nos falou de vocês. `
      + `Procurávamos quem fizesse ${oQue || 'este tipo de transporte'}: recebemos pedidos `
      + 'desses todos os meses e não os conseguimos servir.',
  }[variante];

  // O miolo é igual nas quatro. É a substância da proposta, e não há razão para variar.
  const oQueE = variante === 'pos_chamada'
    ? ['Fica aqui o essencial, para poder mostrar a quem decidir consigo.']
    : [
        'Somos a YourBox. Recebemos pedidos de transporte todos os dias, do nosso site e '
        + 'dos nossos clientes. Uma parte não é para nós.',
        'Em vez de os recusar, procuramos empresas que os façam bem. É isso que vos estamos '
        + 'a propor.',
      ];

  const comoFunciona = [
    {
      titulo: 'Recebem o pedido completo',
      texto: 'Nome, contacto directo, moradas, carga e prazo. Falam com o cliente e '
        + 'apresentam o vosso preço — o preço é vosso, nós não entramos nele.',
    },
    {
      titulo: 'Cada pedido vai a uma empresa só',
      texto: 'Não é um leilão. Quando vos chega um pedido, não foi enviado a mais ninguém.',
    },
    {
      titulo: 'Pagam por pedido, não por mês',
      texto: 'Sem mensalidade, sem contrato, sem exclusividade. As primeiras leads são '
        + 'por nossa conta, para verem se serve.',
    },
    {
      titulo: 'Se um pedido não prestar, devolvemos',
      texto: 'Contacto errado ou fora do vosso âmbito: dizem-nos e não pagam. '
        + 'Preferimos saber a fingir que não aconteceu.',
    },
  ];

  const fecho = variante === 'pos_chamada'
    ? 'Como combinámos, falta só dizer-nos <strong>que serviços fazem e que zonas cobrem</strong>. '
      + 'São dois minutos no formulário aqui em baixo, e ficamos com a vossa ficha pronta.'
    : 'Se fizer sentido, precisamos de saber uma coisa só: <strong>que serviços fazem '
      + 'e que zonas cobrem</strong>. São dois minutos no formulário aqui em baixo, e '
      + 'ficamos com a vossa ficha pronta.';

  return { intro, oQueE, comoFunciona, fecho };
}

/**
 * Valida o que a gerente de conta preencheu.
 *
 * O envio pára aqui e não no servidor de email: uma carta que diz "pedidos de undefined
 * na zona de undefined" é pior do que nenhuma carta.
 */
export function validarCampos(variante: string, valores: Record<string, unknown>): { ok: boolean; erro?: string } {
  const meta = metaApresentacao(variante);
  if (!meta) return { ok: false, erro: 'variante desconhecida' };

  for (const campo of meta.campos) {
    const v = String(valores[campo.id] ?? '').trim();
    if (campo.obrigatorio && !v) return { ok: false, erro: `falta "${campo.label}"` };
    if (campo.tipo === 'numero' && v && !(Number(v) > 0)) {
      return { ok: false, erro: `"${campo.label}" tem de ser um número` };
    }
  }
  return { ok: true };
}

/** O rodapé de oposição. Exigência legal, mesmo a este volume, e respeitá-lo é permanente. */
export const RODAPE_OPOSICAO =
  'Escrevemos-lhe porque procurámos empresas que fazem este tipo de transporte na vossa '
  + 'zona. Se preferir não receber mais contactos nossos, diga-o nesta ligação e não '
  + 'voltamos a escrever.';
