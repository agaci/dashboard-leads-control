import type { Db } from 'mongodb';
import { geocode } from '@/lib/pricing/geocode';
import { classifyPoints } from '@/lib/pricing/cityPolygon';
import { getDistanceMatrix } from '@/lib/pricing/distanceMatrix';
import type { PartnerDepot, FixCityPriceResult } from '@/types/pricing';

export type { PartnerDepot };

export interface DepotPricingResult {
  depot: PartnerDepot;
  distanceKm: number;
  pickupPrice: number; // preço base YourBox para recolha → depósito (SEM markup, SEM IVA)
  type: string;
  precedence: string;
  priceKm: number;
  priceMin: number;
  LX_PT: number;
  GLX_GPT: number;
  viaturaOverridden: boolean;   // true se o tipo foi elevado pelo peso real
  viaturaRequired: string | null; // nova viatura necessária (ex: 'Auto'), ou null
}

// Mapeia peso kg → nome de viatura
const TYPE_TO_VIATURA: Record<string, string> = {
  '2': 'Moto',
  '50': 'Auto',
  '150': 'Furgão Classe 1',
  '300': 'Furgão Classe 2',
};

function typeForWeight(kg: number): string {
  if (kg <= 2) return '2';
  if (kg <= 50) return '50';
  if (kg <= 150) return '150';
  return '300';
}

/**
 * Calcula o preço de recolha da origem até ao depósito mais próximo dentro do limite.
 * Retorna null se nenhum depósito estiver dentro do limite de km → sinal de escalamento.
 *
 * Usa distância DIRETA origem→depósito (getDistanceMatrix com 2 pontos), não a rota
 * circular do fixCityPrice (que calcula Lisboa→A→B→Lisboa e daria distâncias erradas).
 *
 * Se weightKg for fornecido e requerer um tipo maior que o da viatura escolhida,
 * o tipo é elevado automaticamente e viaturaOverridden=true é devolvido.
 */
// Limite de C+L+A por tipo de veículo (cm)
const MAX_CM_PER_TYPE: Record<string, number> = {
  '2': 100, // Moto: 40×30×30
};

export async function calcDepotPickupPrice(
  origem: string,
  viatura: string,
  urgencia: string,
  depots: PartnerDepot[],
  db: Db,
  calcName?: string,
  weightKg?: number,
  totalCm?: number,
): Promise<DepotPricingResult | null> {
  if (!depots || depots.length === 0) return null;

  const resolvedCalcName = calcName ?? process.env.CALC_PRICE_MACHINE ?? 'calculator_1_FixCityPriceAPI';
  const settings = await db.collection('calculators').findOne({
    name: resolvedCalcName,
    companyProvider: 'Yourbox',
  });
  if (!settings) return null;

  // Geocodificar origem uma vez
  const origemCoords = await geocode(origem);

  // Para cada depósito: geocodificar + distância direta A→B em paralelo
  const results = await Promise.allSettled(
    depots.map(async (depot) => {
      const depotCoords = await geocode(depot.address);
      const { distanciaFinal, duracaoTotal } = await getDistanceMatrix([origem, depot.address]);
      const { LX, PT, GLX_GPT } = classifyPoints([origemCoords, depotCoords], settings.poligonos);
      const milestone: 'Lisboa' | 'Porto' = LX >= PT ? 'Lisboa' : 'Porto';
      const fixResult: FixCityPriceResult = { LX, PT, GLX_GPT, milestone, distanciaFinal, duracaoTotal };
      return { fixResult, distanciaFinal };
    }),
  );

  // Depósito mais próximo dentro do limite
  let bestDepot: PartnerDepot | null = null;
  let bestFixResult: FixCityPriceResult | null = null;
  let bestDistance = Infinity;

  for (let i = 0; i < depots.length; i++) {
    const r = results[i];
    if (r.status !== 'fulfilled') continue;
    const dist = r.value.distanciaFinal;
    if (dist <= depots[i].maxKm && dist < bestDistance) {
      bestDepot = depots[i];
      bestFixResult = r.value.fixResult;
      bestDistance = dist;
    }
  }

  if (!bestDepot || !bestFixResult) return null;

  // Determinar type e precedence com a mesma lógica do agente principal
  const pesoMap: Record<string, string> = {
    'Moto': '2',
    'Auto': '50',
    'Furgão Classe 1': '150',
    'Furgão Classe 2': '300',
  };
  const pesoRaw = pesoMap[viatura] ?? '150';
  const typeFromPeso = (p: string): string => {
    const n = parseInt(p);
    return n <= 2 ? '2' : n <= 50 ? '50' : n <= 150 ? '150' : '300';
  };
  let type = typeFromPeso(pesoRaw);
  let precedence = urgencia === '1 Hora' ? '1' : '4';

  if (bestDistance > (settings.globalParameters?.distance2To50 ?? 999) && type === '2') type = '50';
  if (bestDistance > (settings.globalParameters?.distance4To1 ?? 999) || new Date().getHours() > 13) precedence = '1';

  // Se o peso real requer um tipo maior, elevar automaticamente
  let viaturaOverridden = false;
  let viaturaRequired: string | null = null;
  if (weightKg !== undefined && weightKg > 0) {
    const requiredType = typeForWeight(weightKg);
    if (parseInt(requiredType) > parseInt(type)) {
      type = requiredType;
      viaturaOverridden = true;
      viaturaRequired = TYPE_TO_VIATURA[requiredType] ?? null;
    }
  }

  // Se o volume total (C+L+A) exceder o limite do tipo actual, elevar para type50
  // (MAX_CM_PER_TYPE só existe para type2 — para os restantes não há restrição de volume)
  if (totalCm !== undefined && totalCm > 0) {
    const maxCm = MAX_CM_PER_TYPE[type];
    if (maxCm !== undefined && totalCm > maxCm) {
      type = '50';
      viaturaOverridden = true;
      viaturaRequired = 'Auto';
    }
  }

  // Calcular preço base do depot — SEM markup, SEM IVA
  // Fórmula: distância × priceKm + priceMin × (LX_PT + GLX_GPT)
  const typeSettings = settings[`type${type}`]?.[`precedence${precedence}`];
  if (!typeSettings) return null;

  const { priceKm, priceMin } = typeSettings;
  const GLX_GPT_val = bestFixResult.GLX_GPT > 0 ? 1 : 0;
  const LX_PT = Math.max(0, bestFixResult.LX + bestFixResult.PT - 1);

  const basePriceDepot = bestDistance * priceKm + priceMin * (LX_PT + GLX_GPT_val);
  const pickupPrice = Math.round(basePriceDepot * 100) / 100;

  return {
    depot: bestDepot,
    distanceKm: bestDistance,
    pickupPrice,  // preço base apenas, SEM markup, SEM IVA
    type,
    precedence,
    priceKm,
    priceMin,
    LX_PT,
    GLX_GPT: GLX_GPT_val,
    viaturaOverridden,
    viaturaRequired,
  };
}
