import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';
import type { PartnerTariff } from '@/types/partner';

// GET /api/parceiros — lista todas as tarifas (activas ou todas)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get('active') === 'true';
    const zone = searchParams.get('zone');

    const db = await getDb();
    const filter: Record<string, unknown> = {};
    if (activeOnly) filter.active = true;
    if (zone) filter.zone = zone;

    const tariffs = await db
      .collection('partnerTariffs')
      .find(filter)
      .sort({ sortOrder: 1, partner: 1 })
      .toArray();

    return Response.json({ success: true, tariffs });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/parceiros — criar nova tarifa
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Omit<PartnerTariff, '_id'>;
    if (!body.partner || !body.serviceLabel || !body.deliveryWindow) {
      return Response.json({ error: 'partner, serviceLabel e deliveryWindow são obrigatórios' }, { status: 400 });
    }

    const db = await getDb();
    const doc = { ...body, updatedAt: new Date(), validFrom: new Date(body.validFrom) };
    const result = await db.collection('partnerTariffs').insertOne(doc);

    return Response.json({ success: true, id: result.insertedId.toString() }, { status: 201 });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
