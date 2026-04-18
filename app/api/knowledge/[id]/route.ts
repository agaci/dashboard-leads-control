import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

function toOid(id: string) {
  try { return new ObjectId(id); } catch { return null; }
}

// PUT — actualizar
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const oid = toOid(id);
  if (!oid) return Response.json({ error: 'ID inválido' }, { status: 400 });

  const body = await request.json();
  const { _id, createdAt, ...fields } = body;
  const db = await getDb();
  await db.collection('knowledge').updateOne(
    { _id: oid },
    { $set: { ...fields, updatedAt: new Date() } }
  );
  return Response.json({ success: true });
}

// DELETE — remover
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const oid = toOid(id);
  if (!oid) return Response.json({ error: 'ID inválido' }, { status: 400 });
  const db = await getDb();
  await db.collection('knowledge').deleteOne({ _id: oid });
  return Response.json({ success: true });
}
