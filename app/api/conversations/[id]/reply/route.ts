import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

function toOid(id: string) {
  try { return new ObjectId(id); } catch { return null; }
}

// POST — resposta manual do BO
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const oid = toOid(id);
    if (!oid) return Response.json({ error: 'ID inválido' }, { status: 400 });

    const { text } = await request.json();
    if (!text?.trim()) return Response.json({ error: 'Texto obrigatório' }, { status: 400 });

    const db = await getDb();
    const now = new Date();

    await db.collection('conversations').updateOne(
      { _id: oid },
      {
        $push: { history: { role: 'bo', text: text.trim(), timestamp: now } } as any,
        $set: { updatedAt: now },
      }
    );

    return Response.json({ success: true });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
