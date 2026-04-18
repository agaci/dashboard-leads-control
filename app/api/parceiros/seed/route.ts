import { getDb } from '@/lib/mongodb';
import { MRW_TARIFFS } from '@/data/mrw-tariffs';

// POST /api/parceiros/seed — importa tarifas MRW (idempotente)
export async function POST() {
  try {
    const db = await getDb();

    let inserted = 0;
    let skipped = 0;

    for (const tariff of MRW_TARIFFS) {
      const exists = await db.collection('partnerTariffs').findOne({
        partner: tariff.partner,
        deliveryWindow: tariff.deliveryWindow,
        zone: tariff.zone,
        serviceLabel: tariff.serviceLabel,
      });

      if (!exists) {
        await db.collection('partnerTariffs').insertOne({ ...tariff, updatedAt: new Date() });
        inserted++;
      } else {
        skipped++;
      }
    }

    return Response.json({ success: true, inserted, skipped, total: MRW_TARIFFS.length });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
