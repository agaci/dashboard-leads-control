import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';
import { contactToken } from '@/lib/contactToken';
import { ObjectId } from 'mongodb';
import { paginaHtml } from '@/lib/pagina';

// Pedido de contacto ("Contactem-me") vindo do email/WhatsApp de reengajamento.
//   GET ?c=<id>&t=<token>&ch=<canal>  (PÚBLICO) — o utilizador clicou: regista o pedido
//     e devolve uma página de confirmação amigável.
//   GET ?open=1  (AUTENTICADO) — lista os pedidos abertos, para o alarme do inbox.
//   POST { convId }  (AUTENTICADO) — a operadora "atendeu": desliga o alarme.

// A pagina de confirmacao e a mesma dos links do CRM: quem chega aqui vem de um email
// nosso, e duas identidades diferentes na mesma accao fazem qualquer uma delas parecer
// falsa. Ver lib/pagina.ts.
const htmlPage = paginaHtml;

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
