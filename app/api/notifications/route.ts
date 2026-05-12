import { getDb } from '@/lib/mongodb';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const since = new Date(searchParams.get('since') ?? Date.now() - 30000);

  const db = await getDb();
  const [escalations, leadDocs, aggHintConvs, liveChats, newBotConvs] = await Promise.all([
    db.collection('conversations').countDocuments({
      step: 'ESCALATED_TO_HUMAN',
      updatedAt: { $gte: since },
    }),
    db.collection('messages').find({
      messageType: 'newLead',
      companyProvider: 'Yourbox',
      timeStamp: { $gte: since },
    }, { projection: { 'leadData.urgencia': 1, 'leadData.serviceType': 1 } }).limit(5).toArray(),
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
    db.collection('conversations').countDocuments({
      step: 'LIVE_CHAT',
      history: { $elemMatch: { role: 'lead', timestamp: { $gte: since } } },
    }),
    // Novas conversas bot chegaram ao inbox (preço apresentado)
    db.collection('conversations').countDocuments({
      createdAt: { $gte: since },
      step: { $nin: ['CLOSED', 'LEAD_REGISTERED', 'ESCALATED_TO_HUMAN', 'LIVE_CHAT'] },
    }),
  ]);

  const leads = leadDocs.length;
  const leadDetails = leadDocs.map((d: any) => ({
    urgencia:    d.leadData?.urgencia ?? null,
    serviceType: d.leadData?.serviceType ?? null,
  }));

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

  return Response.json({ escalations, leads, leadDetails, aggHints, liveChats, newBotConvs });
}
