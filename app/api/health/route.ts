import { getDb } from '@/lib/mongodb';

export async function GET() {
  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    return Response.json({ status: 'ok', mongo: 'connected', ts: new Date().toISOString() });
  } catch (err) {
    return Response.json(
      { status: 'error', mongo: 'disconnected', message: String(err) },
      { status: 503 }
    );
  }
}
