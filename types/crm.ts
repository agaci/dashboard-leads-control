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

export type EstadoParceiro = 'prospect' | 'trial' | 'ativo' | 'suspenso';

export interface CrmPartner {
  _id?: string;
  nome: string;
  nif?: string;
  contacto?: string;              // pessoa de contacto
  telefone?: string;              // com indicativo; usado pelos canais whatsapp/sms
  email?: string;
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
   * `via` diz onde foi dado: 'telefone' quando a operadora o recolhe na chamada e o
   * regista, 'quiz' quando a pessoa carrega no botão do ecrã de sucesso.
   */
  consentimento?: { em: Date; via: 'quiz' | 'telefone' | 'email'; actor: string; guiao?: { versao: string; texto: string } | null } | null;
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
  janelaRecusaHoras: number;
  followUpHoras: number;
  limiteAvisoSaldo: number;
  leadsGratisTrial: number;
  /** Pesos do score. Questão em aberto na spec §13 — assumido, não decidido. */
  pesosScore: { reporte: number; recusa: number; cliente: number; resposta: number };
}
