import type { PartnerTariff, PartnerPriceResult } from '@/types/partner';

/**
 * Calcula o preço base de uma tarifa de parceiro dado peso e dimensão.
 * @param tariff   - documento da colecção partnerTariffs
 * @param kg       - peso total em kg
 * @param totalCm  - perímetro do maior volume (C+A+L) em cm, 0 se não aplicável
 * @param isSaturday - se a recolha é ao sábado
 * @param markup   - multiplicador de margem (e.g. 1.35). Se não fornecido, usa tariff.markup ?? 1.0
 */
export function calcPartnerPrice(
  tariff: PartnerTariff,
  kg: number,
  totalCm = 0,
  isSaturday = false,
  markup?: number,
): PartnerPriceResult {
  // ── Preço por peso ────────────────────────────────────────────────────────
  const kgRounded = Math.max(kg, tariff.conditions.minWeightPerVolume);

  let weightPrice = 0;
  const tiers = tariff.weightTiers;

  // Encontrar tier aplicável
  const mainTier = tiers
    .filter((t) => t.maxKg !== undefined)
    .sort((a, b) => (a.maxKg ?? 0) - (b.maxKg ?? 0))
    .find((t) => kgRounded <= (t.maxKg ?? Infinity));

  const additionalTier = tiers.find((t) => t.additionalPerKg !== undefined);
  const maxTier = tiers
    .filter((t) => t.maxKg !== undefined)
    .sort((a, b) => (b.maxKg ?? 0) - (a.maxKg ?? 0))[0];

  if (mainTier) {
    weightPrice = mainTier.price;
  } else if (additionalTier && maxTier) {
    // Acima do último tier: usar preço do último + adicionais por kg extra
    const extraKg = Math.ceil(kgRounded - (maxTier.maxKg ?? 0));
    weightPrice = maxTier.price + extraKg * (additionalTier.price ?? 0);
  }

  // Suplemento >40kg e >60kg por volume (simplificado: aplicar se peso > 40kg)
  let weightSupplement = 0;
  if (kg > 60 && tariff.conditions.surchargeAt60kg) {
    weightSupplement = tariff.conditions.surchargeAt60kg;
  } else if (kg > 40 && tariff.conditions.surchargeAt40kg) {
    weightSupplement = tariff.conditions.surchargeAt40kg;
  }
  weightPrice += weightSupplement;

  // ── Suplemento dimensional ────────────────────────────────────────────────
  let dimensionalSurcharge = 0;
  if (totalCm > 150 && tariff.dimensionalSurcharges.length > 0) {
    const dimTier = tariff.dimensionalSurcharges
      .sort((a, b) => a.minCm - b.minCm)
      .find((d) => totalCm >= d.minCm && totalCm <= d.maxCm);
    if (dimTier) dimensionalSurcharge = dimTier.surcharge;
  }

  // ── Suplementos base ──────────────────────────────────────────────────────
  let supplementsTotal = 0;
  if (tariff.supplements.above25km) supplementsTotal += tariff.supplements.above25km;
  if (isSaturday && tariff.supplements.saturday) supplementsTotal += tariff.supplements.saturday;

  // ── Preço base total ──────────────────────────────────────────────────────
  const basePrice = Math.round((weightPrice + dimensionalSurcharge + supplementsTotal) * 100) / 100;

  // ── Markup ────────────────────────────────────────────────────────────────
  const appliedMarkup = markup ?? tariff.markup ?? 1.0;
  const finalPrice = Math.round(basePrice * appliedMarkup * 100) / 100;

  return {
    tariffId: tariff._id ?? '',
    partner: tariff.partner,
    serviceLabel: tariff.serviceLabel,
    serviceLabelShort: tariff.serviceLabelShort,
    deliveryWindow: tariff.deliveryWindow,
    basePrice,
    markup: appliedMarkup,
    finalPrice,
    breakdown: {
      weightPrice: Math.round((weightPrice) * 100) / 100,
      dimensionalSurcharge,
      supplements: supplementsTotal,
    },
  };
}

/**
 * Calcula preços para todas as tarifas activas de uma zona.
 * Retorna ordenado por sortOrder.
 */
export function calcAllActiveTariffs(
  tariffs: PartnerTariff[],
  kg: number,
  totalCm = 0,
  isSaturday = false,
  defaultMarkup = 1.0,
): PartnerPriceResult[] {
  return tariffs
    .filter((t) => t.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((t) => calcPartnerPrice(t, kg, totalCm, isSaturday, t.markup ?? defaultMarkup));
}

/** Extrai um número de kg do texto do utilizador. */
export function parseWeight(text: string): number | null {
  const match = text.match(/(\d+([,.]\d+)?)/);
  if (!match) return null;
  const val = parseFloat(match[1].replace(',', '.'));
  return isNaN(val) || val <= 0 ? null : val;
}
