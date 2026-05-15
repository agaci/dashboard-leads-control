import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';

const COLLECTION = 'routingConfig';
const DOC_ID = 'yourbox_main';

const DEFAULT_VARIANTS = { a: 0, b: 100, c: 0, d: 0, chat: 0 };

export async function GET() {
  try {
    const db = await getDb();
    const doc = await db.collection(COLLECTION).findOne({ _id: DOC_ID as any });
    const variants = (doc as any)?.variantWeights ?? DEFAULT_VARIANTS;
    return Response.json(variants);
  } catch (err: any) {
    return Response.json(DEFAULT_VARIANTS);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const variants: Record<string, number> = {};
    for (const key of ['a', 'b', 'c', 'd', 'chat']) {
      const val = parseInt(body[key] ?? 0);
      variants[key] = isNaN(val) ? 0 : Math.max(0, Math.min(100, val));
    }
    const total = Object.values(variants).reduce((s, v) => s + v, 0);
    if (total !== 100) {
      return Response.json({ error: `As percentagens devem somar 100 (soma actual: ${total})` }, { status: 400 });
    }
    const db = await getDb();
    await db.collection(COLLECTION).updateOne(
      { _id: DOC_ID as any },
      { $set: { variantWeights: variants, updatedAt: new Date() } },
      { upsert: true }
    );
    return Response.json({ success: true, variants });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
