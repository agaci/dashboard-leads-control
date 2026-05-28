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

export interface PartnerDepot {
  name: string;    // "Alfragide"
  address: string; // endereço completo para geocoding
  maxKm: number;   // distância máxima rodoviária da recolha ao depósito
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

export interface NotificationTarget {
  name: string;
  phone: string;
  email: string;
  events: ('escalation' | 'lead')[];
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
  aggEscalationThreshold?: number;
  partnerDepots?: PartnerDepot[];
  urgencyPhone?: string;
  assistantName?: string;
  voiceAssistantName?: string;
  voiceAssistantGender?: 'female' | 'male';
  notificationTargets?: NotificationTarget[];
  botScheduleOverride?: {
    startHour: number;
    endHour: number;
  };
  calcPriceMachine?: string;
  depotDistanceMultiplier?: number; // multiplicador da distância origem→depósito (1 = simples, 2 = ida e volta, etc.)
}

export interface PriceBreakdown {
  serviceType: '24H' | 'direto' | 'parceiro';
  timestamp: Date;

  partner?: {
    name: string;
    tariffId: string;
    weightKg: number;
    dimensionsCm: number;
    basePrice: number;
    fuelPercent: number;
    fuelCharge: number;
    basePriceWithFuel: number;
    markup: number;
    priceBeforeIVA: number;
  };

  depot?: {
    name: string;
    distanceKm: number;
    distanceMultiplier: number;
    type: string;
    precedence: string;
    priceKm: number;
    priceMin: number;
    LX_PT: number;
    GLX_GPT: number;
    basePrice: number;
  };

  directService?: {
    distanceKm: number;
    type: string;
    precedence: string;
    priceKm: number;
    priceMin: number;
    LX_PT: number;
    GLX_GPT: number;
    basePrice: number;
    percentPlusMax: number;
    priceWithMarkup: number;
  };

  calculator: {
    name: string;
  };

  final: {
    subtotalBeforeIVA: number;
    ivaRate: number;
    finalPrice: number;
  };
}
