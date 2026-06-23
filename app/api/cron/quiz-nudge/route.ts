import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { sendWhatsAppMessage } from '@/lib/whatsapp/evolution';
import { sendQuizNudgeEmail } from '@/lib/email/resend';

// Reengajamento de quiz abandonado.
// Varre as conversas web-quiz que pararam (nome + contacto, sem submeter) e envia
// UM toque (WhatsApp e/ou email). Pensado para ser chamado por cron a cada ~5 min:
//   curl "https://leads.comgo.pt/api/cron/quiz-nudge?key=SEGREDO"
// (definir CRON_SECRET no ambiente; sem ele, fica aberto — recomenda-se definir.)

const DEFAULTS = {
  active: false,
  delayMinutes: 5,
  channel: 'whatsapp_email' as 'whatsapp_email' | 'whatsapp' | 'email',
  messageTemplate:
    'Olá {nome}, aqui é a YourBox. Vi que começou a pedir um orçamento ({rota}) mas não chegou a concluir. Quer que tratemos disso por si? Responda aqui ou ligue 214 304 546 — é rápido.',
  startHour: 9,
  endHour: 20,
  weekendsOff: true,
};

function lisbonNow(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Lisbon' }));
}

async function run() {
  const db = await getDb();
  const cfgDoc = await db.collection('routingConfig').findOne({ _id: 'yourbox_main' as any });
  const cfg = { ...DEFAULTS, ...((cfgDoc as any)?.quizNudge ?? {}) };

  if (!cfg.active) return { skipped: 'inactivo' };

  // Horario util (hora de Lisboa)
  const now = lisbonNow();
  const dow = now.getDay(); // 0 = domingo, 6 = sabado
  if (cfg.weekendsOff && (dow === 0 || dow === 6)) return { skipped: 'fim-de-semana' };
  const h = now.getHours();
  if (h < cfg.startHour || h >= cfg.endHour) return { skipped: 'fora de horario' };

  // Candidatos: web-quiz, em curso, com nome, sem toque ainda, parados ha >= delay,
  // mas nao mais velhos do que 6h (evita inundar abandonos antigos ao ligar).
  const cutoff = new Date(Date.now() - cfg.delayMinutes * 60_000);
  const floor  = new Date(Date.now() - 6 * 3600_000);
  const candidates = await db.collection('conversations').find({
    canal: 'web-quiz',
    step: 'QUIZ_IN_PROGRESS',
    nudgeSentAt: { $exists: false },
    updatedAt: { $lte: cutoff, $gte: floor },
    'data.nome': { $exists: true, $ne: '' },
  }).sort({ updatedAt: -1 }).limit(25).toArray();

  let nudged = 0;
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  for (const c of candidates as any[]) {
    const nome  = String(c.data?.nome ?? '').trim();
    const telD  = String(c.data?.telefone ?? '').replace(/\D/g, '');
    const tel   = /^[0-9]{9}$/.test(telD) ? telD : null;
    const email = emailRe.test(String(c.data?.email ?? '')) ? String(c.data.email).trim() : null;
    if (!nome || (!tel && !email)) continue;

    const rota = c.data?.origem
      ? `${String(c.data.origem).split(',')[0].trim()} -> ${String(c.data?.destino ?? '...').split(',')[0].trim()}`
      : 'o seu envio';
    const texto = String(cfg.messageTemplate).replace(/\{nome\}/g, nome).replace(/\{rota\}/g, rota);

    let sent = false;
    let channelUsed: string | null = null;

    if ((cfg.channel === 'whatsapp' || cfg.channel === 'whatsapp_email') && tel) {
      const ok = await sendWhatsAppMessage('351' + tel, texto);
      if (ok) { sent = true; channelUsed = 'whatsapp'; }
    }
    if (!sent && (cfg.channel === 'email' || cfg.channel === 'whatsapp_email') && email) {
      const ok = await sendQuizNudgeEmail({ to: email, nome, rota, texto });
      if (ok) { sent = true; channelUsed = 'email'; }
    }

    // Marca sempre (uma vez por conversa) para nao repetir, mesmo se o envio falhou.
    await db.collection('conversations').updateOne(
      { _id: c._id },
      { $set: { nudgeSentAt: new Date(), nudgeChannel: channelUsed, nudgeOk: sent } },
    );
    if (sent) nudged++;
  }

  return { scanned: candidates.length, nudged };
}

async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const key = new URL(req.url).searchParams.get('key');
    const auth = req.headers.get('authorization') ?? '';
    const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (key !== secret && bearer !== secret) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }
  }
  try {
    const result = await run();
    return Response.json({ success: true, ...result });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest)  { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
