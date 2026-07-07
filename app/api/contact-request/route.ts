import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';
import { contactToken } from '@/lib/contactToken';
import { ObjectId } from 'mongodb';

// Pedido de contacto ("Contactem-me") vindo do email/WhatsApp de reengajamento.
//   GET ?c=<id>&t=<token>&ch=<canal>  (PÚBLICO) — o utilizador clicou: regista o pedido
//     e devolve uma página de confirmação amigável.
//   GET ?open=1  (AUTENTICADO) — lista os pedidos abertos, para o alarme do inbox.
//   POST { convId }  (AUTENTICADO) — a operadora "atendeu": desliga o alarme.

function htmlPage(title: string, body: string, ok = true) {
  const mark = ok ? '&#10003;' : '&#33;';
  return new Response(
    `<!doctype html><html lang="pt"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="font-family:system-ui,-apple-system,sans-serif;background:#f5f6fa;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:20px">
<div style="background:#fff;border-radius:16px;padding:40px 32px;max-width:420px;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.08)">
<div style="width:64px;height:64px;border-radius:50%;margin:0 auto 20px;background:${ok ? '#bed62f' : '#e5e7eb'};display:flex;align-items:center;justify-content:center;font-size:30px;color:#1a2332;font-weight:700">${mark}</div>
<h1 style="font-size:20px;color:#1a2332;margin:0 0 12px">${title}</h1>
<p style="color:#555;font-size:14px;line-height:1.6;margin:0">${body}</p>
</div></body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  // ── Lista de pedidos abertos (dashboard) ──────────────────────────────────
  if (searchParams.get('open') === '1') {
    const session = await getServerSession(authOptions);
    if (!session?.user) return Response.json({ error: 'Não autenticado' }, { status: 401 });
    const db = await getDb();
    const rows = await db.collection('conversations').find(
      { contactRequestOpen: true },
      {
        projection: {
          _id: 1, telemovel: 1, contactRequestedAt: 1, contactRequestChannel: 1,
          'data.nome': 1, 'data.telefone': 1, 'data.origem': 1, 'data.destino': 1,
        },
      } as any,
    ).sort({ contactRequestedAt: -1 }).limit(50).toArray();

    const requests = rows.map((c: any) => ({
      convId: c._id?.toString(),
      nome: c.data?.nome ?? null,
      telefone: c.data?.telefone ?? c.telemovel ?? null,
      origem: c.data?.origem ?? null,
      destino: c.data?.destino ?? null,
      at: c.contactRequestedAt ?? null,
      channel: c.contactRequestChannel ?? null,
    }));
    return Response.json({ requests });
  }

  // ── Clique do utilizador no email/WhatsApp (público) ──────────────────────
  const c = searchParams.get('c') || '';
  const t = searchParams.get('t') || '';
  const ch = searchParams.get('ch') || null;
  if (!c || !t || t !== contactToken(c)) {
    return htmlPage('Ligação inválida', 'Não conseguimos validar o pedido. Ligue-nos para <b>214 304 546</b> e tratamos de tudo.', false);
  }

  let _id: ObjectId;
  try { _id = new ObjectId(c); } catch { return htmlPage('Ligação inválida', 'Referência inválida.', false); }

  const db = await getDb();
  const now = new Date();
  await db.collection('conversations').updateOne(
    { _id },
    {
      $set: {
        contactRequestedAt: now,
        contactRequestOpen: true,
        contactRequestChannel: ch,
        updatedAt: now,
      },
    },
  );
  return htmlPage(
    'Pedido recebido!',
    'Obrigado. A nossa equipa vai contactá-lo já de seguida. Se preferir, pode ligar para <b>214 304 546</b>.',
  );
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return Response.json({ error: 'Não autenticado' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const convId = String((body as any).convId ?? '');
  if (!convId) return Response.json({ error: 'convId em falta' }, { status: 400 });

  let _id: ObjectId;
  try { _id = new ObjectId(convId); } catch { return Response.json({ error: 'convId inválido' }, { status: 400 }); }

  const db = await getDb();
  await db.collection('conversations').updateOne(
    { _id },
    { $set: { contactRequestOpen: false, contactRequestAckAt: new Date() } },
  );
  return Response.json({ ok: true });
}
