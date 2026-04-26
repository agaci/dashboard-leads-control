import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') ?? '';

    const db = await getDb();
    const filter: Record<string, unknown> = { companyProvider: 'Yourbox' };
    if (search) {
      filter.$or = [
        { nome: { $regex: search, $options: 'i' } },
        { telefone: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const docs = await db.collection('clients')
      .find(filter)
      .sort({ updatedAt: -1 })
      .limit(200)
      .toArray();

    return Response.json({
      success: true,
      clients: docs.map((c: any) => ({
        id:            c._id.toString(),
        nome:          c.nome,
        telefone:      c.telefone,
        email:         c.email ?? null,
        empresa:       c.empresa ?? null,
        emailConsent:  c.emailConsent ?? false,
        totalServicos: c.leadIds?.length ?? 0,
        createdAt:     c.createdAt,
        updatedAt:     c.updatedAt,
      })),
    });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { leadId } = await request.json();
    if (!leadId) return Response.json({ error: 'leadId obrigatório' }, { status: 400 });

    const db = await getDb();
    const lead = await db.collection('messages').findOne({ _id: new ObjectId(leadId) });
    if (!lead) return Response.json({ error: 'Lead não encontrada' }, { status: 404 });

    const { nome, telefone, email } = lead.leadData ?? {};
    if (!telefone) return Response.json({ error: 'Lead sem telefone' }, { status: 400 });

    const now = new Date();
    const leadObjId = new ObjectId(leadId);

    // Se já existe cliente com o mesmo telefone, agregar
    let client = await db.collection('clients').findOne({ telefone, companyProvider: 'Yourbox' });

    if (client) {
      await db.collection('clients').updateOne(
        { _id: client._id },
        {
          $addToSet: { leadIds: leadObjId },
          $set: {
            updatedAt: now,
            ...(nome  && !client.nome  ? { nome }  : {}),
            ...(email && !client.email ? { email } : {}),
          },
        },
      );
    } else {
      const result = await db.collection('clients').insertOne({
        companyProvider: 'Yourbox',
        nome:         nome ?? 'Sem nome',
        telefone,
        email:        email ?? null,
        empresa:      null,
        notas:        '',
        emailConsent: false,
        leadIds:      [leadObjId],
        createdAt:    now,
        updatedAt:    now,
      });
      client = { _id: result.insertedId };
    }

    // Marcar a lead com o clientId
    await db.collection('messages').updateOne(
      { _id: leadObjId },
      { $set: { clientId: client._id.toString() } },
    );

    return Response.json({ success: true, clientId: client._id.toString() });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
