import { getDb } from '@/lib/mongodb';
import { geocode } from '@/lib/pricing/geocode';
import { haversine } from '@/lib/pricing/haversine';

const BEARING_TOLERANCE = 35;   // graus — tolerância angular do corredor
const MAX_DETOUR_KM = 15;       // km extra acima da rota directa (fórmula triangular)

export type AggHint = {
  serviceId: string;
  nr: string | number | null;    // número do serviço Yourbox
  serviceStatus: string;         // pending | assigned | accepted
  pointsStatuses: Array<{ type: string; status: string }>;
  score: number;
  serviceTime: string | null;    // ISO — dataHour do serviço, para o BO coordenar
  timeDeltaMin: number;          // minutos entre agora e o dataHour (negativo = já passou/em curso)
  pickup: string | null;
  delivery: string | null;
  detourPickupKm: number;
  detourDeliveryKm: number;
  bearingDiff: number;
  isReturnTrip: boolean;
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

// Km extra que o motorista percorre para incluir ponto X no trajecto A→B.
// = dist(A,X) + dist(X,B) - dist(A,B)  →  0 se X está no caminho natural.
function routeDetour(
  a: { lat: number; lng: number },
  x: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  return Math.max(0, haversine(a, x) + haversine(x, b) - haversine(a, b));
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

  // Filtrar apenas por estado — sem restrição de hora.
  // O BO coordena a compatibilidade temporal com base no dataHour apresentado no sticker.
  const services = await db.collection('services').find({
    companyProvider: 'Yourbox',
    status: { $in: ['pending', 'assigned', 'accepted'] },
  }).limit(300).toArray();

  const hints: AggHint[] = [];

  for (const svc of services) {
    const pts: any[] = svc.points ?? [];
    const collectionPt = pts.find((p: any) => p.collectionOrDelivery === 'collection' && p.data?.lat);
    const deliveryPt =
      pts.findLast?.((p: any) => p.collectionOrDelivery === 'delivery' && p.data?.lat) ??
      pts.filter((p: any) => p.collectionOrDelivery === 'delivery' && p.data?.lat).at(-1);

    if (!collectionPt || !deliveryPt) continue;

    const svcOrigem  = { lat: collectionPt.data.lat as number, lng: collectionPt.data.lng as number };
    const svcDestino = { lat: deliveryPt.data.lat   as number, lng: deliveryPt.data.lng   as number };
    const pickupAddr: string   = collectionPt.addressLocal ?? null;
    const deliveryAddr: string = deliveryPt.addressLocal   ?? null;

    const svcBearing = bearing(svcOrigem, svcDestino);
    const bDiff      = bearingDiff(leadBearing, svcBearing);

    // ── Sentido directo ──────────────────────────────────────────────────────
    const isForward = bDiff <= BEARING_TOLERANCE;

    // ── Sentido inverso (viagem de volta) ────────────────────────────────────
    // Motorista termina em svcDestino e regressa vazio —
    // pode recolher a lead e agregar no sentido de regresso.
    const isReverse = bDiff >= (180 - BEARING_TOLERANCE) && bDiff <= (180 + BEARING_TOLERANCE);

    if (!isForward && !isReverse) continue;

    // ── Desvio real (km extra acima da rota directa do motorista) ────────────
    let detourPickup: number;
    let detourDelivery: number;

    if (isForward) {
      // Rota base: svcOrigem → svcDestino
      detourPickup   = routeDetour(svcOrigem,  leadOrigem,  svcDestino);
      detourDelivery = routeDetour(svcOrigem,  leadDestino, svcDestino);
    } else {
      // Rota de regresso: svcDestino → svcOrigem (vazio)
      detourPickup   = routeDetour(svcDestino, leadOrigem,  svcOrigem);
      detourDelivery = routeDetour(svcDestino, leadDestino, svcOrigem);
    }

    if (detourPickup > MAX_DETOUR_KM || detourDelivery > MAX_DETOUR_KM) continue;

    // ── Score geográfico 0-100 (sem componente temporal — o BO coordena) ─────
    const effectiveBDiff = isReverse ? Math.abs(bDiff - 180) : bDiff;
    const bearingScore   = 1 - effectiveBDiff / BEARING_TOLERANCE;
    const detourScore    = 1 - (detourPickup + detourDelivery) / (MAX_DETOUR_KM * 2);
    const returnPenalty  = isReverse ? 0.85 : 1.0;

    const score = Math.round((bearingScore * 0.5 + detourScore * 0.5) * returnPenalty * 100);

    // ── Hora do serviço — só para apresentação no sticker ───────────────────
    const dataHour     = svc.parameters?.dataHour ? new Date(svc.parameters.dataHour) : null;
    const timeDeltaMin = dataHour
      ? Math.round((dataHour.getTime() - now.getTime()) / 60_000)
      : 0;

    const driverInfo  = svc.driver?.driver ?? svc.driver ?? null;
    const driverName  = driverInfo?.name ?? null;
    const driverPhone = driverInfo?.phoneNumber ?? driverInfo?.phone ?? null;
    const isAssigned  = !!driverName && driverName !== 'weby driver';

    hints.push({
      serviceId:         svc._id?.toString() ?? '',
      nr:                svc.nr ?? null,
      serviceStatus:     svc.status,
      pointsStatuses:    [
        { type: 'collection', status: collectionPt.status ?? 'unknown' },
        { type: 'delivery',   status: deliveryPt.status   ?? 'unknown' },
      ],
      score,
      serviceTime:       dataHour ? dataHour.toISOString() : null,
      timeDeltaMin,
      pickup:            pickupAddr,
      delivery:          deliveryAddr,
      detourPickupKm:    Math.round(detourPickup   * 10) / 10,
      detourDeliveryKm:  Math.round(detourDelivery * 10) / 10,
      bearingDiff:       Math.round(bDiff),
      isReturnTrip:      isReverse,
      driver:            isAssigned ? { name: driverName!, phone: driverPhone ?? '' } : null,
      driverLocationStale: !isAssigned,
    });
  }

  hints.sort((a, b) => b.score - a.score);

  return {
    hints:          hints.slice(0, 5),
    leadDistanceKm: Math.round(leadDistance * 10) / 10,
    leadBearing:    Math.round(leadBearing),
  };
}
