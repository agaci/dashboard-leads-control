import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') ?? 'all'; // active | escalated | closed | all
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200);

    const db = await getDb();

    const filter: Record<string, unknown> = {};
    if (status === 'active')    filter.step = { $nin: ['CLOSED', 'LEAD_REGISTERED', 'ESCALATED_TO_HUMAN'] };
    if (status === 'escalated') filter.step = 'ESCALATED_TO_HUMAN';
    if (status === 'closed')    filter.step = { $in: ['CLOSED', 'LEAD_REGISTERED'] };

    const conversations = await db
      .collection('conversations')
      .find(filter)
      .sort({ updatedAt: -1 })
      .limit(limit)
      .project({ history: { $slice: -1 }, telemovel: 1, canal: 1, step: 1, data: 1, createdAt: 1, updatedAt: 1, escalatedAt: 1, closedAt: 1, leadId: 1 })
      .toArray();

    return Response.json({ success: true, conversations });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
