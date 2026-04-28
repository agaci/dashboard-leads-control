export interface PriceRequest {
  local_recolha: string;
  local_entrega: string;
  peso_total?: string;       // "2" | "50" | "150" | "300"
  viatura?: string;          // "Moto" | "Furgão Classe 1" | "Furgão Classe 2"
  urgencia: string;          // "1 Hora" | "4 Horas" | "24 Horas"
  nome?: string;
  email?: string;
  telemovel?: string;
  variante?: string;
  numero_volumes?: string;
  comprimento?: string;
  largura?: string;
  altura?: string;
}

export interface FixCityPriceResult {
  LX: number;
  PT: number;
  GLX_GPT: number;
  milestone: 'Lisboa' | 'Porto';
  distanciaFinal: number;    // km
  duracaoTotal: number;      // horas
}

export interface PriceResult {
  maxPrice: number;
  minPrice: number;
  totalDistance: number;
  totalDuration: number;
  type: string;
  precedence: string;
  LX_PT: number;
  GLX_GPT: number;
}

export type RoutingDecision = 'AUTO' | 'MANUAL';

export interface LeadDocument {
  _id?: string;
  createdAt: Date;
  origem: string;
  destino: string;
  viatura: string;
  urgencia: string;
  nome?: string;
  email?: string;
  telemovel?: string;
  peso?: string;
  dimensoes?: { comprimento?: number; largura?: number; altura?: number };
  preco?: { min: number; max: number; distancia: number } | null;
  routing: RoutingDecision;
  status: 'pending' | 'contacted' | 'converted' | 'lost';
  variante?: string;
  agentSituacaoId?: string;
  botAssigned: boolean;
  botAssignedAt?: Date;
}

export interface LeadRoutingConfig {
  systemActive: boolean;
  alwaysBot: boolean;
  delayMinutesBeforeBot: number;
  autoStartHour: number;
  autoEndHour: number;
  autoWeekends: boolean;
  defaultMarkup: number;
  recolherMoradasCompletas: boolean;
  pagamentoAtivo: boolean;
  pagamentoProvider: 'paybylink' | 'mbway' | 'stripe';
  whatsappBotAtivo?: boolean;
  whatsappNumero?: string;
  evolutionApiUrl?: string;
  evolutionApiKey?: string;
  evolutionInstance?: string;
  botScheduleOverride?: {
    startHour: number;
    endHour: number;
  };
}
