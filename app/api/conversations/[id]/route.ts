import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { dispatchNotification } from '@/lib/notifications/dispatch';
import { checkDeleteCode } from '@/lib/deleteGuard';

function toOid(id: string) {
  try { return new ObjectId(id); } catch { return null; }
}

// DELETE — apagar uma conversa (só administrador, com código de servidor).
// Hard delete: sai das estatísticas. Opcionalmente apaga também a lead associada
// (body.alsoDeleteLead) — apagar a conversa NÃO apaga a lead por si só.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'administrator') {
    return Response.json({ error: 'Sem permissão' }, { status: 403 });
  }
  let body: any = {};
  try { body = await req.json(); } catch { /* corpo vazio */ }
  const gate = checkDeleteCode(body?.code);
  if (!gate.ok) return Response.json({ error: gate.error }, { status: 403 });

  const { id } = await params;
  const oid = toOid(id);
  if (!oid) return Response.json({ error: 'invalid id' }, { status: 400 });
  const db = await getDb();

  const conv = await db.collection('conversations').findOne({ _id: oid }, { projection: { leadId: 1 } });
  const r = await db.collection('conversations').deleteOne({ _id: oid });

  let deletedLead = 0;
  if (body?.alsoDeleteLead && conv?.leadId) {
    const leadOid = toOid(String(conv.leadId));
    if (leadOid) {
      const lr = await db.collection('messages').deleteOne({ _id: leadOid });
      deletedLead = lr.deletedCount ?? 0;
    }
  }
  return Response.json({ success: true, deleted: r.deletedCount, deletedLead });
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
        dispatchNotification('escalation', {
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
