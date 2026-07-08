import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status   = searchParams.get('status') ?? 'all'; // active | escalated | closed | all
    const limit    = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200);
    const dateFrom = searchParams.get('dateFrom');
    const dateTo   = searchParams.get('dateTo');

    const db = await getDb();

    const filter: Record<string, unknown> = {};
    if (status === 'active')    filter.step = { $nin: ['CLOSED', 'LEAD_REGISTERED', 'ESCALATED_TO_HUMAN'] };
    if (status === 'escalated') filter.step = 'ESCALATED_TO_HUMAN';
    if (status === 'closed')    filter.step = { $in: ['CLOSED', 'LEAD_REGISTERED'] };
    if (status === 'contact')   filter.contactRequestOpen = true; // pedidos de contacto por atender

    // Pedidos de contacto por atender ignoram o filtro de data (são sempre urgentes).
    if ((dateFrom || dateTo) && status !== 'contact') {
      const range: Record<string, Date> = {};
      if (dateFrom) range.$gte = new Date(dateFrom);
      if (dateTo)   range.$lte = new Date(dateTo);
      filter.createdAt = range;
    }

    const conversations = await db
      .collection('conversations')
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .project({ history: { $slice: -1 }, telemovel: 1, canal: 1, step: 1, data: 1, createdAt: 1, updatedAt: 1, escalatedAt: 1, closedAt: 1, leadId: 1, contactRequestOpen: 1, contactRequestChannel: 1, quizVariante: 1 })
      .toArray();

    return Response.json({ success: true, conversations });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
