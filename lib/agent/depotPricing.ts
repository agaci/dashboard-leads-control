import type { Db } from 'mongodb';
import { fixCityPrice } from '@/lib/pricing/fixCityPrice';
import { calculatePrice } from '@/lib/pricing/calculatePrice';
import type { PartnerDepot } from '@/types/pricing';

export type { PartnerDepot };

export interface DepotPricingResult {
  depot: PartnerDepot;
  distanceKm: number;
  pickupPrice: number; // preço máximo YourBox para recolha → depósito (IVA incl.)
}

/**
 * Calcula o preço de recolha da origem até ao depósito mais próximo dentro do limite.
 * Retorna null se nenhum depósito estiver dentro do limite de km → sinal de escalamento.
 */
export async function calcDepotPickupPrice(
  origem: string,
  viatura: string,
  urgencia: string,
  depots: PartnerDepot[],
  db: Db,
): Promise<DepotPricingResult | null> {
  if (!depots || depots.length === 0) return null;

  const settings = await db.collection('calculators').findOne({
    name: process.env.CALC_PRICE_MACHINE,
    companyProvider: 'Yourbox',
  });
  if (!settings) return null;

  // Distância rodoviária para todos os depósitos em paralelo
  const results = await Promise.allSettled(
    depots.map((depot) => fixCityPrice(origem, depot.address, settings.poligonos)),
  );

  // Depósito mais próximo dentro do limite
  let bestDepot: PartnerDepot | null = null;
  let bestFixResult: Awaited<ReturnType<typeof fixCityPrice>> | null = null;
  let bestDistance = Infinity;

  for (let i = 0; i < depots.length; i++) {
    const r = results[i];
    if (r.status !== 'fulfilled') continue;
    const dist = r.value.distanciaFinal;
    if (dist <= depots[i].maxKm && dist < bestDistance) {
      bestDepot = depots[i];
      bestFixResult = r.value;
      bestDistance = dist;
    }
  }

  if (!bestDepot || !bestFixResult) return null;

  // Determinar type e precedence com a mesma lógica do agente principal
  const pesoMap: Record<string, string> = {
    'Moto': '2',
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

  const priceResult = calculatePrice(bestFixResult, { type, precedence }, settings);

  return {
    depot: bestDepot,
    distanceKm: bestDistance,
    pickupPrice: priceResult.maxPrice,
  };
}
