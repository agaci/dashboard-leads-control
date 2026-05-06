import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';

const ACTIVE_STEPS = [
  'INIT', 'COLLECTING_ORIGEM', 'COLLECTING_DESTINO', 'COLLECTING_VIATURA',
  'COLLECTING_URGENCIA', 'COLLECTING_WEIGHT', 'COLLECTING_VOLUMES',
  'CALCULATING_PRICE', 'PRESENTING_PRICE', 'PRESENTING_PARTNER_PRICE',
  'HANDLING_OBJECTION', 'COLLECTING_NOME', 'COLLECTING_EMAIL', 'COLLECTING_NOTAS',
  'COLLECTING_ORIGEM_COMPLETA', 'CONFIRMING_ORIGEM_COMPLETA',
  'COLLECTING_DESTINO_COMPLETA', 'CONFIRMING_DESTINO_COMPLETA',
  'COLLECTING_DETALHES_RECOLHA', 'COLLECTING_DETALHES_ENTREGA', 'AWAITING_PAYMENT',
];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get('dateFrom');
    const dateTo   = searchParams.get('dateTo');

    const dateMatch: Record<string, unknown> = {};
    if (dateFrom || dateTo) {
      const range: Record<string, Date> = {};
      if (dateFrom) range.$gte = new Date(dateFrom);
      if (dateTo)   range.$lte = new Date(dateTo);
      dateMatch.createdAt = range;
    }

    const db = await getDb();
    const col = db.collection('conversations');

    const [active, escalated, closed, all] = await Promise.all([
      col.countDocuments({ step: { $in: ACTIVE_STEPS }, ...dateMatch }),
      col.countDocuments({ step: 'ESCALATED_TO_HUMAN', ...dateMatch }),
      col.countDocuments({ step: { $in: ['CLOSED', 'LEAD_REGISTERED'] }, ...dateMatch }),
      col.countDocuments({ ...dateMatch }),
    ]);

    return Response.json({ success: true, counts: { active, escalated, closed, all } });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
