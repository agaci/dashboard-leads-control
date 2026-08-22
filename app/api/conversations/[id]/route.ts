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

    // Marcar como "lead registada" passa a CRIAR a lead, não só a etiquetar a conversa.
    // Antes ficava uma pseudo-lead: a conversa dizia LEAD_REGISTERED mas nunca entrava na
    // lista de Leads nem nas estatísticas.
    //
    // Sem contacto nenhum não há lead possível — ninguém consegue trabalhar o pedido — por
    // isso a conversa fecha com o motivo escolhido em vez de mentir com "Lead registada".
    let leadCriada: string | null = null;
    let semContacto = false;

    if (body.step === 'LEAD_REGISTERED') {
      const conv = await db.collection('conversations').findOne(
        { _id: oid },
        { projection: { data: 1, telemovel: 1 } },
      );
      if (!temContacto(conv)) {
        semContacto = true;
        $set.step = 'CLOSED';
      }
    }

    await db.collection('conversations').updateOne({ _id: oid }, { $set });

    if (body.step === 'LEAD_REGISTERED' && !semContacto) {
      leadCriada = await criarLeadDaConversa(db, oid, body.closeReason ?? null);
    }

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

    return Response.json({ success: true, leadCriada, semContacto });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

/** Telefone (9 dígitos) e email válidos de uma conversa. Um deles chega para haver lead. */
function contactosDe(conv: any): { telefone: string | null; email: string | null } {
  const d = conv?.data ?? {};
  const telDigits = String(d.telefone ?? conv?.telemovel ?? '').replace(/\D/g, '');
  return {
    telefone: /^[0-9]{9}$/.test(telDigits) ? telDigits : null,
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(d.email ?? '')) ? String(d.email) : null,
  };
}

function temContacto(conv: any): boolean {
  const { telefone, email } = contactosDe(conv);
  return !!(telefone || email);
}

/**
 * Cria a lead em `messages` a partir de uma conversa da inbox.
 *
 * Devolve o id da lead criada, ou null se não havia contacto (nem telefone nem email) ou
 * se a conversa já tinha lead. O guard é o `leadRegisteredAt`: o mesmo campo que o
 * quiz-progress usa no envio final, para que uma conversa retomada mais tarde actualize a
 * lead existente em vez de criar uma segunda.
 */
async function criarLeadDaConversa(db: any, oid: ObjectId, motivo: string | null): Promise<string | null> {
  const now = new Date();

  // Só avança se ainda não houver lead — findOneAndUpdate garante que dois cliques
  // seguidos não criam duas leads.
  const guard: any = await db.collection('conversations').findOneAndUpdate(
    { _id: oid, leadRegisteredAt: { $exists: false } },
    { $set: { leadRegisteredAt: now } },
  );
  const conv = guard?.value ?? null;
  if (!conv) return null;

  const d = conv.data ?? {};
  const { telefone, email } = contactosDe(conv);

  // Salvaguarda: o PATCH já não chega aqui sem contacto, mas se chegasse desfazia a marca.
  if (!telefone && !email) {
    await db.collection('conversations').updateOne({ _id: oid }, { $unset: { leadRegisteredAt: '' } });
    return null;
  }

  const urMap: Record<string, string> = { 'Imediata': '1 Hora', 'Proprio dia': '4 Horas', 'Próprio dia': '4 Horas', '24H': '24 Horas' };
  const urgencia = urMap[d.urgencia] ?? d.urgencia ?? null;
  const serviceType = d.urgencia === '24H' || d.urgencia === '24 Horas' ? 'arrasto' : 'direto';
  const totalKg = (Number(d.volumes) || 0) * (Number(d.peso) || 0) || d.weightKg || null;

  // Mesma regra do quiz: a viatura sai do peso e da maior dimensão
  const maxDim = Math.max(Number(d.comprimento) || 0, Number(d.largura) || 0, Number(d.altura) || 0);
  const viatura = totalKg && totalKg <= 2 && maxDim <= 60 ? 'Moto'
    : totalKg && totalKg <= 150 ? 'Furgão Classe 1'
    : totalKg ? 'Furgão Classe 2' : null;

  const widget = conv.widgetClientId ?? d.widgetClientId
    ? {
        widgetClientId:   conv.widgetClientId ?? d.widgetClientId,
        widgetClientName: conv.widgetClientName ?? d.widgetClientName ?? null,
        widgetRef:        conv.widgetRef ?? d.widgetRef ?? null,
      }
    : null;

  const ins = await db.collection('messages').insertOne({
    company: 'Yourbox', messageType: 'newLead', to: 'admin', toPrivate: null,
    appSource: 'leads-control',
    presentationMessage: 'stick', deletedAfter: 0,
    message: `<div style="line-height:1.4;"><p><b>LEAD (inbox)</b> <small>(${now.toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' })})</small></p><p>${telefone ?? ''}</p><p>${d.nome ?? ''}</p>${email ? `<p>${email}</p>` : ''}<p>${d.origem ?? ''} &rarr; ${d.destino ?? ''}</p><p><b>Urgência:</b> ${urgencia ?? '—'}</p>${motivo ? `<p><b>Motivo:</b> ${motivo}</p>` : ''}<p style="color:green;"><b>CONTACTAR AGORA [canal: INBOX]</b></p></div>`,
    companyProvider: 'Yourbox', senderName: 'Inbox', variante: conv.quizVariante ?? 'INBOX',
    timeStamp: now, closed: false, closedAt: null, reply: [],
    // O motivo escolhido na inbox viaja para a lead — fica visível no detalhe dela
    inboxReason: motivo,
    ...(widget ? widget : {}),
    leadData: {
      origem: d.origem, destino: d.destino,
      urgencia, serviceType, weightKg: totalKg, viatura,
      nome: d.nome ?? null, email, telefone,
      volumes: d.volumes, material: d.material, embalado: d.embalado,
      geo: d.geo ?? null,
      ...(widget ? widget : {}),
      timeStamp: now, converted: true, convertedAt: now, source: 'inbox',
    },
  });

  const leadId = ins.insertedId.toString();
  await db.collection('conversations').updateOne({ _id: oid }, { $set: { leadId } });
  return leadId;
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
