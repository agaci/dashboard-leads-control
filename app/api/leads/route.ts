import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') ?? 'all';
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200);
    const skip = parseInt(searchParams.get('skip') ?? '0');

    const db = await getDb();

    const filter: Record<string, unknown> = { companyProvider: 'Yourbox' };
    if (type === 'leads')        filter.messageType = 'newLead';
    else if (type === 'sims')    filter.messageType = { $in: ['preLeadSimulation', 'clientSimulation'] };
    else if (type === 'urgente') { filter.messageType = 'newLead'; filter['leadData.urgencia'] = '1 Hora'; }
    else                         filter.messageType = { $in: ['newLead', 'preLeadSimulation', 'clientSimulation'] };

    const [docs, total] = await Promise.all([
      db.collection('messages')
        .find(filter)
        .sort({ timeStamp: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      db.collection('messages').countDocuments(filter),
    ]);

    const leads = docs.map((d: any) => ({
      id: d._id.toString(),
      messageType: d.messageType,
      timeStamp: d.timeStamp,
      closed: d.closed,
      closedAt: d.closedAt,
      message: d.message,
      senderName: d.senderName,
      variante: d.variante ?? null,
      leadData: d.leadData ?? {},
    }));

    return Response.json({ success: true, leads, total, skip, limit });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
