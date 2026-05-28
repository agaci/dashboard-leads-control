import type { PriceBreakdown } from '@/types/pricing';
import type { PartnerTariff, PartnerPriceResult } from '@/types/partner';
import type { FixCityPriceResult, PriceResult } from '@/types/pricing';

/** Constrói breakdown para serviço direto (1H/4H YourBox) */
export function buildDirectServiceBreakdown(
  fixResult: FixCityPriceResult,
  priceResult: PriceResult,
  basePrice: number,
  percentPlusMax: number,
  discountApplied: boolean,
  calculatorName: string,
): PriceBreakdown {
  const IVA = parseFloat(process.env.IVA || '1.23');
  const priceWithMarkup = basePrice * percentPlusMax;
  const finalPrice = Math.round(priceWithMarkup * IVA * 100) / 100;

  return {
    serviceType: 'direto',
    timestamp: new Date(),
    directService: {
      distanceKm: fixResult.distanciaFinal,
      type: priceResult.type,
      precedence: priceResult.precedence,
      priceKm: 0, // ← será preenchido do typeSettings no handler
      priceMin: 0, // ← será preenchido do typeSettings no handler
      LX_PT: priceResult.LX_PT,
      GLX_GPT: priceResult.GLX_GPT,
      basePrice,
      percentPlusMax,
      priceWithMarkup,
    },
    calculator: { name: calculatorName },
    final: {
      subtotalBeforeIVA: priceWithMarkup,
      ivaRate: IVA,
      finalPrice,
    },
  };
}

export interface DepotInfo {
  name: string;
  distanceKm: number;
  distanceMultiplier?: number;
  effectiveDistanceKm?: number;
  type?: string;
  precedence?: string;
  priceKm?: number;
  priceMin?: number;
  LX_PT?: number;
  GLX_GPT?: number;
}

/** Constrói breakdown para serviço 24H (parceiro + depot) */
export function buildPartnerServiceBreakdown(
  tariff: PartnerTariff,
  weightKg: number,
  dimensionsCm: number,
  partnerPrice: PartnerPriceResult,
  depotPrice: number | undefined,
  calculatorName: string,
  depotInfo?: DepotInfo,
): PriceBreakdown {
  const IVA = parseFloat(process.env.IVA || '1.23');

  // finalPrice = (basePriceWithFuel × markup + depot) × IVA
  // Derivar subtotal a partir do preço final para garantir consistência nos totais
  const subtotalBeforeIVA = partnerPrice.finalPrice / IVA;
  const partnerBeforeIVA = subtotalBeforeIVA - (depotPrice ?? 0);
  const finalPrice = partnerPrice.finalPrice; // usar o preço real que foi mostrado ao utilizador

  const breakdown: PriceBreakdown = {
    serviceType: '24H',
    timestamp: new Date(),
    partner: {
      name: tariff.partner,
      tariffId: tariff._id ?? '',
      weightKg,
      dimensionsCm,
      basePrice: partnerPrice.breakdown.weightPrice,
      fuelPercent: tariff.fuelSurchargePercent ?? 0,
      fuelCharge: partnerPrice.breakdown.fuelCharge,
      basePriceWithFuel: partnerPrice.breakdown.weightPrice + partnerPrice.breakdown.fuelCharge,
      markup: partnerPrice.markup,
      priceBeforeIVA: partnerBeforeIVA,
    },
    calculator: { name: calculatorName },
    final: {
      subtotalBeforeIVA,
      ivaRate: IVA,
      finalPrice,
    },
  };

  if (depotPrice !== undefined) {
    const mult = depotInfo?.distanceMultiplier ?? 1;
    const rawDist = depotInfo?.distanceKm ?? 0;
    breakdown.depot = {
      name: depotInfo?.name ?? 'Depot',
      distanceKm: rawDist,
      distanceMultiplier: mult,
      type: depotInfo?.type ?? '50',
      precedence: depotInfo?.precedence ?? '4',
      priceKm: depotInfo?.priceKm ?? 0,
      priceMin: depotInfo?.priceMin ?? 0,
      LX_PT: depotInfo?.LX_PT ?? 0,
      GLX_GPT: depotInfo?.GLX_GPT ?? 0,
      basePrice: depotPrice,
    };
  }

  return breakdown;
}
