import type { getDb } from '@/lib/mongodb';
import { thompsonProbBest, toWeights, type Arm } from './thompson';

const COL = 'routingConfig';
const DOC = 'yourbox_main';

export type Recommendation = {
  computedAt: Date;
  windowDays: number;
  weights: Record<string, number>;
  detail: { key: string; visits: number; effectiveLeads: number; effRate: number; pBest: number; recommendedPct: number }[];
};

// Movimento gradual: aproxima cada peso do alvo no máximo `maxDelta` p.p., depois
// re-normaliza a inteiros que somam `mass` (maior resto). Guarda-costas anti-saltos.
function gradualWeights(
  current: Record<string, number>, target: Record<string, number>, mass: number, maxDelta: number,
): Record<string, number> {
  const keys = Object.keys(target);
  const moved: Record<string, number> = {};
  for (const k of keys) {
    const cur = current[k] ?? 0;
    const tgt = target[k] ?? 0;
    const d = Math.max(-maxDelta, Math.min(maxDelta, tgt - cur));
    moved[k] = Math.max(0, cur + d);
  }
  const sum = keys.reduce((a, k) => a + moved[k], 0) || 1;
  const parts = keys.map((k) => { const v = (moved[k] / sum) * mass; return { k, v, f: Math.floor(v) }; });
  let s = parts.reduce((a, p) => a + p.f, 0);
  parts.sort((a, b) => (b.v - b.f) - (a.v - a.f));
  let i = 0;
  while (s < mass && parts.length) { parts[i % parts.length].f++; s++; i++; }
  const res: Record<string, number> = {};
  for (const p of parts) res[p.k] = p.f;
  return res;
}

// Calcula os pesos recomendados pelo bandit (Thompson sobre leads_efetivas/visita, só
// visitas PT) e guarda em routingConfig.autobalance.recommendation. NÃO aplica os pesos.
export async function computeRecommendation(db: Awaited<ReturnType<typeof getDb>>): Promise<{ recommendation?: Recommendation; skipped?: string; applied?: Record<string, number> }> {
  const cfg: any = await db.collection(COL).findOne({ _id: DOC as any });
  const ab = cfg?.autobalance ?? {};
  const windowDays = ab.windowDays ?? 14;
  const alpha = typeof ab.alpha === 'number' ? ab.alpha : 0.35;
  const beta  = typeof ab.beta  === 'number' ? ab.beta  : 0.20;
  const floorPct = ab.floorPct ?? 5;
  const capPct   = ab.capPct   ?? 85;
  const filterPT = ab.filterPortugalOnly ?? true;

  const since = new Date(Date.now() - windowDays * 24 * 3600 * 1000);

  const variants: any[] = cfg?.variants ?? [];
  const active = variants.filter((v) => /^quiz/i.test(v.key) && (v.weight ?? 0) > 0);
  if (active.length < 2) return { skipped: 'menos de 2 variantes de quiz activas' };

  const visitMatch: any = { firstSeen: { $gte: since } };
  if (filterPT) visitMatch['geo.country'] = 'Portugal';
  const visitsRaw = await db.collection('visits').aggregate([
    { $match: visitMatch }, { $group: { _id: '$variante', c: { $sum: 1 } } },
  ]).toArray();
  const visitsBy: Record<string, number> = {};
  for (const r of visitsRaw as any[]) if (r._id) visitsBy[String(r._id)] = r.c;

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
    return { key: v.key, visits: visitsBy[tag] ?? 0, effectiveLeads: b.lead + alpha * b.phone + beta * b.email };
  }).filter((a) => a.visits > 0);

  if (arms.length < 2) return { skipped: 'sem dados suficientes por variante' };

  const pBest = thompsonProbBest(arms);
  const weights = toWeights(pBest, floorPct, capPct);

  const recommendation: Recommendation = {
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

  // Auto-aplicar? Só quando o modo de distribuição é 'auto' E o sub-modo é 'auto'.
  // Guarda-costas: só se as variantes activas detêm todo o peso (não mexer noutras),
  // movimento gradual limitado a maxDeltaPerDay, e registo do que mudou.
  const mode = cfg?.distributionMode ?? (cfg?.variantSchedulesActive ? 'schedule' : 'manual');
  const apply = ab.apply === 'auto' ? 'auto' : 'advisor';
  if (mode === 'auto' && apply === 'auto') {
    const armKeys = new Set(arms.map((a) => a.key));
    const otherWithWeight = variants.filter((v) => !armKeys.has(v.key) && (v.weight ?? 0) > 0);
    if (otherWithWeight.length) {
      return { recommendation, skipped: 'auto-aplicar ignorado: há variantes fora da rotação com peso (fixe-as a 0)' };
    }
    const mass = arms.reduce((a, v) => a + (variants.find((x) => x.key === v.key)?.weight ?? 0), 0);
    if (mass !== 100) return { recommendation, skipped: 'auto-aplicar ignorado: pesos das variantes activas não somam 100' };

    const maxDelta = typeof ab.maxDeltaPerDay === 'number' ? ab.maxDeltaPerDay : 10;
    const current: Record<string, number> = {};
    for (const a of arms) current[a.key] = variants.find((x) => x.key === a.key)?.weight ?? 0;
    const nextW = gradualWeights(current, weights, 100, maxDelta);

    const changed = arms.some((a) => (current[a.key] ?? 0) !== (nextW[a.key] ?? 0));
    if (changed) {
      const nextVariants = variants.map((v) => (nextW[v.key] != null ? { ...v, weight: nextW[v.key] } : v));
      await db.collection(COL).updateOne(
        { _id: DOC as any },
        { $set: {
          variants: nextVariants,
          'autobalance.lastApplied': { at: new Date(), from: current, to: nextW, maxDelta, reason: 'bandit (auto)' },
          updatedAt: new Date(),
        } },
        { upsert: true },
      );
      return { recommendation, applied: nextW };
    }
    return { recommendation, skipped: 'auto-aplicar: pesos já estão no alvo' };
  }

  return { recommendation };
}
