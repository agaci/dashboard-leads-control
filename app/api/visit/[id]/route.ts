import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { checkDeleteCode } from '@/lib/deleteGuard';

function toOid(id: string) {
  try { return new ObjectId(id); } catch { return null; }
}

// DELETE — apagar uma visita (só administrador, com código de servidor). Hard delete.
// O `[id]` é o `sessionId` da visita (único). Opcionalmente apaga em cascata a conversa
// associada (por `visitSid`) e a respectiva lead — apagar a visita NÃO apaga os outros
// níveis por si só.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'administrator') {
    return Response.json({ error: 'Sem permissão' }, { status: 403 });
  }
  let body: any = {};
  try { body = await req.json(); } catch { /* corpo vazio */ }
  const gate = checkDeleteCode(body?.code);
  if (!gate.ok) return Response.json({ error: gate.error }, { status: 403 });

  const { id: sessionId } = await params;
  if (!sessionId) return Response.json({ error: 'invalid id' }, { status: 400 });
  const db = await getDb();

  // Conversa associada por visitSid (só existe em dados novos, após unificação do ID).
  const conv = await db.collection('conversations').findOne(
    { visitSid: sessionId },
    { projection: { _id: 1, leadId: 1 }, sort: { createdAt: -1 } },
  );

  let deletedLead = 0;
  if (body?.alsoDeleteLead && conv?.leadId) {
    const leadOid = toOid(String(conv.leadId));
    if (leadOid) {
      const lr = await db.collection('messages').deleteOne({ _id: leadOid });
      deletedLead = lr.deletedCount ?? 0;
    }
  }

  let deletedConv = 0;
  if (body?.alsoDeleteConversation && conv?._id) {
    const cr = await db.collection('conversations').deleteOne({ _id: conv._id });
    deletedConv = cr.deletedCount ?? 0;
  }

  const r = await db.collection('visits').deleteOne({ sessionId });
  return Response.json({ success: true, deleted: r.deletedCount, deletedConv, deletedLead });
}
