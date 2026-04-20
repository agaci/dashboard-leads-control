import { getDb } from '@/lib/mongodb';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dateStr = searchParams.get('date') ?? new Date().toISOString().slice(0, 10);

  // Interpretar a data em hora de Lisboa (UTC+1/+2) convertendo para UTC
  const dayStart = new Date(dateStr + 'T00:00:00.000+01:00');
  const dayEnd   = new Date(dateStr + 'T23:59:59.999+01:00');

  const db = await getDb();
  const convs = await db.collection('conversations').find({
    aggHintsAt: { $gte: dayStart, $lte: dayEnd },
    'aggHints.0': { $exists: true },
  })
    .sort({ aggHintsAt: -1 })
    .limit(100)
    .toArray();

  return Response.json({
    success: true,
    items: convs.map((c: any) => ({
      convId:     c._id.toString(),
      refCode:    '#' + c._id.toString().slice(-5).toUpperCase(),
      telemovel:  c.telemovel,
      origem:     c.data?.origem  ?? '',
      destino:    c.data?.destino ?? '',
      aggHintsAt: c.aggHintsAt,
      aggHintsSeen: c.aggHintsSeen ?? false,
      hints:      c.aggHints ?? [],
    })),
  });
}
