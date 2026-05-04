import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get('dateFrom');
    const dateTo   = searchParams.get('dateTo');

    const base: Record<string, unknown> = { companyProvider: 'Yourbox', messageType: 'newLead' };
    if (dateFrom || dateTo) {
      const range: Record<string, Date> = {};
      if (dateFrom) range.$gte = new Date(dateFrom);
      if (dateTo)   range.$lte = new Date(dateTo);
      base.timeStamp = range;
    }

    const db = await getDb();
    const col = db.collection('messages');

    const [all, leads, sims, urgente] = await Promise.all([
      col.countDocuments({ ...base }),
      col.countDocuments({ ...base, variante: 'BOT' }),
      col.countDocuments({ ...base, variante: { $ne: 'BOT' } }),
      col.countDocuments({ ...base, 'leadData.urgencia': '1 Hora' }),
    ]);

    return Response.json({ success: true, counts: { all, leads, sims, urgente } });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
