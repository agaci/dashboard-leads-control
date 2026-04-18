import { getDb } from '@/lib/mongodb';

// Retorna contagem de eventos novos desde o timestamp indicado
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const since = new Date(searchParams.get('since') ?? Date.now() - 30000);

  const db = await getDb();
  const [escalations, leads] = await Promise.all([
    db.collection('conversations').countDocuments({
      step: 'ESCALATED_TO_HUMAN',
      updatedAt: { $gte: since },
    }),
    db.collection('messages').countDocuments({
      messageType: 'newLead',
      companyProvider: 'Yourbox',
      timeStamp: { $gte: since },
    }),
  ]);

  return Response.json({ escalations, leads });
}
