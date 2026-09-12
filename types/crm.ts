/**
 * CRM de Parceiros — modelo de dados.
 *
 * Especificação em SPECS-CRM-Parceiros.md; estado da implementação em CRM_IMPLEMENTACAO.md.
 *
 * Duas linhas de negócio que o sistema tem de distinguir estruturalmente (spec §3):
 *
 *   route: 'subcontract'  Linha A — a YourBox gere o serviço, factura ao cliente final,
 *                         paga tabela + margem ao parceiro.
 *   route: 'lead_sale'    Linha B — a YourBox vende a informação. Não gere, não factura
 *                         ao cliente final, não assume responsabilidade pelo serviço.
 *
 * A rota não é escolha da operadora: sai da categoria, por triagem automática
 * (lib/crm/triagem.ts).
 */

export type CrmRoute = 'subcontract' | 'lead_sale';

/** Categorias conhecidas. A rota de cada uma vive em lib/crm/categorias.ts. */
export type CrmCategoria =
  | 'expresso'        // A — 1h/4h, motor de preço próprio
  | 'arrasto'         // A — 24h, tabela de parceiro logístico
  | 'viaturas'        // B — transporte de automóveis, motos, reboques
  | 'mudancas'        // B — mudanças e recheios
  | 'adr'             // B — mercadorias perigosas, radioactivo
  | 'temperatura'     // B — cadeia de frio, temperatura controlada
  | 'fora_gabarito'   // B — dimensões acima do que a tabela cobre
  | 'sobrepeso';      // B — peso acima da capacidade própria e dos parceiros de tabela

/** Confiança da triagem. 'baixa' pede olho humano antes de distribuir. */
export type CrmConfianca = 'alta' | 'media' | 'baixa';

// ── Estados (spec §8) ──────────────────────────────────────────────

// Os estados e as transições vêm de lib/crm/estados.ts, que é quem os faz cumprir.
// Ficam re-exportados daqui por conveniência de quem só quer os tipos do modelo.
export type { EstadoConsulta, EstadoDispatch } from '@/lib/crm/estados';
import type { EstadoConsulta, EstadoDispatch } from '@/lib/crm/estados';

// ── Canais (spec §9.1) ───────────────────────────────────────────────────────

export type CrmCanal = 'whatsapp' | 'email' | 'sms' | 'push';

/** Templates que a Meta tem de pré-aprovar (spec §9.3) — desenhados cedo, de propósito. */
export type CrmTemplate = 'nova_lead' | 'nova_consulta' | 'adjudicacao' | 'saldo_baixo' | 'followup_cliente';

// ── crm_partners ─────────────────────────────────────────────────────────────

/**
 * Estados do parceiro, do primeiro contacto ao trabalho.
 *
 * Os quatro originais mantêm-se com o mesmo significado; os cinco do meio são os passos
 * da angariação, que antes viviam todos dentro de `prospect`. A lista viva, com as
 * transições legítimas e os rótulos, está em lib/crm/angariacao.ts — este tipo existe só
 * para o TypeScript, e as duas têm de andar a par.
 */
/** Escalões de dimensão. A ordem é a da grandeza, e a interface conta com isso. */
export type DimensaoParceiro = 'individual' | 'micro' | 'pequena' | 'media' | 'grande';

export type EstadoParceiro =
  | 'prospect' | 'contactado' | 'registado' | 'em_avaliacao'
  | 'trial' | 'ativo' | 'suspenso' | 'descartado' | 'opos_se';

/**
 * Uma pessoa da empresa parceira.
 *
 * `recebeLeads` marca quem recebe as leads por email. Só um é que a tem — se ninguém a
 * tiver, vale o `email` da ficha, que é o comportamento que havia antes de existirem
 * contactos. Duas pessoas a receber a mesma lead seria duas pessoas a ligar ao cliente.
 */
export interface CrmContacto {
  nome: string;
  cargo?: string;
  email?: string;
  telefone?: string;
  recebeLeads?: boolean;
  notas?: string;
}

export interface CrmPartner {
  _id?: string;
  nome: string;
  nif?: string;
  contacto?: string;              // pessoa de contacto
  telefone?: string;              // com indicativo; usado pelos canais whatsapp/sms
  email?: string;
  /** Morada da empresa. Onde ela está — não confundir com o que cobre. */
  morada?: string;
  /**
   * As pessoas da empresa.
   *
   * Os campos `contacto`, `telefone` e `email` continuam a existir e assumem uma pessoa
   * só — o que chega para um parceiro já feito e não chega para a angariação, onde há
   * quem atende o telefone, o gerente que decide, e o endereço para onde enviar leads.
   * Quando esta lista tem alguém marcado com `recebeLeads`, é esse o endereço da
   * distribuição; sem ela, continua a valer o `email` de sempre.
   */
  contactos?: CrmContacto[];
  /** A que gerente de conta pertence. Sem isto, duas ligam à mesma empresa. */
  atribuidoA?: string;
  atribuidoEm?: Date;
  /** De onde veio: lista, indicação, feira, entrada espontânea. Diz que fontes repetir. */
  origem?: string;
  /** Próximo toque combinado. É o que ordena a fila de trabalho do dia. */
  followUpEm?: Date | null;
  /** NIF já existe acima; aqui fica a prova de que a empresa pode transportar. */
  alvara?: string;
  /**
   * Quantas pessoas a empresa tem, em escalão.
   *
   * Escalão e não número exacto por duas razões: um número exacto está desactualizado no
   * dia seguinte, e um escalão é coisa que alguém preenche sem hesitar. Uma empresa que
   * se recusa a dizer "somos 14" marca "6 a 20" sem pensar duas vezes.
   */
  dimensao?: DimensaoParceiro;
  /**
   * Viaturas, aproximadamente.
   *
   * Para uma transportadora isto diz mais sobre capacidade do que o número de pessoas:
   * três carrinhas ou trinta é a diferença entre aguentar duas leads por semana ou vinte.
   */
  viaturas?: number | null;
  /** Porque é que saiu do funil. Obrigatório em `descartado` e `opos_se`. */
  motivoSaida?: string;
  /**
   * Zonas que a empresa cobre, declaradas uma vez na ficha.
   *
   * As capacidades herdam-nas quando não declaram as suas (ver lib/crm/zonas.ts): assim
   * a cobertura escreve-se uma vez, e só se repete num serviço com alcance diferente —
   * mudanças no país todo mas ADR só no Porto, por exemplo.
   *
   * Vazio = nacional, que era o comportamento antes de este campo existir.
   */
  zonas?: string[];
  canaisPreferidos: CrmCanal[];   // ordem de preferência; a política escolhe o primeiro utilizável
  deviceTokens: string[];         // fase 2 (push) — o campo existe desde já para evitar migração
  estado: EstadoParceiro;
  score: number;                  // 0-100, calculado em lib/crm/outcomes.ts
  leadsGratisRestantes: number;   // trial pago em dados (spec §6.1)
  notas?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// ── crm_capabilities ─────────────────────────────────────────────────────────

/**
 * A peça mais crítica do sistema (spec §7): uma linha por combinação
 * categoria × zona × restrições. Responde a "quem pode fazer isto?".
 *
 * Um limite a `null` ou ausente quer dizer "sem limite", não "zero".
 */
export interface CrmCapability {
  _id?: string;
  partnerId: string;
  categoria: CrmCategoria;
  zonas: string[];                // 'nacional' cobre tudo; senão distritos em minúsculas
  maxWeightKg?: number | null;
  maxDimensionCm?: number | null; // C+L+A
  adr?: boolean;                  // certificado para mercadorias perigosas
  temperatura?: boolean;          // cadeia de frio
  tiposViatura?: string[];        // vazio = indiferente
  prioridade: number;             // desempate manual; menor entra primeiro
  active: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// ── crm_consultas ────────────────────────────────────────────────────────────

export interface CrmHistoryEntry {
  estado: EstadoConsulta;
  timestamp: Date;
  actor: string;                  // nome do operador, 'sistema' ou 'parceiro:<id>'
  motivo: string;
}

export interface CrmConsultaPedido {
  origem?: string;
  destino?: string;
  zona?: string;                  // distrito da recolha, minúsculas
  urgencia?: string;
  viatura?: string;
  /** Tipo de material escolhido no formulário. Sinal estruturado para a triagem. */
  material?: string;
  /**
   * Perguntas do quiz a que a pessoa respondeu "não sei".
   *
   * O quiz continua a mandar um número — a estimativa que mostrou ao cliente, porque o
   * motor de preço precisa de um — mas aqui fica dito que foi estimativa e não resposta.
   * Sem isto os dois casos chegam iguais: "Não sei" no peso gravava 10 kg, exactamente o
   * mesmo que alguém que escolheu "5 a 15 kg" a sério.
   */
  naoSei?: string[];
  weightKg?: number | null;
  nVolumes?: number | null;
  totalCm?: number | null;
  observacoes?: string;
}

export interface CrmConsulta {
  _id?: string;
  route: CrmRoute;
  categoria: CrmCategoria;
  estado: EstadoConsulta;
  origem: {
    tipo: 'lead' | 'telefone' | 'email' | 'manual';
    leadId?: string;              // messages._id (string do Meteor ou ObjectId em texto)
    convId?: string;
  };
  cliente: { nome?: string; telefone?: string; email?: string };
  pedido: CrmConsultaPedido;
  triagem: { categoria: CrmCategoria; route: CrmRoute; motivo: string; confianca: CrmConfianca; at: Date };
  valorLead?: number;             // CPL cobrado ao parceiro (só Linha B)
  /**
   * Autorização do cliente para o pedido seguir para uma empresa especializada.
   *
   * Sem isto a distribuição recusa-se a correr. É a base legal da Linha B (RGPD, spec
   * §11) e não pode ser uma norma que alguém se esqueça de cumprir — tem de ser um
   * portão no código, como o CPL a zero já é.
   *
   * `via` diz onde foi dado:
   *   'telefone'    a gerente de conta recolhe-o na chamada e regista-o
   *   'email'       a gerente regista que o cliente autorizou por escrito, fora daqui
   *   'link_email'  o próprio cliente carregou no botão do email automático
   *   'quiz'        a pessoa carregou no botão do ecrã de sucesso
   *
   * 'link_email' vale mais do que os outros como prova: ninguém teve de o transcrever,
   * e fica registado o momento exacto e o texto que estava no ecrã. Por isso é uma via
   * própria e não se confunde com 'email'.
   */
  consentimento?: { em: Date; via: 'quiz' | 'telefone' | 'email' | 'link_email'; actor: string; guiao?: { versao: string; texto: string } | null } | null;
  /**
   * Pedido de autorização enviado ao cliente por email, à espera de resposta.
   *
   * Existe separado do `consentimento` porque são coisas diferentes: isto é a pergunta,
   * aquilo é a resposta. Uma consulta pode ter pergunta sem resposta durante dias, e é
   * preciso saber distinguir "ainda não perguntámos" de "perguntámos e não respondeu" —
   * a primeira pede uma chamada, a segunda já não.
   */
  autorizacao?: {
    pedidaEm: Date;
    para: string;                 // email para onde foi
    expiraEm: Date;
    respondidaEm?: Date | null;
    resposta?: 'sim' | 'nao' | null;
  } | null;
  entregueAt?: Date | null;
  recusaExpiraEm?: Date | null;   // janela de recusa de 24h (spec §6.3)
  followUpEnviadoAt?: Date | null;
  /**
   * O parceiro contestou a lead e o cliente, depois, disse que ficou resolvida.
   *
   * Fica marcado e nao age: nada e cobrado automaticamente. O cliente pode ter resolvido
   * com outra empresa qualquer, e cobrar a forca por uma inferencia estraga a relacao com
   * um parceiro honesto por causa de um caso ambiguo. Ver lib/crm/score.ts.
   */
  contradicao?: { at: Date; motivo: string } | null;
  /**
   * A gerente de conta corrigiu a triagem, depois de falar com o cliente.
   *
   * Fica ao lado de `triagem` e não por cima dela: `triagem` é o que a máquina decidiu, e
   * reescrevê-lo apagava a prova de que errou. É a diferença entre os dois que diz onde
   * as regras de lib/crm/categorias.ts precisam de trabalho.
   */
  reclassificacao?: {
    em: Date;
    actor: string;
    motivo: string;
    de: { route: CrmRoute; categoria: CrmCategoria };
    para: { route: CrmRoute; categoria: CrmCategoria };
  } | null;
  history: CrmHistoryEntry[];
  createdAt: Date;
  updatedAt: Date;
}

// ── crm_dispatches ───────────────────────────────────────────────────────────

/**
 * Cada envio a um parceiro concreto. Chave única (consultaId, partnerId, canal):
 * um retry de webhook nunca pode gerar duas mensagens nem dois débitos (spec §7).
 */
export interface CrmDispatch {
  _id?: string;
  consultaId: string;
  partnerId: string;
  canal: CrmCanal;
  template: CrmTemplate;
  estado: EstadoDispatch;
  /**
   * `<consultaId>:<partnerId>:<canal>` enquanto o envio esta vivo; APAGADO quando falha.
   *
   * E este campo, e so ele, que carrega a idempotencia: um indice unico e sparse sobre
   * ele rejeita o segundo envio pelo mesmo canal. A presenca do campo significa "vivo".
   * Ao falhar faz-se `$unset`, o que liberta o canal para nova tentativa sem apagar o
   * registo da falha. Ver lib/crm/indices.ts para a razao de ser um campo so.
   */
  chaveViva?: string;
  sentAt?: Date | null;
  deliveredAt?: Date | null;
  seenAt?: Date | null;
  respondedAt?: Date | null;
  expiresAt?: Date | null;
  erro?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ── crm_wallet + crm_transactions ────────────────────────────────────────────

export interface CrmWallet {
  _id?: string;                   // = partnerId
  saldo: number;                  // euros
  limiteAviso: number;            // abaixo disto dispara o template saldo_baixo
  avisoEnviadoAt?: Date | null;
  updatedAt: Date;
}

export type TipoTransacao = 'carregamento' | 'debito' | 'estorno' | 'ajuste';

export interface CrmTransaction {
  _id?: string;
  partnerId: string;
  tipo: TipoTransacao;
  valor: number;                  // sempre positivo; o sinal está no tipo
  saldoApos: number;
  dispatchId?: string | null;     // cada débito aponta para o envio que o originou
  /**
   * `<dispatchId>:<tipo>`, so em debitos e estornos. Carrega a idempotencia do dinheiro
   * pelo mesmo mecanismo do `chaveViva`. Carregamentos e ajustes nao o tem — e por isso
   * podem repetir-se, que e o que um carregamento de saldo faz por natureza.
   */
  chaveDebito?: string;
  consultaId?: string | null;
  motivo: string;
  actor: string;
  createdAt: Date;
}

// ── crm_outcomes ─────────────────────────────────────────────────────────────

/** As três fontes independentes da triangulação (spec §6). */
export type FonteOutcome = 'parceiro' | 'cliente' | 'plataforma';

export interface CrmOutcome {
  _id?: string;
  consultaId: string;
  partnerId?: string | null;
  fonte: FonteOutcome;
  tipo: string;                   // 'ganhou' | 'perdeu' | 'recusa' | 'resolveu' | 'nao_resolveu' | 'abriu'
  valorServico?: number | null;   // euros, quando reportado
  avaliacao?: number | null;      // 1-5, do cliente
  motivo?: string;
  /** Presente nas respostas que so contam uma vez. Ver lib/crm/outcomes.ts. */
  chaveUnica?: string;
  createdAt: Date;
}

// ── crm_config ───────────────────────────────────────────────────────────────

/** Configuração viva do CRM (`crm_config`, `_id: 'crm_main'`). */
export interface CrmConfig {
  active: boolean;
  /** CPL por categoria, em euros. Grelha de partida da spec §5.2. */
  cpl: Record<string, number>;
  /** Quantos parceiros recebem a mesma lead. 1 = exclusiva, que é o que a spec defende. */
  maxParceirosPorLead: number;
  /**
   * Distribuir sem passar pela operadora.
   *
   * Desligado (o normal), a triagem corre na mesma e a consulta fica a aguardar: é a
   * operadora que decide e dispara. Ligado, uma lead da Linha B com consentimento e
   * parceiro elegível segue sozinha.
   *
   * Nasce desligado e assim deve ficar até haver historico que mostre que a triagem
   * acerta. Uma lead vendida por engano não se desvende.
   */
  envioAutomatico: boolean;
  /**
   * Pedir a autorização ao cliente por email, sozinho, mal a lead é classificada.
   *
   * Existe para as horas em que não há ninguém: de madrugada e ao fim-de-semana uma lead
   * da Linha B ficava parada até alguém chegar, e um pedido de transporte tem prazo de
   * validade curto. Com isto ligado, a pergunta é feita na hora.
   *
   * Feito para se desligar quando há gerentes de conta à frente da plataforma: a chamada
   * fecha melhor do que um email, e as duas coisas ao mesmo tempo são o cliente a ser
   * abordado duas vezes pela mesma coisa.
   */
  pedirAutorizacaoPorEmail: boolean;
  /** Quanto tempo o link de autorização se mantém válido. */
  autorizacaoValidadeHoras: number;
  janelaRecusaHoras: number;
  followUpHoras: number;
  limiteAvisoSaldo: number;
  leadsGratisTrial: number;
  /** Pesos do score. Questão em aberto na spec §13 — assumido, não decidido. */
  pesosScore: { reporte: number; recusa: number; cliente: number; resposta: number };
}
