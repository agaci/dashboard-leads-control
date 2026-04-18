// Estados da conversa — máquina de estados do bot
export type ConversationStep =
  | 'INIT'
  | 'COLLECTING_ORIGEM'
  | 'COLLECTING_DESTINO'
  | 'COLLECTING_VIATURA'
  | 'COLLECTING_URGENCIA'
  // fluxo direto (1h / 4h) — YourBox próprio
  | 'CALCULATING_PRICE'
  | 'PRESENTING_PRICE'
  | 'HANDLING_OBJECTION'
  // fluxo arrasto (amanhã) — parceiro
  | 'COLLECTING_WEIGHT'
  | 'PRESENTING_PARTNER_PRICE'
  // fecho
  | 'COLLECTING_NOME'
  | 'COLLECTING_EMAIL'
  | 'LEAD_REGISTERED'
  | 'ESCALATED_TO_HUMAN'
  | 'CLOSED';

export interface ConversationData {
  origem?: string;
  destino?: string;
  viatura?: string;           // 'Moto' | 'Furgão Classe 1' | 'Furgão Classe 2'
  peso?: string;
  urgencia?: string;          // '1 Hora' | '4 Horas' | '24 Horas'
  serviceType?: 'direto' | 'arrasto';
  nome?: string;
  email?: string;
  telemovel: string;
  // resultado direto (YourBox)
  priceCalculated?: number;
  priceWithDiscount?: number;
  discount?: number;
  distance?: number;
  simulationId?: string;
  // resultado arrasto (parceiro)
  weightKg?: number;
  partnerTariffId?: string;
  partnerBasePrice?: number;
  partnerFinalPrice?: number;
  partnerWindow?: string;
  // situação activa
  activeSituacaoId?: string;
  objectionCount: number;
}

export interface Conversation {
  _id?: string;
  telemovel: string;
  canal: 'whatsapp' | 'web' | 'dashboard';
  step: ConversationStep;
  data: ConversationData;
  history: ConversationMessage[];
  createdAt: Date;
  updatedAt: Date;
  escalatedAt?: Date;
  closedAt?: Date;
  leadId?: string;        // messages._id após lead registada
}

export interface ConversationMessage {
  role: 'lead' | 'bot' | 'bo';  // bo = back-office (resposta manual do agente humano)
  text: string;
  timestamp: Date;
  situacaoId?: string;
}

export interface BotResponse {
  text: string;
  nextStep: ConversationStep;
  situacaoId?: string;
  quickReplies?: string[];  // botões de resposta rápida (WhatsApp)
  escalate?: boolean;
}

// Estrutura de uma situação do JSON
export interface Situacao {
  id: string;
  titulo: string;
  categoria: string;
  frequencia: string;
  sinais_deteccao: string[];
  dialogo_exemplo: { papel: 'lead' | 'ai'; msg: string }[];
  perguntas_qualificacao: string[];
  logica_decisao: Record<string, string | Record<string, unknown>>;
  script_resposta: Record<string, string>;
  escalamento_humano: string[];
  kpi_sucesso: string;
}
