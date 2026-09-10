import type { CrmPartner, EstadoParceiro as EstadoDoTipo } from '@/types/crm';

/**
 * O funil de angariação de parceiros.
 *
 * Sem imports de runtime, para poder ser testado sem base de dados — como as
 * lib/crm/estados.ts e lib/crm/capacidades.ts que fazem o mesmo para as consultas.
 *
 * Os prospectos entram um a um, à mão, escolhidos por necessidade e por zona, quase
 * sempre com contacto prévio. Cem ao fim de meses é bom resultado. Nada aqui é desenhado
 * para volume: não há cadências, não há paragens automáticas, não há campanhas. O que há
 * é o registo do que foi feito a cada empresa, que é o que falta quando três pessoas
 * mexem na mesma ficha ao longo de meio ano.
 *
 * Ver SPECS-Angariacao-Parceiros.md §6.
 */

export const ESTADOS_PARCEIRO = [
  'prospect', 'contactado', 'registado', 'em_avaliacao',
  'trial', 'ativo', 'suspenso', 'descartado', 'opos_se',
] as const;

export type EstadoParceiro = typeof ESTADOS_PARCEIRO[number];

/**
 * Trava a divergencia entre esta lista e o tipo em types/crm.ts.
 *
 * Sao dois sitios a dizer o mesmo — um em runtime, outro so para o TypeScript — e um dia
 * haviam de discordar. Estas duas linhas nao compilam se isso acontecer, e nao custam
 * nada em execucao.
 */
const _tipoCobreALista: EstadoDoTipo = null as unknown as EstadoParceiro;
const _listaCobreOTipo: EstadoParceiro = null as unknown as EstadoDoTipo;
void _tipoCobreALista; void _listaCobreOTipo;

/**
 * Quem pode receber uma lead paga.
 *
 * **Só dois.** Até aqui o `procurarParceiros()` excluía apenas `suspenso`, o que
 * significa que um `prospect` com capacidades declaradas podia receber uma lead antes de
 * alguém ter sequer falado com ele. Com um estado inicial só, isso quase não acontecia;
 * com seis estados intermédios passaria a ser inevitável.
 */
export const ESTADOS_QUE_RECEBEM: readonly EstadoParceiro[] = ['trial', 'ativo'];

export function podeReceberLeads(estado: string | undefined): boolean {
  return ESTADOS_QUE_RECEBEM.includes(estado as EstadoParceiro);
}

/** Já não está no funil — nem para trabalhar, nem para contactar. */
export const ESTADOS_FORA: readonly EstadoParceiro[] = ['descartado', 'opos_se'];

/**
 * `opos_se` bloqueia **angariação**, não bloqueia **transaccional**.
 *
 * Se a empresa vier a ser parceira um dia por outra via, tem de continuar a receber as
 * leads que compra. São duas supressões distintas, e confundi-las ou deixa alguém sem as
 * leads que pagou, ou continua a incomodar quem pediu para não ser incomodado.
 */
export function podeReceberAngariacao(p: Pick<CrmPartner, 'estado'>): boolean {
  return p.estado !== 'opos_se';
}

export const ROTULO_ESTADO: Record<EstadoParceiro, string> = {
  prospect:     'Por contactar',
  contactado:   'Contactado',
  registado:    'Registou-se',
  em_avaliacao: 'Em avaliação',
  trial:        'Trial',
  ativo:        'Activo',
  suspenso:     'Suspenso',
  descartado:   'Descartado',
  opos_se:      'Opôs-se',
};

export const EXPLICACAO_ESTADO: Record<EstadoParceiro, string> = {
  prospect:     'Está na ficha e ninguém falou com ele.',
  contactado:   'Houve chamada, email ou reunião. Ainda não se registou.',
  registado:    'Preencheu o formulário e declarou capacidades e zonas.',
  em_avaliacao: 'A confirmar NIF, alvará e certificações antes de lhe entregar leads.',
  trial:        'A gastar as leads grátis. Recebe leads.',
  ativo:        'Paga da carteira. Recebe leads.',
  suspenso:     'Fora de circulação, sem perder o histórico.',
  descartado:   'Não serve. O motivo fica escrito.',
  opos_se:      'Pediu para não ser contactado. Nunca mais recebe angariação.',
};

/**
 * Transições legítimas. O que não estiver aqui não acontece.
 *
 * Duas escolhas que não são óbvias:
 *
 * **Salta-se para a frente.** De `prospect` chega-se a `registado` sem passar por
 * `contactado`: acontece quando a empresa preenche o formulário público sem ninguém lhe
 * ter ligado. Obrigar a passar pelo meio seria obrigar a mentir no histórico.
 *
 * **`opos_se` é quase sempre alcançável e nunca tem saída.** Um pedido para não ser
 * contactado pode chegar em qualquer altura, e não se desfaz do nosso lado — se a empresa
 * mudar de ideias, entra de novo, e fica registado que foi ela a pedir.
 */
const TRANSICOES: Record<EstadoParceiro, EstadoParceiro[]> = {
  prospect:     ['contactado', 'registado', 'descartado', 'opos_se'],
  contactado:   ['registado', 'em_avaliacao', 'descartado', 'opos_se'],
  registado:    ['em_avaliacao', 'contactado', 'descartado', 'opos_se'],
  em_avaliacao: ['trial', 'ativo', 'registado', 'descartado', 'opos_se'],
  trial:        ['ativo', 'suspenso', 'descartado'],
  ativo:        ['trial', 'suspenso', 'descartado'],
  suspenso:     ['ativo', 'trial', 'descartado'],
  descartado:   ['prospect', 'contactado'],   // volta-se atrás quando muda o contexto
  opos_se:      [],
};

export interface EntradaHistorico {
  estado: EstadoParceiro;
  em: Date;
  actor: string;
  motivo: string;
}

export interface ResultadoTransicao {
  ok: boolean;
  erro?: string;
  estado?: EstadoParceiro;
  entrada?: EntradaHistorico;
}

/**
 * Muda o estado, ou explica porque não.
 *
 * Devolve o estado novo E a entrada de histórico juntos, como a `transicao()` das
 * consultas: assim não há caminho em que um se grave sem o outro. E o motivo é
 * obrigatório — um prospecto que mudou de estado sem se saber porquê é um prospecto que
 * alguém vai voltar a contactar por engano daqui a três meses.
 */
export function transicao(
  actual: string | undefined,
  novo: string,
  actor: string,
  motivo: string,
): ResultadoTransicao {
  const de = (ESTADOS_PARCEIRO as readonly string[]).includes(actual ?? '')
    ? (actual as EstadoParceiro) : 'prospect';

  if (!(ESTADOS_PARCEIRO as readonly string[]).includes(novo)) {
    return { ok: false, erro: `estado desconhecido: ${novo}` };
  }
  const para = novo as EstadoParceiro;
  if (de === para) return { ok: false, erro: 'já está nesse estado' };

  if (!TRANSICOES[de].includes(para)) {
    return {
      ok: false,
      erro: `não se passa de "${ROTULO_ESTADO[de]}" para "${ROTULO_ESTADO[para]}"`,
    };
  }

  const texto = String(motivo ?? '').trim();
  if (texto.length < 3) return { ok: false, erro: 'o motivo é obrigatório' };

  // Sair do funil sem dizer porquê deixa a ficha impossível de reavaliar mais tarde.
  if (ESTADOS_FORA.includes(para) && texto.length < 8) {
    return { ok: false, erro: `para "${ROTULO_ESTADO[para]}" o motivo tem de ser explícito` };
  }

  return { ok: true, estado: para, entrada: { estado: para, em: new Date(), actor, motivo: texto } };
}

/** Para onde é que esta ficha pode ir a seguir. A interface não deve ter esta lista. */
export function proximosEstados(actual: string | undefined): { id: EstadoParceiro; label: string; nota: string }[] {
  const de = (ESTADOS_PARCEIRO as readonly string[]).includes(actual ?? '')
    ? (actual as EstadoParceiro) : 'prospect';
  return TRANSICOES[de].map((e) => ({ id: e, label: ROTULO_ESTADO[e], nota: EXPLICACAO_ESTADO[e] }));
}

// ── Interacções ──────────────────────────────────────────────────────────────

export const TIPOS_INTERACCAO = ['chamada', 'email', 'reuniao', 'nota', 'formulario'] as const;
export type TipoInteraccao = typeof TIPOS_INTERACCAO[number];

export const ROTULO_INTERACCAO: Record<TipoInteraccao, string> = {
  chamada:    'Chamada',
  email:      'Email',
  reuniao:    'Reunião',
  nota:       'Nota',
  formulario: 'Formulário',
};

/**
 * Uma coisa que aconteceu com este prospecto.
 *
 * Colecção própria (`crm_interaccoes`) e não um array dentro do parceiro: ao fim de meses
 * de angariação a lista cresce sem limite, e um documento que cresce sem limite acaba por
 * bater no tecto de 16 MB do Mongo — mas muito antes disso já estaria a ser lido inteiro
 * de cada vez que alguém abre a lista de parceiros.
 *
 * O email é um tipo com particularidades: leva o modelo, a versão do texto, e para onde
 * foi. As outras são só o que a gerente de conta escreveu.
 */
export interface CrmInteraccao {
  _id?: string;
  partnerId: string;
  tipo: TipoInteraccao;
  em: Date;
  actor: string;
  /** O que aconteceu, por palavras de quem esteve lá. */
  resumo: string;
  email?: {
    para: string;
    template: string;
    /** A versão do texto que esta pessoa recebeu. Ver lib/crm/apresentacao.ts. */
    versao: string;
    /** Porque é que foi (re)enviado. Vazio no primeiro envio. */
    motivo?: string;
    enviado: boolean;
    erro?: string;
  };
}

/**
 * O endereço para onde as leads devem seguir.
 *
 * Preferência: o contacto marcado com `recebeLeads`, depois o `email` da ficha. Sem
 * isto, uma empresa que declarou `geral@` para angariação e `operacoes@` para leads
 * receberia tudo no primeiro, onde ninguém age.
 */
export function emailParaLeads(p: Pick<CrmPartner, 'contactos' | 'email'>): string | undefined {
  const marcado = (p.contactos ?? []).find((c) => c.recebeLeads && String(c.email ?? '').includes('@'));
  if (marcado?.email) return marcado.email.trim();
  const proprio = String(p.email ?? '').trim();
  return proprio.includes('@') ? proprio : undefined;
}

/** Todos os endereços conhecidos da empresa, sem repetidos. Serve o reenvio a pedido. */
export function emailsConhecidos(p: Pick<CrmPartner, 'contactos' | 'email'>): string[] {
  const todos = [
    ...(p.contactos ?? []).map((c) => c.email),
    p.email,
  ];
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const e of todos) {
    const v = String(e ?? '').trim().toLowerCase();
    if (v.includes('@') && !vistos.has(v)) { vistos.add(v); saida.push(v); }
  }
  return saida;
}
