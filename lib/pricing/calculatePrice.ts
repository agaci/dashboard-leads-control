import type { FixCityPriceResult, PriceResult } from '@/types/pricing';

// outOfHoursFees da BD:
// timeWindow1=8, flatRate1=0 → 08h-18h: sem extra (normal)
// timeWindow2=18, flatRate2=50 → 18h-21h: +50%
// timeWindow3=21, flatRate3=100 → 21h-24h: +100%
// timeWindow4=24, flatRate4=200 → 0h-8h: +200%
function calcSumFlatRate(ooh: any, hour: number, day: number): number {
  if (!ooh) return 1;

  // Fim-de-semana
  if (day === 6 && ooh.flatRateSaturdays != null)
    return 1 + ooh.flatRateSaturdays / 100;
  if (day === 0 && ooh.flatRateSundays != null)
    return 1 + ooh.flatRateSundays / 100;

  // Dias úteis — janelas horárias
  if (hour < ooh.timeWindow1) return 1 + (ooh.flatRate4 ?? 200) / 100;  // madrugada
  if (hour < ooh.timeWindow2) return 1 + (ooh.flatRate1 ?? 0) / 100;    // horário principal
  if (hour < ooh.timeWindow3) return 1 + (ooh.flatRate2 ?? 50) / 100;   // início noite
  return 1 + (ooh.flatRate3 ?? 100) / 100;                               // noite tarde
}

function calcSumAdditionalKms(ooh: any, hour: number, day: number): number {
  if (!ooh) return 1;

  if (day === 6 && ooh.additionalKmsFeeSaturdays != null)
    return 1 + ooh.additionalKmsFeeSaturdays / 100;
  if (day === 0 && ooh.additionalKmsFeeSundays != null)
    return 1 + ooh.additionalKmsFeeSundays / 100;

  if (hour < ooh.timeWindow1) return 1 + (ooh.additionalKmsFee4 ?? 200) / 100;
  if (hour < ooh.timeWindow2) return 1 + (ooh.additionalKmsFee1 ?? 0) / 100;
  if (hour < ooh.timeWindow3) return 1 + (ooh.additionalKmsFee2 ?? 50) / 100;
  return 1 + (ooh.additionalKmsFee3 ?? 100) / 100;
}

export function calculatePrice(
  result: FixCityPriceResult,
  params: { type: string; precedence: string },
  settings: any
): PriceResult {
  const IVA = parseFloat(process.env.IVA || '1.23');
  const GLX_GPT = result.GLX_GPT > 0 ? 1 : 0;
  const LX_PT = Math.max(0, result.LX + result.PT - 1);
  const totalDistance = result.distanciaFinal;

  const typeSettings = settings[`type${params.type}`]?.[`precedence${params.precedence}`];
  if (!typeSettings) {
    throw new Error(
      `Configuração não encontrada: type${params.type} / precedence${params.precedence}`
    );
  }

  const { priceKm, priceMin } = typeSettings;
  const percentPlusMax: number =
    settings.percentPlusMaxForcalcPriceMachineForAPIFromSiteYourbox ?? 1;
  const percentPlusMin: number =
    settings.percentPlusMinForcalcPriceMachineForAPIFromSiteYourbox ?? 1;

  // API pública usa preço base — sem surcharge de horário
  const sumFlatRate = 1;
  const sumAdditionalKms = 1;

  const maxPrice =
    totalDistance * priceKm * sumAdditionalKms +
    priceMin * (LX_PT + GLX_GPT) * sumFlatRate;

  const finalMax = Math.round(percentPlusMax * maxPrice * 10 * IVA) / 10;
  const finalMin = Math.round(percentPlusMin * priceMin * 10 * IVA) / 10;

  return {
    maxPrice: finalMax,
    minPrice: finalMin,
    totalDistance,
    totalDuration: result.duracaoTotal,
    type: params.type,
    precedence: params.precedence,
    LX_PT,
    GLX_GPT,
  };
}
