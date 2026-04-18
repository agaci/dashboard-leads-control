import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

function toOid(id: string) {
  try { return new ObjectId(id); } catch { return null; }
}

// GET — conversa completa com histórico
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const oid = toOid(id);
    if (!oid) return Response.json({ error: 'ID inválido' }, { status: 400 });
    const db = await getDb();
    const conv = await db.collection('conversations').findOne({ _id: oid });
    if (!conv) return Response.json({ error: 'Não encontrado' }, { status: 404 });
    return Response.json({ success: true, conversation: conv });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
