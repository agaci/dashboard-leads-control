import type { CrmCategoria, CrmConfianca, CrmConsultaPedido, CrmRoute } from '@/types/crm';

/**
 * Categorias e triagem automática (spec §3 e §12).
 *
 * "A triagem é automática por categoria, não por decisão da operadora." O catálogo e as
 * regras que reconhecem cada categoria vivem no mesmo ficheiro de propósito: são a
 * mesma coisa dita de duas maneiras — o que é uma categoria, e como se vê que uma lead
 * é dela. Separá-los daria dois sítios para manter em concordância.
 *
 * O módulo não tem imports de runtime, só de tipo. É essa a condição para ser testável
 * com o `--experimental-strip-types` do `npm test`, e é também o que garante que a
 * decisão mais delicada do CRM se pode exercitar sem base de dados. Quem vai ao Mongo
 * buscar os limites reais é lib/crm/triagem.ts.
 */

export interface CategoriaMeta {
  id: CrmCategoria;
  label: string;              // o que a operadora lê no dashboard
  route: CrmRoute;
  /** Ordem de especialização. Menor decide primeiro quando há empate. */
  ordem: number;
  descricao: string;
  /**
   * Uma empresa de transportes reconhece-se nisto e pode dizer "sim, fazemos".
   *
   * Separado da rota de propósito, porque as duas coisas andavam coladas por acaso.
   * `arrasto` e `expresso` são nomes internos de encaminhamento — ninguém de fora sabe
   * o que são, e perguntá-lo num formulário público só confundia. Já "carga paletizada"
   * é uma frase que um gerente de transportes diz todos os dias.
   *
   * É isto que decide o que aparece no formulário de registo e nas fichas, e não o
   * facto de a categoria se vender ou se subcontratar.
   */
  declaravel?: boolean;
}

export const CATEGORIAS: Record<CrmCategoria, CategoriaMeta> = {
  adr: {
    id: 'adr',
    label: 'ADR / radioactivo',
    route: 'lead_sale',
    ordem: 1,
    descricao: 'Mercadorias perigosas, explosivos, material radioactivo. Poucos players, exige certificação.',
    declaravel: true,
  },
  temperatura: {
    id: 'temperatura',
    label: 'Temperatura controlada',
    route: 'lead_sale',
    ordem: 2,
    descricao: 'Cadeia de frio, refrigerado, congelado, farmacêutico a 2-8 graus.',
    declaravel: true,
  },
  viaturas: {
    id: 'viaturas',
    label: 'Transporte de viaturas',
    route: 'lead_sale',
    ordem: 3,
    descricao: 'Automóveis, motos, reboques, embarcações. Mercado competitivo.',
    declaravel: true,
  },
  mudancas: {
    id: 'mudancas',
    label: 'Mudanças',
    route: 'lead_sale',
    ordem: 4,
    descricao: 'Mudanças de casa ou escritório, recheios, guarda-móveis.',
    declaravel: true,
  },
  fora_gabarito: {
    id: 'fora_gabarito',
    label: 'Fora de gabarito',
    route: 'lead_sale',
    ordem: 5,
    descricao: 'Dimensões acima do que a tabela dos parceiros logísticos cobre.',
    declaravel: true,
  },
  sobrepeso: {
    id: 'sobrepeso',
    label: 'Peso acima da capacidade',
    route: 'lead_sale',
    ordem: 6,
    descricao: 'Peso acima da capacidade própria e dos parceiros de tabela.',
    declaravel: true,
  },
  // ── Transporte corrente ────────────────────────────────────────────────────
  //
  // Rota `subcontract` e nao `lead_sale`: sao servicos que a YourBox faz e quer
  // continuar a fazer. Quando nao consegue — falta de viatura, de pessoal, de dia — o
  // que se quer e subcontratar e ficar com o cliente, nao vender a lead e perde-lo.
  //
  // A triagem nunca chega a estas categorias sozinha (nao ha regras para elas): hoje
  // servem para o parceiro dizer o que faz, e para a operadora reclassificar um pedido
  // a mao quando precisar de o passar a alguem.
  //
  // Ordem acima das seis especiais: sao menos especializadas. Uma palete de ADR e ADR.
  encomendas: {
    id: 'encomendas',
    label: 'Encomendas e paquetaria',
    route: 'subcontract',
    ordem: 20,
    descricao: 'Volumes soltos, documentos, ponto a ponto. O transporte do dia-a-dia.',
    declaravel: true,
  },
  paletes: {
    id: 'paletes',
    label: 'Carga paletizada',
    route: 'subcontract',
    ordem: 21,
    descricao: 'Paletes e grupagem, com ou sem empilhador ao carregar.',
    declaravel: true,
  },
  distribuicao: {
    id: 'distribuicao',
    label: 'Distribuição e rotas',
    route: 'subcontract',
    ordem: 22,
    descricao: 'Várias entregas na mesma volta: lojas, clínicas, obras, oficinas.',
    declaravel: true,
  },

  arrasto: {
    id: 'arrasto',
    label: 'Arrasto 24h',
    route: 'subcontract',
    ordem: 90,
    descricao: 'Entrega em 24h por parceiro logístico, com tabela contratada.',
  },
  expresso: {
    id: 'expresso',
    label: 'Expresso 1h/4h',
    route: 'subcontract',
    ordem: 99,
    descricao: 'Serviço dedicado da operação própria, com motor de preço interno.',
  },
};

export const CATEGORIAS_ORDENADAS: CategoriaMeta[] =
  Object.values(CATEGORIAS).sort((a, b) => a.ordem - b.ordem);

/**
 * O que um parceiro pode declarar que faz.
 *
 * Inclui as seis especiais e o transporte corrente. Nao inclui `arrasto` nem `expresso`,
 * que sao nomes internos de encaminhamento e nao servicos que alguem reconheca.
 */
export const CATEGORIAS_DECLARAVEIS: CategoriaMeta[] =
  CATEGORIAS_ORDENADAS.filter((c) => c.declaravel);

/** As que a spec §3 manda sempre para a venda de lead. */
export const CATEGORIAS_LEAD_SALE: CrmCategoria[] =
  CATEGORIAS_ORDENADAS.filter((c) => c.route === 'lead_sale').map((c) => c.id);

export function rotaDaCategoria(categoria: CrmCategoria): CrmRoute {
  return CATEGORIAS[categoria]?.route ?? 'subcontract';
}

export function labelDaCategoria(categoria: CrmCategoria): string {
  return CATEGORIAS[categoria]?.label ?? categoria;
}

export function eCategoriaValida(v: unknown): v is CrmCategoria {
  return typeof v === 'string' && v in CATEGORIAS;
}

// ── Limites da tabela ────────────────────────────────────────────────────────

export interface LimitesTabela {
  /** Peso máximo por expedição que os parceiros de tabela aceitam, em kg. */
  maxKg: number;
  /** C+L+A máximo que os parceiros de tabela aceitam, em cm. */
  maxCm: number;
}

/**
 * Usado quando não há tarifas activas na base. São os limites da tabela MRW
 * (data/mrw-tariffs.ts), o único parceiro logístico com tabela carregada até hoje.
 */
export const LIMITES_FALLBACK: LimitesTabela = { maxKg: 250, maxCm: 300 };

// ── Normalização ─────────────────────────────────────────────────────────────

/**
 * Minúsculas sem acentos. As leads chegam escritas por pessoas com pressa: "mudanças",
 * "mudancas" e "MUDANÇAS" têm de bater no mesmo padrão.
 */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // marcas de acentuação soltas pelo NFD
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Regras ───────────────────────────────────────────────────────────────────

interface Regra {
  categoria: CrmCategoria;
  forca: 'forte' | 'fraca';
  padrao: RegExp;
  motivo: string;
}

/**
 * Padrões sobre o texto já normalizado (sem acentos, minúsculas).
 *
 * "forte" = o termo só pode querer dizer aquilo. "fraca" = o termo é compatível com
 * outra leitura e por isso baixa a confiança em vez de decidir sozinho. É a diferença
 * entre "mercadoria perigosa" e "carro", que tanto pode ser a carga como o meio.
 */
const REGRAS: Regra[] = [
  // ── ADR / radioactivo ──────────────────────────────────────────────────────
  { categoria: 'adr', forca: 'forte', padrao: /\badr\b/, motivo: 'menciona ADR' },
  { categoria: 'adr', forca: 'forte', padrao: /radioativ|radioactiv/, motivo: 'material radioactivo' },
  { categoria: 'adr', forca: 'forte', padrao: /mercadorias? perigosas?|materias? perigosas?|carga perigosa/, motivo: 'mercadoria perigosa' },
  { categoria: 'adr', forca: 'forte', padrao: /explosiv|inflamav|corrosiv|comburente/, motivo: 'carga classificada como perigosa' },
  { categoria: 'adr', forca: 'fraca', padrao: /\btoxic[oa]s?\b|residuos? hospitalar|material contaminad|biologic[oa] perigos/, motivo: 'indício de carga perigosa ou contaminada' },

  // ── Temperatura controlada ─────────────────────────────────────────────────
  { categoria: 'temperatura', forca: 'forte', padrao: /temperatura controlada|cadeia de frio|refrigerad|congelad|isotermic/, motivo: 'exige temperatura controlada' },
  { categoria: 'temperatura', forca: 'forte', padrao: /\b2\s*[-a]\s*8\s*(graus|c\b)/, motivo: 'faixa de 2 a 8 graus' },
  { categoria: 'temperatura', forca: 'fraca', padrao: /\bvacinas?\b|\bfrio\b|\bgelo\b/, motivo: 'indício de cadeia de frio' },

  // ── Transporte de viaturas ─────────────────────────────────────────────────
  { categoria: 'viaturas', forca: 'forte', padrao: /\breboque\b|reboca(r|do)|\bautomovel\b|\bautomoveis\b|\bmotociclo\b|\bquadriciclo\b|autocaravan|\bjet ?ski\b|\batrelado\b/, motivo: 'transporte de veículo' },
  { categoria: 'viaturas', forca: 'forte', padrao: /transport(ar|e|o)?[^.]{0,30}\b(carro|carrinha|mota|moto|viatura|veiculo|barco|trator|tractor)\b/, motivo: 'pedido para transportar um veículo' },
  { categoria: 'viaturas', forca: 'forte', padrao: /\b(carro|viatura|veiculo|mota)\b[^.]{0,25}\b(avariad|acidentad|sem matricula|para sucata|nao pega|nao anda)/, motivo: 'veículo imobilizado' },
  { categoria: 'viaturas', forca: 'fraca', padrao: /\bporta-?carros?\b|\bgrua\b/, motivo: 'indício de transporte de veículo' },

  // ── Mudanças ───────────────────────────────────────────────────────────────
  { categoria: 'mudancas', forca: 'forte', padrao: /\bmudancas\b|mudanca de (casa|escritorio|habitacao|residencia)|guarda-?moveis|recheio da casa|recheio de (casa|apartamento|escritorio)/, motivo: 'mudança de casa ou escritório' },
  { categoria: 'mudancas', forca: 'fraca', padrao: /\bmudanca\b|casa (toda|inteira)|\bmobilia\b|moveis todos/, motivo: 'indício de mudança' },

  // ── Fora de gabarito (sinal textual; o numérico vem dos limites) ───────────
  { categoria: 'fora_gabarito', forca: 'forte', padrao: /fora de gabarito|sobredimensionad|carga especial|transporte especial/, motivo: 'declarado fora de gabarito' },

  // ── Sobrepeso (sinal textual; o numérico vem dos limites) ─────────────────
  { categoria: 'sobrepeso', forca: 'forte', padrao: /\btonelad|\bcamiao\b|\bcamioes\b|\bgalera\b|\bsemi-?reboque\b|\bcontentor\b/, motivo: 'carga de dimensão de camião' },
  { categoria: 'sobrepeso', forca: 'fraca', padrao: /\bpaletes\b|\bempilhador\b|\bcais\b/, motivo: 'indício de carga paletizada pesada' },
];

// ── Sinal estruturado: o que o formulário diz, em vez do que o texto sugere ──

/**
 * Materiais do quiz que identificam a categoria sem margem para interpretação.
 *
 * Isto vale mais do que todas as regras de texto juntas, e a razão é simples: as
 * observações de uma lead do quiz são geradas a partir dos menus, não escritas por
 * ninguém. Procurar palavras num texto que a própria aplicação compôs é adivinhar o que
 * já se sabe. Quando a pessoa escolhe "Mudança de casa", isso É a categoria.
 *
 * As chaves são os `value` do <select> do quiz (sem acentos, como lá estão). A
 * comparação é feita sobre o texto normalizado, por isso variações de acentuação e
 * maiúsculas não interessam.
 */
const MATERIAL_CATEGORIA: { padrao: RegExp; categoria: CrmCategoria; motivo: string }[] = [
  { padrao: /mudanca de casa|mudanca de escritorio|mudanca de casa \/ escritorio/, categoria: 'mudancas', motivo: 'declarado no formulário: mudança' },
  { padrao: /^viatura |viatura \(carro/, categoria: 'viaturas', motivo: 'declarado no formulário: transporte de viatura' },
  { padrao: /carga refrigerada|congelada/, categoria: 'temperatura', motivo: 'declarado no formulário: carga refrigerada' },
  { padrao: /mercadorias perigosas|adr/, categoria: 'adr', motivo: 'declarado no formulário: mercadorias perigosas' },
  { padrao: /grande volume|fora de medidas/, categoria: 'fora_gabarito', motivo: 'declarado no formulário: fora de medidas' },
];

/**
 * Não há indícios por material, e é de propósito.
 *
 * Havia dois — "peças automóveis" puxava para `viaturas`, "perecíveis" para `temperatura`
 * — e ambos tiravam a lead da operação própria. Estavam errados por duas razões.
 *
 * **Contradiziam uma escolha já feita.** O menu tem "Viatura (carro, mota, atrelado)" e
 * "Carga refrigerada / congelada" como opções próprias. Quem escolhe "Peças automóveis"
 * teve à frente a hipótese de dizer que era um veículo e escolheu a outra: uma caixa de
 * travões é carga normal. Escolher da lista dos servíveis É a resposta.
 *
 * **E decidiam apesar de se chamarem fracas.** Sem candidato forte, a `triar()` escolhia
 * o fraco e encaminhava por ele — uma regra fraca só era fraca em relação a uma forte.
 *
 * O sítio para dizer que um material pertence a uma categoria é a própria lista
 * (`crm_materiais`, campo `categoria`), que é editável no dashboard e não precisa de
 * ninguém a adivinhar por padrões de texto. A dúvida sobre uma lead vem agora de outro
 * lado: de quantas perguntas ficaram por responder (ver respostasVagas).
 */

/**
 * Categoria a partir do material escolhido no formulário, se houver.
 *
 * Exportada para poder ser testada e para o dashboard poder explicar a decisão.
 */
export function categoriaDoMaterial(material?: string): { categoria: CrmCategoria; forca: 'forte' | 'fraca'; motivo: string } | null {
  const m = normalizar(String(material ?? ''));
  if (!m) return null;
  for (const r of MATERIAL_CATEGORIA) {
    if (r.padrao.test(m)) return { categoria: r.categoria, forca: 'forte', motivo: r.motivo };
  }
  return null;
}

// ── Triagem ──────────────────────────────────────────────────────────────────

export interface SinaisTriagem extends CrmConsultaPedido {
  /** Texto livre adicional: mensagens da conversa, notas da operadora. */
  texto?: string;
  /** Material escolhido no formulário. Sinal estruturado — vale mais do que o texto. */
  material?: string;
  /**
   * Categoria que vem declarada na lista de materiais (`crm_materiais`), editável no
   * dashboard.
   *
   * Ganha a tudo o resto, e nem sequer é interpretação: alguém escolheu uma opção de
   * uma lista que nós controlamos, e essa opção diz a que categoria pertence. Existe
   * para que uma opção acrescentada pelo CRUD — que as regras de texto nunca poderiam
   * adivinhar — seja reconhecida na mesma.
   */
  categoriaDeclarada?: CrmCategoria | null;
}

export interface ResultadoTriagem {
  categoria: CrmCategoria;
  route: CrmRoute;
  motivo: string;
  confianca: CrmConfianca;
  /** Todas as categorias que deram sinal, para a operadora ver o que esteve em cima da mesa. */
  candidatas: { categoria: CrmCategoria; forca: 'forte' | 'fraca'; motivo: string }[];
}

/**
 * Classifica uma consulta. Nunca lança: uma lead sem sinal nenhum cai na Linha A, que
 * é o comportamento de hoje — o CRM só desvia o que reconhece como não servível.
 *
 * O `motivo` não é decorativo. A spec exige que nada mude de estado sem registo, e é
 * este texto que fica no `history` da consulta a explicar a classificação.
 */
/**
 * A partir de quantas respostas vagas se pede olho humano.
 *
 * Duas. Uma só não preocupa — muita gente não sabe quanto pesa um móvel e sabe
 * perfeitamente o que é e para onde vai. Duas já quer dizer que o orçamento assenta em
 * estimativas nossas e não no que o cliente disse.
 */
export const LIMIAR_VAGAS = 2;

/**
 * As perguntas a que a pessoa não soube responder.
 *
 * **O quiz manda sempre um número.** Escolher "Não sei" no peso grava a estimativa média,
 * porque o motor de preço precisa de um valor para mostrar alguma coisa ao cliente. O que
 * esta lista faz é guardar que aquilo foi estimativa nossa, e não resposta dele — antes
 * chegavam cá indistinguíveis.
 *
 * "Outro" no material conta na mesma linha: não é um "não sei" escrito, mas diz-nos tão
 * pouco como um. Sai daqui e não do quiz, para valer também nas leads que entram por
 * telefone ou pelo bot, onde não há botão nenhum.
 */
export function respostasVagas(sinais: SinaisTriagem): string[] {
  const vagas = new Set<string>();
  for (const v of sinais.naoSei ?? []) {
    const n = String(v ?? '').trim();
    if (n) vagas.add(n);
  }
  if (normalizar(String(sinais.material ?? '')) === 'outro') vagas.add('material');
  return [...vagas];
}

const ROTULO_VAGA: Record<string, string> = {
  peso: 'o peso', dimensoes: 'as dimensões', volumes: 'o número de volumes',
  material: 'o que vai dentro',
};

/**
 * Marca a lead para revisão quando ficaram respostas por dar.
 *
 * **Não mexe na categoria nem na rota** — mexe só na confiança, que é o que trava a
 * distribuição automática (lib/crm/consultas.ts). Uma lead de mudanças com peso e
 * dimensões por saber continua a ser de mudanças; o que muda é que alguém lhe pega antes
 * de a vender, porque vendê-la assim é vender uma estimativa nossa.
 */
function comRevisao(r: ResultadoTriagem, vagas: string[]): ResultadoTriagem {
  if (vagas.length < LIMIAR_VAGAS) return r;
  const nomes = vagas.map((v) => ROTULO_VAGA[v] ?? v).join(', ');
  return {
    ...r,
    confianca: 'baixa',
    motivo: `${r.motivo} · por confirmar: ${nomes}`,
  };
}

export function triar(sinais: SinaisTriagem, limites: LimitesTabela = LIMITES_FALLBACK): ResultadoTriagem {
  const vagas = respostasVagas(sinais);
  // Categoria declarada na lista de materiais: nao ha nada para decidir.
  if (sinais.categoriaDeclarada) {
    return comRevisao({
      categoria: sinais.categoriaDeclarada,
      route: rotaDaCategoria(sinais.categoriaDeclarada),
      motivo: `declarado no formulário: ${labelDaCategoria(sinais.categoriaDeclarada).toLowerCase()}`,
      confianca: 'alta',
      candidatas: [{ categoria: sinais.categoriaDeclarada, forca: 'forte', motivo: 'escolhido no formulário' }],
    }, vagas);
  }

  const texto = normalizar([sinais.observacoes, sinais.texto].filter(Boolean).join(' '));
  const candidatas: ResultadoTriagem['candidatas'] = [];

  // O que o formulário declara vem primeiro: não é interpretação, é escolha da pessoa.
  const doMaterial = categoriaDoMaterial(sinais.material);
  if (doMaterial) candidatas.push(doMaterial);

  for (const regra of REGRAS) {
    if (texto && regra.padrao.test(texto)) {
      candidatas.push({ categoria: regra.categoria, forca: regra.forca, motivo: regra.motivo });
    }
  }

  // Limites numéricos. São sinais fortes por construção: não dependem de interpretação
  // de texto, comparam-se com o que os parceiros de tabela realmente aceitam.
  const kg = numeroOuNulo(sinais.weightKg);
  if (kg !== null && kg > limites.maxKg) {
    candidatas.push({
      categoria: 'sobrepeso',
      forca: 'forte',
      motivo: `${kg} kg acima do limite de tabela (${limites.maxKg} kg)`,
    });
  }

  const cm = numeroOuNulo(sinais.totalCm);
  if (cm !== null && cm > limites.maxCm) {
    candidatas.push({
      categoria: 'fora_gabarito',
      forca: 'forte',
      motivo: `C+L+A de ${cm} cm acima do limite de tabela (${limites.maxCm} cm)`,
    });
  }

  const fortes = candidatas.filter((c) => c.forca === 'forte');
  const fracas = candidatas.filter((c) => c.forca === 'fraca');

  if (fortes.length) {
    const escolhida = maisEspecializada(fortes);
    const outras = new Set(fortes.map((c) => c.categoria));
    outras.delete(escolhida.categoria);
    return comRevisao({
      categoria: escolhida.categoria,
      route: rotaDaCategoria(escolhida.categoria),
      motivo: escolhida.motivo,
      // Duas categorias fortes e diferentes querem dizer que a lead é ambígua: uma
      // mudança com material perigoso não vai para o mesmo parceiro. Pede olho humano.
      confianca: outras.size > 0 ? 'baixa' : 'alta',
      candidatas,
    }, vagas);
  }

  if (fracas.length) {
    const escolhida = maisEspecializada(fracas);
    return comRevisao({
      categoria: escolhida.categoria,
      route: rotaDaCategoria(escolhida.categoria),
      motivo: escolhida.motivo,
      confianca: 'media',
      candidatas,
    }, vagas);
  }

  // Sem sinal: fica na operação própria. O 24h separa-se do expresso porque tem tabela
  // de parceiro logístico e o expresso tem motor de preço interno.
  const arrasto = /24/.test(String(sinais.urgencia ?? ''));
  return comRevisao({
    categoria: arrasto ? 'arrasto' : 'expresso',
    route: 'subcontract',
    motivo: arrasto ? 'sem sinal de categoria especial, urgência de 24h' : 'sem sinal de categoria especial',
    confianca: 'alta',
    candidatas,
  }, vagas);
}

function maisEspecializada(cs: ResultadoTriagem['candidatas']): ResultadoTriagem['candidatas'][number] {
  return [...cs].sort((a, b) => (CATEGORIAS[a.categoria]?.ordem ?? 99) - (CATEGORIAS[b.categoria]?.ordem ?? 99))[0];
}

function numeroOuNulo(v: unknown): number | null {
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : v;
  return typeof n === 'number' && isFinite(n) && n > 0 ? n : null;
}
