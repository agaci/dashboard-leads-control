import { getDb } from '@/lib/mongodb';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const since = new Date(searchParams.get('since') ?? Date.now() - 30000);

  const db = await getDb();
  const [escalations, leads, aggHintConvs] = await Promise.all([
    db.collection('conversations').countDocuments({
      step: 'ESCALATED_TO_HUMAN',
      updatedAt: { $gte: since },
    }),
    db.collection('messages').countDocuments({
      messageType: 'newLead',
      companyProvider: 'Yourbox',
      timeStamp: { $gte: since },
    }),
    db.collection('conversations').find({
      aggHintsAt: { $gte: since },
      aggHintsSeen: false,
      'aggHints.0': { $exists: true },
    }, {
      projection: {
        _id: 1, telemovel: 1,
        'data.origem': 1, 'data.destino': 1,
        aggHints: { $slice: 1 },
      },
    }).limit(10).toArray(),
  ]);

  const aggHints = aggHintConvs.map((c: any) => ({
    convId: c._id?.toString(),
    refCode: '#' + (c._id?.toString() ?? '').slice(-5).toUpperCase(),
    telemovel: c.telemovel,
    origem: c.data?.origem ?? '',
    destino: c.data?.destino ?? '',
    hintCount: c.aggHints?.length ?? 0,
    topScore: c.aggHints?.[0]?.score ?? 0,
    topDriver: c.aggHints?.[0]?.driver ?? null,
  }));

  return Response.json({ escalations, leads, aggHints });
}
