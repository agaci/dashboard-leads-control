export interface WeightTier {
  maxKg?: number;          // undefined = "additional per extra kg"
  additionalPerKg?: number;
  price: number;
}

export interface DimensionalSurcharge {
  minCm: number;
  maxCm: number;
  surcharge: number;
}

export interface PartnerSupplements {
  saturday?: number;
  above25km?: number;      // always applied for Nacional routes
}

export interface PartnerConditions {
  minWeightPerVolume: number;     // kg
  maxWeightPerExpedition: number; // kg
  maxWeightPerVolume: number;     // kg
  surchargeAt40kg?: number;       // per volume
  surchargeAt60kg?: number;       // per volume
  maxDimensionCm: number;         // C+A+L limit
}

export interface PartnerTariff {
  _id?: string;
  partner: string;                // "MRW" — internal, never exposed to customer
  serviceLabel: string;           // "Entrega Amanhã até às 19h" — customer-facing
  serviceLabelShort: string;      // "Amanhã 19h"
  deliveryWindow: string;         // "19h" | "13h" | "10h" | "8h30"
  deliveryDescription: string;    // "Entrega garantida até às 19h do dia seguinte"
  zone: string;                   // "Nacional"
  active: boolean;
  sortOrder: number;              // ordering in bot options (lower = shown first)
  markup?: number;                // overrides global defaultMarkup (e.g. 1.35 = +35%)
  validFrom: Date;
  weightTiers: WeightTier[];
  dimensionalSurcharges: DimensionalSurcharge[];
  supplements: PartnerSupplements;
  conditions: PartnerConditions;
  notes?: string;
  updatedAt?: Date;
}

export interface PartnerPriceResult {
  tariffId: string;
  partner: string;
  serviceLabel: string;
  serviceLabelShort: string;
  deliveryWindow: string;
  deliveryDescription?: string;
  basePrice: number;         // raw cost (cost to YourBox)
  markup: number;            // multiplier applied
  finalPrice: number;        // basePrice * markup (what customer pays)
  breakdown: {
    weightPrice: number;
    dimensionalSurcharge: number;
    supplements: number;
  };
}
