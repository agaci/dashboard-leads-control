import { getDb } from '@/lib/mongodb';

export async function POST(request: Request) {
  try {
    const { origem, destino, nome, telefone, email } = await request.json();

    if (!origem || !destino || !nome || !telefone) {
      return Response.json({ error: 'Campos obrigatorios em falta' }, { status: 400 });
    }

    const db = await getDb();
    const now = new Date();
    const timeStamp = now.toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' });

    await db.collection('messages').insertOne({
      company: 'Yourbox',
      messageType: 'newLead',
      to: 'admin',
      toPrivate: null,
      presentationMessage: 'stick',
      deletedAfter: 0,
      message: `<div style="line-height:1.4;">
        <p><b>LEAD INTERNACIONAL / ILHAS</b> <small>(${timeStamp})</small></p>
        <p><b>Origem:</b> ${origem}</p>
        <p><b>Destino:</b> ${destino}</p>
        <p><b>Nome:</b> ${nome}</p>
        <p><b>Telefone:</b> ${telefone}</p>
        ${email ? `<p><b>Email:</b> ${email}</p>` : ''}
        <p style="color:#e65100;"><b>CONTACTAR — Cotacao Internacional/Ilhas</b></p>
      </div>`,
      companyProvider: 'Yourbox',
      senderName: 'Bot Web — Internacional',
      variante: 'BOT',
      timeStamp: now,
      closed: false,
      closedAt: null,
      reply: [],
      leadData: {
        origem, destino, nome, telefone,
        email: email || null,
        serviceType: 'internacional',
        timeStamp: now,
        converted: false,
        source: 'web_chat_international',
      },
    });

    return Response.json({ success: true });
  } catch (err: any) {
    console.error('[leads/international] error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
