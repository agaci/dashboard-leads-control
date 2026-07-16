import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { thompsonProbBest, toWeights, type Arm } from '@/lib/autobalance/thompson';

// Conselheiro de balanceamento (Fase B). Calcula os pesos RECOMENDADOS pelo bandit
// (Thompson sobre leads_efetivas/visita, só visitas PT) e GUARDA-OS — não aplica.
// Pensado para cron ~1x/dia:  curl "https://leads.comgo.pt/api/cron/variant-advisor?key=SEGREDO"

const COL = 'routingConfig';
const DOC = 'yourbox_main';

async function run() {
  const db = await getDb();
  const cfg: any = await db.collection(COL).findOne({ _id: DOC as any });
  const ab = cfg?.autobalance ?? {};
  const windowDays = ab.windowDays ?? 14;
  const alpha = typeof ab.alpha === 'number' ? ab.alpha : 0.35;
  const beta  = typeof ab.beta  === 'number' ? ab.beta  : 0.20;
  const floorPct = ab.floorPct ?? 5;
  const capPct   = ab.capPct   ?? 85;
  const filterPT = ab.filterPortugalOnly ?? true;

  const since = new Date(Date.now() - windowDays * 24 * 3600 * 1000);

  // Variantes de quiz activas (peso > 0). tag = key em maiúsculas (quiz6c -> QUIZ6C).
  const variants: any[] = cfg?.variants ?? [];
  const active = variants.filter((v) => /^quiz/i.test(v.key) && (v.weight ?? 0) > 0);
  if (active.length < 2) return { skipped: 'menos de 2 variantes de quiz activas', active: active.map((v) => v.key) };

  // Visitas por variante (PT, janela).
  const visitMatch: any = { firstSeen: { $gte: since } };
  if (filterPT) visitMatch['geo.country'] = 'Portugal';
  const visitsRaw = await db.collection('visits').aggregate([
    { $match: visitMatch }, { $group: { _id: '$variante', c: { $sum: 1 } } },
  ]).toArray();
  const visitsBy: Record<string, number> = {};
  for (const r of visitsRaw as any[]) if (r._id) visitsBy[String(r._id)] = r.c;

  // Leads + contacto captado sem lead, por variante (JS — Mongo 3.0).
  const convs = await db.collection('conversations').find(
    { canal: 'web-quiz', createdAt: { $gte: since } },
    { projection: { quizVariante: 1, step: 1, 'data.telefone': 1, 'data.email': 1 } },
  ).limit(20000).toArray();
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const by: Record<string, { lead: number; phone: number; email: number }> = {};
  for (const c of convs as any[]) {
    const v = c.quizVariante ? String(c.quizVariante) : null;
    if (!v) continue;
    const b = (by[v] ??= { lead: 0, phone: 0, email: 0 });
    if (c.step === 'LEAD_REGISTERED') { b.lead++; continue; }
    const hasPhone = String(c.data?.telefone ?? '').replace(/\D/g, '').length >= 9;
    const hasEmail = emailRe.test(String(c.data?.email ?? ''));
    if (hasPhone) b.phone++; else if (hasEmail) b.email++;
  }

  const arms: Arm[] = active.map((v) => {
    const tag = String(v.key).toUpperCase();
    const b = by[tag] ?? { lead: 0, phone: 0, email: 0 };
    const visits = visitsBy[tag] ?? 0;
    const effectiveLeads = b.lead + alpha * b.phone + beta * b.email;
    return { key: v.key, visits, effectiveLeads };
  }).filter((a) => a.visits > 0);

  if (arms.length < 2) return { skipped: 'sem dados suficientes por variante', arms };

  const pBest = thompsonProbBest(arms);
  const weights = toWeights(pBest, floorPct, capPct);

  const recommendation = {
    computedAt: new Date(),
    windowDays,
    weights,
    detail: arms.map((a) => ({
      key: a.key,
      visits: a.visits,
      effectiveLeads: Math.round(a.effectiveLeads * 10) / 10,
      effRate: a.visits ? Math.round((a.effectiveLeads / a.visits) * 1000) / 10 : 0,
      pBest: Math.round((pBest[a.key] ?? 0) * 1000) / 10,
      recommendedPct: weights[a.key] ?? 0,
    })).sort((x, y) => y.pBest - x.pBest),
  };

  await db.collection(COL).updateOne(
    { _id: DOC as any },
    { $set: { 'autobalance.recommendation': recommendation, updatedAt: new Date() } },
    { upsert: true },
  );

  return { success: true, recommendation };
}

async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const key = new URL(req.url).searchParams.get('key');
    const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/, '');
    if (key !== secret && bearer !== secret) return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    return Response.json(await run());
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
