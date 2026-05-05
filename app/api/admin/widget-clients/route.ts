import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

function generateClientId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export async function GET() {
  try {
    const db = await getDb();
    const clients = await db.collection('widgetClients').find({}).sort({ createdAt: -1 }).toArray();
    return Response.json({ success: true, clients });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, primaryColor, darkColor, logoUrl, whatsappNumber, botName, allowedOrigins, webhookUrl } = body;
    if (!name?.trim()) return Response.json({ error: 'Nome obrigatório' }, { status: 400 });

    const clientId = generateClientId();
    const now = new Date();
    const db = await getDb();

    await db.collection('widgetClients').insertOne({
      clientId,
      name:           name.trim(),
      primaryColor:   primaryColor   ?? '#bed62f',
      darkColor:      darkColor      ?? '#1a1a1a',
      logoUrl:        logoUrl        ?? null,
      whatsappNumber: whatsappNumber ?? null,
      botName:        botName        ?? 'Assistente',
      allowedOrigins: allowedOrigins ?? ['*'],
      webhookUrl:     webhookUrl     ?? null,
      active:         true,
      createdAt:      now,
      updatedAt:      now,
    });

    return Response.json({ success: true, clientId });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { _id, ...fields } = body;
    if (!_id) return Response.json({ error: 'ID obrigatório' }, { status: 400 });

    const db = await getDb();
    await db.collection('widgetClients').updateOne(
      { _id: new ObjectId(_id) },
      { $set: { ...fields, updatedAt: new Date() } }
    );
    return Response.json({ success: true });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
