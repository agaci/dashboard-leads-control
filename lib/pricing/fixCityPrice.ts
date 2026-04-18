import { geocode } from './geocode';
import { classifyPoints } from './cityPolygon';
import { haversine } from './haversine';
import { getDistanceMatrix } from './distanceMatrix';
import type { FixCityPriceResult } from '@/types/pricing';

const MILESTONE_COORDS: Record<'Lisboa' | 'Porto', { lat: number; lng: number }> = {
  Lisboa: { lat: 38.7169, lng: -9.1399 },
  Porto:  { lat: 41.1579, lng: -8.6291 },
};

// poligonos da BD: [[...Lisboa], [...Porto]]
export async function fixCityPrice(
  local_recolha: string,
  local_entrega: string,
  poligonos: [number, number][][]
): Promise<FixCityPriceResult> {
  const [origem, destino] = await Promise.all([
    geocode(local_recolha),
    geocode(local_entrega),
  ]);

  const { LX, PT, GLX_GPT } = classifyPoints([origem, destino], poligonos);
  const milestone: 'Lisboa' | 'Porto' = LX >= PT ? 'Lisboa' : 'Porto';
  const milestoneCoords = MILESTONE_COORDS[milestone];

  // Ordenar pontos por distância haversine ao milestone
  const pontos = [
    { address: local_recolha, coords: origem },
    { address: local_entrega, coords: destino },
  ].sort((a, b) => haversine(milestoneCoords, a.coords) - haversine(milestoneCoords, b.coords));

  // [milestone, ...pontos_ordenados, milestone]
  const addresses = [milestone, ...pontos.map((p) => p.address), milestone];

  const { distanciaFinal, duracaoTotal } = await getDistanceMatrix(addresses);

  return { LX, PT, GLX_GPT, milestone, distanciaFinal, duracaoTotal };
}
