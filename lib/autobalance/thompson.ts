// Thompson Sampling (bandit Bayesiano) para o auto-balanceamento de variantes.
// Ver VARIANTES_AUTOBALANCE.md §2. Modela cada variante como Beta(1+sucessos, 1+falhas)
// e estima P(ser a melhor) por amostragem. Resolve a amostra: variantes novas têm Beta
// larga -> continuam a explorar até se provarem.

// Normal(0,1) — Box-Muller.
function randn(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Amostra Gamma(k,1) — Marsaglia-Tsang.
function gammaSample(k: number): number {
  if (k < 1) return gammaSample(1 + k) * Math.pow(Math.random(), 1 / k);
  const d = k - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    const x = randn();
    let v = 1 + c * x;
    if (v <= 0) continue;
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

// Amostra Beta(a,b) (a,b reais > 0).
function betaSample(a: number, b: number): number {
  const x = gammaSample(a);
  const y = gammaSample(b);
  return x / (x + y);
}

export type Arm = { key: string; visits: number; effectiveLeads: number };

// P(cada braço é o melhor) via Thompson Sampling sobre a taxa efetiva (efetivas/visita).
export function thompsonProbBest(arms: Arm[], draws = 5000): Record<string, number> {
  const wins: Record<string, number> = {};
  for (const a of arms) wins[a.key] = 0;
  for (let i = 0; i < draws; i++) {
    let best = -1, bk = arms[0]?.key ?? '';
    for (const a of arms) {
      const s = Math.max(0, a.effectiveLeads);
      const f = Math.max(0, a.visits - s);
      const p = betaSample(1 + s, 1 + f);
      if (p > best) { best = p; bk = a.key; }
    }
    wins[bk]++;
  }
  const out: Record<string, number> = {};
  for (const a of arms) out[a.key] = wins[a.key] / draws;
  return out;
}

// Aplica piso/teto e devolve inteiros que somam 100 (maior resto).
export function toWeights(prob: Record<string, number>, floorPct = 5, capPct = 85): Record<string, number> {
  const keys = Object.keys(prob);
  if (!keys.length) return {};
  let w: Record<string, number> = {};
  for (const k of keys) w[k] = Math.min(prob[k], capPct / 100);
  for (const k of keys) if (w[k] > 0 && w[k] < floorPct / 100) w[k] = floorPct / 100;
  const total = keys.reduce((a, k) => a + w[k], 0) || 1;
  for (const k of keys) w[k] = w[k] / total;
  // arredondar a inteiros somando 100
  const parts = keys.map((k) => ({ k, v: w[k] * 100, f: Math.floor(w[k] * 100) }));
  let sum = parts.reduce((a, p) => a + p.f, 0);
  parts.sort((a, b) => (b.v - b.f) - (a.v - a.f));
  let i = 0;
  while (sum < 100 && parts.length) { parts[i % parts.length].f++; sum++; i++; }
  const res: Record<string, number> = {};
  for (const p of parts) res[p.k] = p.f;
  return res;
}
