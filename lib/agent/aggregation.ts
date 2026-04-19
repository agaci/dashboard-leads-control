import { getDb } from '@/lib/mongodb';
import { geocode } from '@/lib/pricing/geocode';
import { haversine } from '@/lib/pricing/haversine';

const BEARING_TOLERANCE = 35;   // graus — tolerância angular do corredor
const MAX_DETOUR_KM = 12;       // desvio máximo por ponto (recolha + entrega)
const HOURS_WINDOW = 5;         // horas à frente a considerar

export type AggHint = {
  serviceId: string;
  score: number;
  serviceTime: string | null;
  pickup: string | null;
  delivery: string | null;
  detourPickupKm: number;
  detourDeliveryKm: number;
  bearingDiff: number;
  isReturnTrip: boolean;       // true = sentido inverso (viagem de volta)
  driver: { name: string; phone: string } | null;
  driverLocationStale: boolean;
};

function bearing(from: { lat: number; lng: number }, to: { lat: number; lng: number }): number {
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function bearingDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export async function findAggregationHints(
  origemStr: string,
  destinoStr: string,
): Promise<{ hints: AggHint[]; leadDistanceKm: number; leadBearing: number }> {
  const [leadOrigem, leadDestino] = await Promise.all([
    geocode(origemStr),
    geocode(destinoStr),
  ]);

  const leadBearing = bearing(leadOrigem, leadDestino);
  const leadDistance = haversine(leadOrigem, leadDestino);

  const db = await getDb();
  const now = new Date();
  const windowEnd = new Date(now.getTime() + HOURS_WINDOW * 3600 * 1000);

  // parameters.dataHour está guardado como Date no MongoDB
  const services = await db.collection('services').find({
    companyProvider: 'Yourbox',
    status: { $in: ['pending', 'assigned', 'accepted'] },
    'parameters.dataHour': { $gte: now, $lte: windowEnd },
  }).limit(200).toArray();

  const hints: AggHint[] = [];

  for (const svc of services) {
    // Extrair ponto de recolha e entrega do array points[]
    const pts: any[] = svc.points ?? [];
    const collectionPt = pts.find((p: any) => p.collectionOrDelivery === 'collection' && p.data?.lat);
    const deliveryPt = pts.findLast?.((p: any) => p.collectionOrDelivery === 'delivery' && p.data?.lat)
      ?? pts.filter((p: any) => p.collectionOrDelivery === 'delivery' && p.data?.lat).at(-1);

    if (!collectionPt || !deliveryPt) continue;

    const svcOrigem = { lat: collectionPt.data.lat as number, lng: collectionPt.data.lng as number };
    const svcDestino = { lat: deliveryPt.data.lat as number, lng: deliveryPt.data.lng as number };
    const pickupAddr: string = collectionPt.addressLocal ?? null;
    const deliveryAddr: string = deliveryPt.addressLocal ?? null;

    const svcBearing = bearing(svcOrigem, svcDestino);
    const bDiff = bearingDiff(leadBearing, svcBearing);

    // ── Sentido directo: corredor paralelo ──────────────────────────────────
    const isForward = bDiff <= BEARING_TOLERANCE;

    // ── Sentido inverso: viagem de volta ────────────────────────────────────
    // O motorista completa o serviço em svcDestino e volta vazio.
    // Pode recolher a lead (leadOrigem ≈ svcDestino) e entregar (leadDestino ≈ svcOrigem)
    const isReverse = bDiff >= (180 - BEARING_TOLERANCE) && bDiff <= (180 + BEARING_TOLERANCE);

    if (!isForward && !isReverse) continue;

    let detourPickup: number;
    let detourDelivery: number;

    if (isForward) {
      // Desvio para ir buscar a lead à recolha
      detourPickup = Math.min(
        haversine(svcOrigem, leadOrigem),
        haversine(svcDestino, leadOrigem),
      );
      // Desvio para entregar a lead no destino
      detourDelivery = Math.min(
        haversine(svcOrigem, leadDestino),
        haversine(svcDestino, leadDestino),
      );
    } else {
      // Sentido inverso: motorista termina em svcDestino e volta
      detourPickup = haversine(svcDestino, leadOrigem);   // motorista está em svcDestino, vai buscar lead em leadOrigem
      detourDelivery = haversine(svcOrigem, leadDestino);  // entrega lead no leadDestino (próximo do svcOrigem)
    }

    if (detourPickup > MAX_DETOUR_KM || detourDelivery > MAX_DETOUR_KM) continue;

    // Pontuação 0-100
    const effectiveBDiff = isReverse ? Math.abs(bDiff - 180) : bDiff;
    const bearingScore = 1 - effectiveBDiff / BEARING_TOLERANCE;
    const detourScore = 1 - (detourPickup + detourDelivery) / (MAX_DETOUR_KM * 2);
    // Viagem de volta penaliza ligeiramente (menos certa)
    const returnPenalty = isReverse ? 0.85 : 1;
    const score = Math.round(bearingScore * 0.5 * returnPenalty * 100 + detourScore * 0.5 * 100);

    const driverInfo = svc.driver?.driver ?? svc.driver ?? null;
    const driverName = driverInfo?.name ?? null;
    const driverPhone = driverInfo?.phoneNumber ?? driverInfo?.phone ?? null;
    const isAssigned = !!driverName && driverName !== 'weby driver';

    const serviceTime = svc.parameters?.dataHour
      ? new Date(svc.parameters.dataHour).toISOString()
      : null;

    hints.push({
      serviceId: svc._id?.toString() ?? '',
      score,
      serviceTime,
      pickup: pickupAddr,
      delivery: deliveryAddr,
      detourPickupKm: Math.round(detourPickup * 10) / 10,
      detourDeliveryKm: Math.round(detourDelivery * 10) / 10,
      bearingDiff: Math.round(bDiff),
      isReturnTrip: isReverse,
      driver: isAssigned ? { name: driverName!, phone: driverPhone ?? '' } : null,
      driverLocationStale: !isAssigned,
    });
  }

  hints.sort((a, b) => b.score - a.score);

  return {
    hints: hints.slice(0, 5),
    leadDistanceKm: Math.round(leadDistance * 10) / 10,
    leadBearing: Math.round(leadBearing),
  };
}
