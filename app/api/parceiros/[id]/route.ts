import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

function toOid(id: string) {
  try { return new ObjectId(id); } catch { return null; }
}

// GET /api/parceiros/[id]
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const oid = toOid(id);
    if (!oid) return Response.json({ error: 'ID inválido' }, { status: 400 });
    const db = await getDb();
    const tariff = await db.collection('partnerTariffs').findOne({ _id: oid });
    if (!tariff) return Response.json({ error: 'Não encontrado' }, { status: 404 });
    return Response.json({ success: true, tariff });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

// PUT /api/parceiros/[id] — actualizar tarifa
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const oid = toOid(id);
    if (!oid) return Response.json({ error: 'ID inválido' }, { status: 400 });

    const body = await request.json();
    delete body._id;

    const db = await getDb();
    await db.collection('partnerTariffs').updateOne(
      { _id: oid },
      { $set: { ...body, updatedAt: new Date() } }
    );
    return Response.json({ success: true });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/parceiros/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const oid = toOid(id);
    if (!oid) return Response.json({ error: 'ID inválido' }, { status: 400 });
    const db = await getDb();
    await db.collection('partnerTariffs').deleteOne({ _id: oid });
    return Response.json({ success: true });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
