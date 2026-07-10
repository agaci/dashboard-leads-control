import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

// Confirmar (ou dispensar) uma sugestão "provável cliente" numa conversa do inbox.
//   POST { action: 'confirm' | 'dismiss' }  (autenticado)
// Confirmar: cria a lead (messages), cria/liga o cliente (dedup por telemóvel) e
// marca a conversa LEAD_REGISTERED, ligando conversa <-> lead <-> cliente <-> serviço.

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return Response.json({ error: 'Não autenticado' }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = (body as any).action === 'dismiss' ? 'dismiss' : 'confirm';

  let _id: ObjectId;
  try { _id = new ObjectId(id); } catch { return Response.json({ error: 'invalid id' }, { status: 400 }); }

  const db = await getDb();
  const conv = await db.collection('conversations').findOne({ _id });
  if (!conv) return Response.json({ error: 'not found' }, { status: 404 });

  if (action === 'dismiss') {
    await db.collection('conversations').updateOne({ _id }, { $set: { clientMatchDismissed: true }, $unset: { clientMatch: '' } });
    return Response.json({ success: true, dismissed: true });
  }

  // ── Confirmar: inbox -> lead -> cliente ──────────────────────────────────
  const now = new Date();
  const d = conv.data ?? {};
  const telDigits = String(d.telefone ?? conv.telemovel ?? '').replace(/\D/g, '');
  const realPhone = /^[0-9]{9}$/.test(telDigits) ? telDigits : null;
  if (!realPhone) return Response.json({ error: 'Conversa sem telemóvel válido' }, { status: 400 });
  const email = d.email ?? null;
  const nome = d.nome ?? null;
  const serviceNr = conv.clientMatch?.serviceNr ?? null;
  const variante = conv.quizVariante ?? 'QUIZ';
  const serviceType = d.urgencia === '24H' ? 'arrasto' : 'direto';

  // 1) Criar a lead (messages newLead) — marcada appSource leads-control
  const leadDoc = {
    company: 'Yourbox', messageType: 'newLead', to: 'admin', toPrivate: null,
    appSource: 'leads-control', presentationMessage: 'stick', deletedAfter: 0,
    message: `<div style="line-height:1.4;"><p><b>LEAD (inbox &rarr; cliente)</b> <small>(${now.toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' })})</small></p><p>${realPhone}</p><p>${nome ?? ''}</p>${email ? `<p>${email}</p>` : ''}<p>${d.origem ?? ''} &rarr; ${d.destino ?? ''}</p>${serviceNr ? `<p><b>Serviço YourBox nr:</b> ${serviceNr}</p>` : ''}<p style="color:green;"><b>CONFIRMADO CLIENTE</b></p></div>`,
    companyProvider: 'Yourbox', senderName: 'Inbox->Cliente', variante,
    timeStamp: now, closed: false, closedAt: null, reply: [],
    leadData: {
      origem: d.origem, destino: d.destino, urgencia: d.urgencia ?? null, serviceType,
      nome, email, telefone: realPhone,
      volumes: d.volumes, material: d.material, embalado: d.embalado,
      geo: d.geo ?? null, serviceNr,
      timeStamp: now, converted: true, convertedAt: now, source: 'inbox-reconcile',
    },
  };
  // Reutiliza a lead existente (se a conversa já era LEAD_REGISTERED) — não duplica.
  let existingLead: ObjectId | null = null;
  if (conv.leadId) {
    try {
      const lid = new ObjectId(String(conv.leadId));
      const e = await db.collection('messages').findOne({ _id: lid }, { projection: { _id: 1 } });
      if (e) existingLead = lid;
    } catch { /* id inválido -> cria nova */ }
  }
  const leadId: ObjectId = existingLead ?? (await db.collection('messages').insertOne(leadDoc as any)).insertedId;

  // 2) Criar/ligar cliente (dedup por telemóvel)
  let client = await db.collection('clients').findOne({ telefone: realPhone, companyProvider: 'Yourbox' });
  if (client) {
    await db.collection('clients').updateOne(
      { _id: client._id },
      {
        $addToSet: { leadIds: leadId },
        $set: {
          updatedAt: now,
          ...(nome && !client.nome ? { nome } : {}),
          ...(email && !client.email ? { email } : {}),
          ...(serviceNr ? { lastServiceNr: serviceNr } : {}),
        },
      },
    );
  } else {
    const cRes = await db.collection('clients').insertOne({
      companyProvider: 'Yourbox', nome: nome ?? 'Sem nome', telefone: realPhone, email: email ?? null,
      empresa: null, notas: '', emailConsent: false, leadIds: [leadId],
      lastServiceNr: serviceNr ?? null, createdAt: now, updatedAt: now, source: 'inbox-reconcile',
    });
    client = { _id: cRes.insertedId } as any;
  }
  const clientId = client!._id.toString();

  // 3) Ligar tudo
  await db.collection('messages').updateOne({ _id: leadId }, { $set: { clientId } });
  await db.collection('conversations').updateOne({ _id }, {
    $set: {
      step: 'LEAD_REGISTERED', leadRegisteredAt: now, leadId: leadId.toString(),
      clientId, clientMatchConfirmedAt: now, updatedAt: now,
    },
    $unset: { clientMatch: '' },
  });

  return Response.json({ success: true, leadId: leadId.toString(), clientId });
}
