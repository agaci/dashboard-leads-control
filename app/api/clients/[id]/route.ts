import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const db = await getDb();

    const client = await db.collection('clients').findOne({ _id: new ObjectId(id) });
    if (!client) return Response.json({ error: 'Cliente não encontrado' }, { status: 404 });

    const leads = client.leadIds?.length
      ? await db.collection('messages')
          .find({ _id: { $in: client.leadIds.map((l: any) => (l instanceof ObjectId ? l : new ObjectId(l))) } })
          .sort({ timeStamp: -1 })
          .toArray()
      : [];

    return Response.json({
      success: true,
      client: {
        id:           client._id.toString(),
        nome:         client.nome,
        telefone:     client.telefone,
        email:        client.email ?? null,
        empresa:      client.empresa ?? null,
        notas:        client.notas ?? '',
        emailConsent: client.emailConsent ?? false,
        createdAt:    client.createdAt,
        updatedAt:    client.updatedAt,
        leads: leads.map((l: any) => ({
          id:                l._id.toString(),
          timeStamp:         l.timeStamp,
          origem:            l.leadData?.origem ?? null,
          destino:           l.leadData?.destino ?? null,
          priceWithDiscount: l.leadData?.priceWithDiscount ?? null,
          partnerFinalPrice: l.leadData?.partnerFinalPrice ?? null,
          urgencia:          l.leadData?.urgencia ?? null,
          serviceType:       l.leadData?.serviceType ?? null,
          variante:          l.variante ?? null,
        })),
      },
    });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const allowed = ['nome', 'empresa', 'email', 'notas', 'emailConsent'];
    const update: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of allowed) {
      if (key in body) update[key] = body[key];
    }

    const db = await getDb();
    await db.collection('clients').updateOne({ _id: new ObjectId(id) }, { $set: update });
    return Response.json({ success: true });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
