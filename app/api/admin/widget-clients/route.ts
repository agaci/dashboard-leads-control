import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import crypto from 'crypto';
import { invalidateWidgetClientCache } from '@/lib/widget/attribution';

function generateClientId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function generateSecretToken() {
  return crypto.randomBytes(32).toString('hex');
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
    const { name, primaryColor, darkColor, logoUrl, whatsappNumber, botName, allowedOrigins, webhookUrl, mode, variante,
            commissionUserName, commissionUserId, commissionPercentage,
            commissionModel, commissionMarginBase, referenceProfitPercentage } = body;
    if (!name?.trim()) return Response.json({ error: 'Nome obrigatório' }, { status: 400 });

    const clientId = generateClientId();
    const now = new Date();
    const db = await getDb();

    const secretToken = generateSecretToken();

    await db.collection('widgetClients').insertOne({
      clientId,
      secretToken,
      name:           name.trim(),
      primaryColor:   primaryColor   ?? '#bed62f',
      darkColor:      darkColor      ?? '#1a1a1a',
      logoUrl:        logoUrl        ?? null,
      whatsappNumber: whatsappNumber ?? null,
      botName:        botName        ?? 'Assistente',
      allowedOrigins: allowedOrigins ?? ['*'],
      webhookUrl:     webhookUrl     ?? null,
      mode:           mode === 'quiz' ? 'quiz' : 'bot', // default: bot (comportamento actual)
      variante:       variante       ?? null,
      // Ligacao ao circuito de comissoes da YourBox: nome EXACTO do comissionista tal
      // como aparece em users.profile.commissionUser e em services.parameters.commissionUser.
      commissionUserName:   commissionUserName?.trim() || null,
      commissionUserId:     commissionUserId?.trim()   || null,
      commissionPercentage: typeof commissionPercentage === 'number' ? commissionPercentage : null,
      // Override do modelo de calculo. A null herda o que estiver em serverSettings da
      // YourBox, que e a fonte de verdade — ver lib/commissions/calc.ts.
      commissionModel:           commissionModel === 'margin' || commissionModel === 'fixed' ? commissionModel : null,
      commissionMarginBase:      commissionMarginBase === 'revenue' || commissionMarginBase === 'cost' ? commissionMarginBase : null,
      referenceProfitPercentage: typeof referenceProfitPercentage === 'number' ? referenceProfitPercentage : null,
      active:         true,
      createdAt:      now,
      updatedAt:      now,
    });

    return Response.json({ success: true, clientId, secretToken });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { _id, regenerateToken, ...fields } = body;
    if (!_id) return Response.json({ error: 'ID obrigatório' }, { status: 400 });

    const update: Record<string, any> = { ...fields, updatedAt: new Date() };
    if (regenerateToken) update.secretToken = generateSecretToken();

    const db = await getDb();
    invalidateWidgetClientCache(); // a atribuicao de leads le estes campos em cache
    await db.collection('widgetClients').updateOne(
      { _id: new ObjectId(_id) },
      { $set: update }
    );

    if (regenerateToken) {
      const doc = await db.collection('widgetClients').findOne({ _id: new ObjectId(_id) });
      return Response.json({ success: true, secretToken: doc?.secretToken });
    }
    return Response.json({ success: true });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
