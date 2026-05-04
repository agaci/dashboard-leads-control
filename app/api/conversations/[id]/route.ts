import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { sendEscalationEmail } from '@/lib/email/resend';

function toOid(id: string) {
  try { return new ObjectId(id); } catch { return null; }
}

// PATCH — actualizar step ou flags manualmente (BO)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const oid = toOid(id);
    if (!oid) return Response.json({ error: 'ID inválido' }, { status: 400 });
    const body = await req.json();
    const $set: Record<string, unknown> = { updatedAt: new Date().toISOString() };

    if ('step' in body) {
      const allowed = ['CLOSED', 'LEAD_REGISTERED', 'ESCALATED_TO_HUMAN'];
      if (!allowed.includes(body.step)) return Response.json({ error: 'Step inválido' }, { status: 400 });
      $set.step = body.step;
      if (['CLOSED', 'LEAD_REGISTERED'].includes(body.step)) {
        $set.closedAt = new Date().toISOString();
        $set.closeReason = body.closeReason ?? null;
      }
    }
    if ('aggHintsSeen' in body) {
      $set.aggHintsSeen = Boolean(body.aggHintsSeen);
    }

    const db = await getDb();
    await db.collection('conversations').updateOne({ _id: oid }, { $set });

    if (body.step === 'ESCALATED_TO_HUMAN') {
      const conv = await db.collection('conversations').findOne(
        { _id: oid },
        { projection: { telemovel: 1, data: 1, history: { $slice: -1 } } }
      );
      if (conv) {
        const lastMsg = (conv.history as any[])?.[0]?.text as string | undefined;
        sendEscalationEmail({
          convId:    id,
          telemovel: conv.telemovel,
          nome:      conv.data?.nome,
          origem:    conv.data?.origem,
          destino:   conv.data?.destino,
          lastMsg,
        });
      }
    }

    return Response.json({ success: true });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
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
