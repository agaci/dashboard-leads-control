'use client';

import { Fragment, useEffect, useState } from 'react';

const CYAN   = 'var(--yb-cyan)';
const NAVY   = 'var(--yb-fg)';
const BORDER = 'var(--yb-border)';
const CARD_BG   = 'var(--yb-card)';
const CARD_INNER = 'var(--yb-card-2)';
const TEXT2  = 'var(--yb-muted)';
const TEXT3  = 'var(--yb-subtle)';

type ReportData = {
  kpis: { leadsMonth: number; leadsAllTime: number; conversionRate: number; totalRevMonth: number; avgLeadValue: number; growthRate: number | null };
  leadsPerDay: { date: string; count: number }[];
  granularity: 'hour' | 'day';
  metricFilterPT?: boolean;
  leadsPerSource: { source: string; count: number }[];
  leadsPerUrgency: { urgency: string; count: number }[];
  topRoutes: { origem: string; destino: string; count: number; avgPrice: number }[];
  bot: { total: number; completed: number; escalated: number; closed: number; active: number; topActiveSteps: { step: string; count: number }[] };
  closeReasons: { reason: string; step: string; count: number }[];
  variantFunnel: VariantFunnelRow[];
  bestVariant: string | null;
  bestMetric: 'visitToLead' | 'convToLead' | null;
  visitsSince: string | null;
  deviceBreakdown: { mobile: number; tablet: number; desktop: number; total: number };
  dropoff: DropoffVariant[];
};

type DropStep = { index: number; step: string; reached: number; dropped: number; droppedPct: number | null; medianMs: number | null };
type DropoffVariant = { variante: string; started: number; completed: number; reliable?: boolean; steps: DropStep[] };

const DROPOFF_MIN = 30; // amostra mínima p/ % e "maior fuga" fiáveis
function fmtDur(ms: number | null): string {
  if (ms == null) return '';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}m ${r}s` : `${m}m`;
}

const STEP_DROP_PT: Record<string, string> = {
  nome: 'Nome', telefone: 'Telemóvel', email: 'Email', origem: 'Recolha', destino: 'Entrega',
  volumes: 'Nº volumes', peso: 'Peso/volume', dimensoes: 'Dimensões', urgencia: 'Urgência',
  material: 'Material', embalado: 'Embalagem', review: 'Resumo',
};

type VariantFunnelRow = {
  variante: string;
  visits: number; conversas: number; leads: number;
  visitsReliable: boolean;
  visitToConv: number | null; convToLead: number | null; visitToLead: number | null;
};

const VAR_COLOR: Record<string, [string, string]> = {
  QUIZ:  ['rgba(99,102,241,0.16)', '#818cf8'],
  QUIZ3: ['rgba(59,130,246,0.16)', '#3b82f6'],
  QUIZ4: ['rgba(234,88,12,0.16)', '#fb923c'],
  QUIZ5: ['rgba(20,184,166,0.16)', '#2dd4bf'],
  QUIZ6:  ['rgba(168,85,247,0.16)', '#a855f7'],
  QUIZ6B: ['rgba(236,72,153,0.16)', '#ec4899'],
  QUIZ6C: ['rgba(6,182,212,0.16)', '#06b6d4'],
  WIDGET: ['rgba(234,179,8,0.16)', '#eab308'],
};
const VAR_LABEL: Record<string, string> = { QUIZ: 'Quiz', QUIZ3: 'Quiz 3', QUIZ4: 'Quiz 4', QUIZ5: 'Quiz 5', QUIZ6: 'Quiz 6', QUIZ6B: 'Quiz 6b', QUIZ6C: 'Quiz 6c', WIDGET: 'Widget' };

const STEP_PT: Record<string, string> = {
  COLLECTING_ORIGEM: 'A recolher origem', COLLECTING_DESTINO: 'A recolher destino',
  COLLECTING_VIATURA: 'A escolher viatura', COLLECTING_URGENCIA: 'A escolher urgência',
  COLLECTING_WEIGHT: 'A recolher peso', CALCULATING_PRICE: 'A calcular preço',
  PRESENTING_PRICE: 'Preço apresentado', PRESENTING_PARTNER_PRICE: 'Preço parceiro',
  HANDLING_OBJECTION: 'Objecção', COLLECTING_NOME: 'A recolher nome', COLLECTING_EMAIL: 'A recolher email',
};

function KPI({ label, value, sub, color, icon }: { label: string; value: string; sub?: string; color?: string; icon: string }) {
  return (
    <div style={{ background: CARD_BG, borderRadius: 12, border: `1px solid ${BORDER}`, padding: '16px 18px', flex: 1 }}>
      <div className="flex items-start justify-between">
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: TEXT3, marginBottom: 6 }}>{label}</p>
          <p style={{ fontSize: 26, fontWeight: 700, color: color ?? NAVY, fontFamily: 'Space Grotesk, sans-serif', lineHeight: 1 }}>{value}</p>
          {sub && <p style={{ fontSize: 11, color: TEXT3, marginTop: 4 }}>{sub}</p>}
        </div>
        <span style={{ fontSize: 22 }}>{icon}</span>
      </div>
    </div>
  );
}

function BarChart({ data, granularity = 'day' }: { data: { date: string; count: number }[]; granularity?: 'hour' | 'day' }) {
  const max = Math.max(...data.map(d => d.count), 1);
  const W = 700, H = 120, TOP = 16, barW = Math.floor(W / data.length) - 2;
  const labelEvery = granularity === 'hour' ? 3 : 5;

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${TOP + H + 24}`} style={{ display: 'block' }}>
      {data.map((d, i) => {
        const h = Math.max(2, (d.count / max) * H);
        const x = i * (W / data.length) + 1;
        const showLabel = i % labelEvery === 0;
        const label = granularity === 'hour' ? d.date : d.date.slice(5);
        return (
          <g key={d.date}>
            <rect x={x} y={TOP + H - h} width={barW} height={h} rx={2} fill={d.count > 0 ? CYAN : 'rgba(255,255,255,0.06)'} opacity={0.85} />
            {d.count > 0 && (
              <text x={x + barW / 2} y={TOP + H - h - 4} textAnchor="middle" fontSize={9} fill={TEXT2}>{d.count}</text>
            )}
            {showLabel && (
              <text x={x + barW / 2} y={TOP + H + 16} textAnchor="middle" fontSize={8} fill={TEXT3}>{label}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function HBar({ label, value, max, color = CYAN }: { label: string; value: number; max: number; color?: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3 mb-2">
      <span style={{ fontSize: 12, color: TEXT2, width: 110, textAlign: 'right', flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.07)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.6s ease' }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: NAVY, width: 30 }}>{value}</span>
    </div>
  );
}

const PERIODS = [
  { key: 'hoje',  label: 'Hoje' },
  { key: 'ontem', label: 'Ontem' },
  { key: '7d',    label: '7 dias' },
  { key: '30d',   label: '30 dias' },
  { key: '90d',   label: '90 dias' },
  { key: 'mes',   label: 'Este mês' },
] as const;

type PeriodKey = typeof PERIODS[number]['key'];

const PERIOD_LABEL: Record<PeriodKey, string> = {
  hoje: 'hoje', ontem: 'ontem',
  '7d': 'últimos 7 dias', '30d': 'últimos 30 dias',
  '90d': 'últimos 90 dias', 'mes': 'este mês',
};

// Rótulo do card de leads consoante o período seleccionado
const KPI_LEADS_LABEL: Record<PeriodKey, string> = {
  hoje: 'Leads hoje', ontem: 'Leads ontem',
  '7d': 'Leads 7 dias', '30d': 'Leads 30 dias',
  '90d': 'Leads 90 dias', 'mes': 'Leads este mês',
};

// Texto de comparação com o período anterior
const KPI_COMPARE: Record<PeriodKey, string> = {
  hoje: 'vs ontem', ontem: 'vs dia anterior',
  '7d': 'vs 7 dias anteriores', '30d': 'vs 30 dias anteriores',
  '90d': 'vs 90 dias anteriores', 'mes': 'vs mês anterior',
};

function VariantFunnel({ v, isBest }: { v: VariantFunnelRow; isBest: boolean }) {
  const [bg, fg] = VAR_COLOR[v.variante] ?? ['rgba(148,163,184,0.15)', '#94a3b8'];
  const max = Math.max(v.visits, v.conversas, v.leads, 1);
  const pct = (x: number | null) => (x == null ? '—' : `${x}%`);
  const stages = [
    { label: 'Visitas', value: v.visits },
    { label: 'Conversas', value: v.conversas },
    { label: 'Leads', value: v.leads },
  ];
  return (
    <div style={{
      padding: 14, borderRadius: 10,
      background: isBest ? 'rgba(34,197,94,0.06)' : CARD_INNER,
      border: `1px solid ${isBest ? 'rgba(34,197,94,0.35)' : BORDER}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 20, background: bg, color: fg }}>
          {VAR_LABEL[v.variante] ?? v.variante}
        </span>
        {isBest && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 800, padding: '3px 8px', borderRadius: 20, background: 'rgba(34,197,94,0.15)', color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM5 9a2 2 0 0 1-2-2V5h2M19 9a2 2 0 0 0 2-2V5h-2"/></svg>
            Melhor
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: TEXT2 }}>
          global <strong style={{ color: NAVY }}>{pct(v.visitToLead)}</strong>
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        {stages.map((s, i) => (
          <Fragment key={s.label}>
            <div style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
              <p style={{ fontSize: 22, fontWeight: 700, color: NAVY, fontFamily: 'Space Grotesk, sans-serif', lineHeight: 1 }}>{s.value}</p>
              <p style={{ fontSize: 10, color: TEXT3, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</p>
              <div style={{ marginTop: 7, height: 5, display: 'flex', justifyContent: 'center' }}>
                <div style={{ width: `${Math.max(4, (s.value / max) * 100)}%`, height: '100%', background: fg, borderRadius: 3, opacity: 0.85 }} />
              </div>
            </div>
            {i < stages.length - 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minWidth: 46, paddingTop: 4 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={TEXT3} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                <span style={{ fontSize: 11, fontWeight: 700, color: fg, marginTop: 2 }}>{i === 0 ? pct(v.visitToConv) : pct(v.convToLead)}</span>
              </div>
            )}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

// Estatística "atual -> projetado" para o card de maximização
function ProjStat({ label, current, projected, uplift, pct, highlight }: {
  label: string; current: number; projected: number; uplift: number; pct: number | null; highlight?: boolean;
}) {
  const up = uplift > 0;
  return (
    <div style={{ padding: 14, borderRadius: 10, background: highlight ? 'rgba(34,197,94,0.06)' : CARD_INNER, border: `1px solid ${highlight ? 'rgba(34,197,94,0.28)' : BORDER}` }}>
      <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: TEXT3, marginBottom: 8 }}>{label}</p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 16, color: TEXT2, fontFamily: 'Space Grotesk, sans-serif' }}>{current}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={TEXT3} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ alignSelf: 'center' }}><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        <span style={{ fontSize: 28, fontWeight: 700, color: NAVY, fontFamily: 'Space Grotesk, sans-serif', lineHeight: 1 }}>{projected}</span>
      </div>
      <p style={{ fontSize: 12, fontWeight: 700, marginTop: 6, color: up ? '#22c55e' : TEXT3 }}>
        {up ? `+${uplift}` : uplift === 0 ? 'sem variação' : uplift}{pct != null && uplift !== 0 ? ` (${up ? '+' : ''}${pct}%)` : ''}
      </p>
    </div>
  );
}

// Gráfico de drop-off por passo de uma variante de quiz
function DropoffChart({ d }: { d: DropoffVariant }) {
  const top = d.started || 1;
  const reliable = d.reliable ?? d.started >= DROPOFF_MIN;
  // "Maior fuga" (o muro) — só faz sentido crown com amostra suficiente.
  let killerIdx = -1;
  if (reliable) {
    let killerDrop = 0;
    d.steps.forEach((s, i) => { if (s.dropped > killerDrop) { killerDrop = s.dropped; killerIdx = i; } });
  }
  return (
    <div>
      {!reliable && (
        <div style={{ marginBottom: 12, padding: '8px 11px', borderRadius: 8, background: 'rgba(245,158,11,0.09)', border: '1px solid rgba(245,158,11,0.28)', fontSize: 11.5, color: TEXT2, lineHeight: 1.5 }}>
          <strong style={{ color: '#f59e0b' }}>Amostra pequena ({d.started} iniciaram):</strong> os % e o "maior fuga" ainda são
          ruído — cada saída é ~1 pessoa. Fiável a partir de ~{DROPOFF_MIN}. O nº alcançado e os tempos servem de indicação.
        </div>
      )}
      {d.steps.map((s, i) => {
        const w = Math.max(2, (s.reached / top) * 100);
        const isKiller = i === killerIdx && s.dropped > 0;
        return (
          <div key={s.index} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ width: 84, textAlign: 'right', fontSize: 11, color: TEXT2, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{STEP_DROP_PT[s.step] ?? s.step}</span>
            <div style={{ flex: 1, height: 16, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${w}%`, height: '100%', background: isKiller ? '#ef4444' : CYAN, opacity: 0.85, borderRadius: 4, transition: 'width 0.5s ease' }} />
            </div>
            <span style={{ width: 26, fontSize: 12, fontWeight: 700, color: NAVY, textAlign: 'right' }}>{s.reached}</span>
            <span style={{ width: 48, fontSize: 10.5, color: TEXT3, textAlign: 'right' }} title="Tempo mediano neste passo">{fmtDur(s.medianMs)}</span>
            <span style={{ width: 116, fontSize: 11, fontWeight: 700, color: !reliable ? TEXT3 : (s.dropped > 0 ? (isKiller ? '#ef4444' : '#f59e0b') : TEXT3) }}>
              {s.dropped > 0 ? `-${s.dropped}${reliable && s.droppedPct != null ? ` (-${s.droppedPct}%)` : ''}${isKiller ? ' · maior fuga' : ''}` : '—'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function RelatoriosPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodKey | 'custom'>('30d');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [dropVar, setDropVar] = useState<string | null>(null); // variante selecionada no drop-off

  const load = (p: string, f?: string, t?: string) => {
    setLoading(true);
    let url = `/api/reports?period=${p}`;
    if (p === 'custom' && f) url += `&from=${f}&to=${t || f}`;
    fetch(url).then(r => r.json()).then(d => {
      if (d.success) setData(d);
      setLoading(false);
    });
  };

  useEffect(() => { if (period !== 'custom') load(period); }, [period]);

  function applyCustom() {
    if (!fromDate) return;
    setPeriod('custom');
    load('custom', fromDate, toDate || fromDate);
  }

  const periodLabel = period === 'custom'
    ? (fromDate ? `${fromDate}${toDate && toDate !== fromDate ? ` a ${toDate}` : ''}` : 'intervalo')
    : PERIOD_LABEL[period as PeriodKey];

  // Só mostramos o ecrã cheio de "a carregar" no primeiro carregamento (sem dados).
  // Ao trocar de período mantemos os dados no lugar e esbatemos enquanto atualiza.
  if (!data) return (
    <div className="p-8 text-sm" style={{ color: loading ? TEXT3 : '#f87171' }}>
      {loading ? 'A carregar relatório...' : 'Erro ao carregar dados.'}
    </div>
  );

  const { kpis, leadsPerDay, granularity = 'day', metricFilterPT = false, leadsPerSource, leadsPerUrgency, topRoutes, bot, closeReasons, variantFunnel = [], bestVariant = null, bestMetric = null, visitsSince = null, deviceBreakdown = { mobile: 0, tablet: 0, desktop: 0, total: 0 }, dropoff = [] } = data;
  // Drop-off: variante selecionada (a escolhida, senão a vencedora, senão a primeira)
  const selectedDrop = dropoff.find((x) => x.variante === dropVar)
    ?? dropoff.find((x) => x.variante === bestVariant)
    ?? dropoff[0]
    ?? null;
  const dpct = (n: number) => (deviceBreakdown.total > 0 ? Math.round((n / deviceBreakdown.total) * 100) : 0);
  const visitsMaturing = variantFunnel.some((v) => v.conversas > 0 && v.visitToConv == null);
  const visitsSinceLabel = visitsSince ? new Date(visitsSince).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : null;
  const maxSource = Math.max(...leadsPerSource.map(s => s.count), 1);
  const maxUrgency = Math.max(...leadsPerUrgency.map(u => u.count), 1);
  const botCompletionRate = bot.total > 0 ? Math.round((bot.completed / bot.total) * 100) : 0;

  const compareText = period === 'custom' ? 'vs período anterior' : KPI_COMPARE[period as PeriodKey];
  const leadsLabel  = period === 'custom' ? 'Leads no período' : KPI_LEADS_LABEL[period as PeriodKey];
  const growthLabel = kpis.growthRate !== null
    ? `${kpis.growthRate >= 0 ? '+' : ''}${Math.round(kpis.growthRate)}% ${compareText}`
    : 'sem período anterior';

  // ── Projeção: e se todo o tráfego seguisse a variante vencedora? ──
  // Aplica as taxas de passagem da variante vencedora ao tráfego total do período.
  const winner = variantFunnel.find((v) => v.variante === bestVariant) ?? null;
  const totVisits    = variantFunnel.reduce((a, v) => a + v.visits, 0);
  const totConversas = variantFunnel.reduce((a, v) => a + v.conversas, 0);
  const totLeads     = variantFunnel.reduce((a, v) => a + v.leads, 0);

  type Projection = {
    basis: 'visit' | 'conv';
    projInbox: number | null; projLeads: number;
    upliftInbox: number | null; upliftInboxPct: number | null;
    upliftLeads: number; upliftLeadsPct: number | null;
  };
  let projection: Projection | null = null;
  if (winner) {
    const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);
    if (bestMetric === 'visitToLead' && winner.visitToConv != null && winner.visitToLead != null && totVisits > 0) {
      // Visitas fiáveis: projeta inbox e leads a partir das visitas totais.
      const projInbox = Math.round(totVisits * winner.visitToConv / 100);
      const projLeads = Math.round(totVisits * winner.visitToLead / 100);
      projection = {
        basis: 'visit', projInbox, projLeads,
        upliftInbox: projInbox - totConversas, upliftInboxPct: pct(projInbox - totConversas, totConversas),
        upliftLeads: projLeads - totLeads,      upliftLeadsPct: pct(projLeads - totLeads, totLeads),
      };
    } else if (winner.convToLead != null && totConversas > 0) {
      // Sem visitas fiáveis: melhora só a passagem conversa -> lead (inbox mantém-se).
      const projLeads = Math.round(totConversas * winner.convToLead / 100);
      projection = {
        basis: 'conv', projInbox: null, projLeads,
        upliftInbox: null, upliftInboxPct: null,
        upliftLeads: projLeads - totLeads, upliftLeadsPct: pct(projLeads - totLeads, totLeads),
      };
    }
  }

  return (
    <div style={{ overflowY: 'auto', height: '100%', background: 'var(--yb-bg)', padding: 24 }}>
      <div style={{ maxWidth: 900, margin: '0 auto', opacity: loading ? 0.5 : 1, transition: 'opacity 0.15s ease' }}>

        {/* Header */}
        <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 20, color: 'var(--yb-fg)' }}>Relatórios</h1>
            <p style={{ fontSize: 12, color: TEXT3, marginTop: 2 }}>Dados em tempo real · {periodLabel}{loading ? ' · a atualizar…' : ''}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {PERIODS.map(p => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                style={{
                  fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 6, cursor: 'pointer', transition: 'all 0.15s',
                  border: `1px solid ${period === p.key ? CYAN : BORDER}`,
                  background: period === p.key ? 'rgba(0,188,212,0.15)' : 'rgba(255,255,255,0.04)',
                  color: period === p.key ? CYAN : TEXT2,
                }}
              >
                {p.label}
              </button>
            ))}
            {/* Intervalo de datas */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
              <input
                type="date" value={fromDate} max={toDate || undefined}
                onChange={(e) => setFromDate(e.target.value)}
                style={{ fontSize: 11, padding: '4px 6px', borderRadius: 6, border: `1px solid ${period === 'custom' ? CYAN : BORDER}`, background: 'var(--yb-card)', color: 'var(--yb-fg)' }}
              />
              <span style={{ fontSize: 11, color: TEXT3 }}>–</span>
              <input
                type="date" value={toDate} min={fromDate || undefined}
                onChange={(e) => setToDate(e.target.value)}
                style={{ fontSize: 11, padding: '4px 6px', borderRadius: 6, border: `1px solid ${period === 'custom' ? CYAN : BORDER}`, background: 'var(--yb-card)', color: 'var(--yb-fg)' }}
              />
              <button
                onClick={applyCustom} disabled={!fromDate}
                style={{
                  fontSize: 11, fontWeight: 600, padding: '5px 10px', borderRadius: 6, cursor: fromDate ? 'pointer' : 'default',
                  border: `1px solid ${period === 'custom' ? CYAN : BORDER}`,
                  background: period === 'custom' ? 'rgba(0,188,212,0.15)' : 'rgba(255,255,255,0.04)',
                  color: period === 'custom' ? CYAN : TEXT2, opacity: fromDate ? 1 : 0.5,
                }}
              >
                Aplicar
              </button>
            </div>
            <button
              onClick={() => load(period, fromDate, toDate)}
              style={{ fontSize: 12, color: TEXT3, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '5px 10px', background: 'rgba(255,255,255,0.04)', cursor: 'pointer' }}
              title="Actualizar"
            >↻</button>
          </div>
        </div>

        {/* KPIs */}
        <div className="flex gap-3 mb-4 flex-wrap">
          <KPI label={leadsLabel} value={String(kpis.leadsMonth)} sub={growthLabel} color={CYAN} icon="" />
          <KPI label="Total leads" value={String(kpis.leadsAllTime)} sub="desde o início" icon="" />
          <KPI label="Taxa conversão" value={`${kpis.conversionRate}%`} sub="simulações → confirmadas" color={kpis.conversionRate >= 20 ? '#22c55e' : '#f59e0b'} icon="" />
          <KPI label="Receita estimada" value={`€${kpis.totalRevMonth.toFixed(0)}`} sub={`Média: €${kpis.avgLeadValue.toFixed(0)}/lead`} color="#22c55e" icon="" />
        </div>

        {/* Dispositivos */}
        <div style={{ background: CARD_BG, borderRadius: 12, border: `1px solid ${BORDER}`, padding: '14px 18px', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: TEXT3 }}>Dispositivos</p>
            <span style={{ fontSize: 11, color: TEXT3 }}>{deviceBreakdown.total} visitas</span>
          </div>
          {deviceBreakdown.total > 0 ? (
            <>
              <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', marginTop: 10, background: 'rgba(255,255,255,0.06)' }}>
                <div style={{ width: `${dpct(deviceBreakdown.mobile)}%`, background: '#00bcd4' }} />
                <div style={{ width: `${dpct(deviceBreakdown.desktop)}%`, background: '#818cf8' }} />
                <div style={{ width: `${dpct(deviceBreakdown.tablet)}%`, background: '#f59e0b' }} />
              </div>
              <div style={{ display: 'flex', gap: 18, marginTop: 10, flexWrap: 'wrap' }}>
                {[
                  { c: '#00bcd4', l: 'Telemóvel', n: deviceBreakdown.mobile },
                  { c: '#818cf8', l: 'PC', n: deviceBreakdown.desktop },
                  { c: '#f59e0b', l: 'Tablet', n: deviceBreakdown.tablet },
                ].map((d) => (
                  <span key={d.l} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: TEXT2 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 3, background: d.c }} />
                    <strong style={{ color: NAVY }}>{dpct(d.n)}%</strong> {d.l} <span style={{ color: TEXT3 }}>({d.n})</span>
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p style={{ fontSize: 12, color: TEXT3, marginTop: 8 }}>Sem dados de visitas no período.</p>
          )}
        </div>

        {/* Gráfico leads por dia */}
        <div style={{ background: CARD_BG, borderRadius: 12, border: `1px solid ${BORDER}`, padding: '16px 18px', marginBottom: 14 }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: TEXT3, marginBottom: 12 }}>
            Leads confirmadas — {periodLabel}{granularity === 'hour' ? ' · por hora' : ''}
          </p>
          <BarChart data={leadsPerDay} granularity={granularity} />
        </div>

        {/* Fonte + Urgência */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div style={{ background: CARD_BG, borderRadius: 12, border: `1px solid ${BORDER}`, padding: '16px 18px' }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: TEXT3, marginBottom: 12 }}>Por fonte</p>
            {leadsPerSource.length === 0 && <p style={{ fontSize: 12, color: TEXT3 }}>Sem dados</p>}
            {leadsPerSource.map(s => <HBar key={s.source} label={s.source} value={s.count} max={maxSource} />)}
          </div>
          <div style={{ background: CARD_BG, borderRadius: 12, border: `1px solid ${BORDER}`, padding: '16px 18px' }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: TEXT3, marginBottom: 12 }}>Por urgência</p>
            {leadsPerUrgency.length === 0 && <p style={{ fontSize: 12, color: TEXT3 }}>Sem dados</p>}
            {leadsPerUrgency.map(u => <HBar key={u.urgency} label={u.urgency ?? '—'} value={u.count} max={maxUrgency} color="#f59e0b" />)}
          </div>
        </div>

        {/* Funil por variante */}
        <div style={{ background: CARD_BG, borderRadius: 12, border: `1px solid ${BORDER}`, padding: '16px 18px', marginBottom: 14 }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: TEXT3, marginBottom: 4 }}>Funil por variante — entrada → inbox → lead</p>
          <p style={{ fontSize: 11, color: TEXT3, marginBottom: variantFunnel.length && visitsMaturing ? 10 : 14 }}>
            Visitas ao site → conversas iniciadas → leads concluídas, e as taxas de passagem.
            {metricFilterPT && <> Métrica sobre <strong style={{ color: TEXT2 }}>visitas de Portugal</strong> (exclui tráfego estrangeiro/curioso).</>}
          </p>

          {variantFunnel.length > 0 && visitsMaturing && (
            <div style={{ marginBottom: 14, padding: '9px 12px', borderRadius: 8, background: 'rgba(245,158,11,0.09)', border: '1px solid rgba(245,158,11,0.28)', fontSize: 11.5, color: TEXT2, lineHeight: 1.5 }}>
              <strong style={{ color: '#f59e0b' }}>Taxas de visita em recolha:</strong> o registo de visitas começou {visitsSinceLabel ? `a ${visitsSinceLabel}` : 'há pouco'}, por isso ainda há menos visitas do que conversas. As taxas <em>visita → conversa</em> e <em>global</em> só aparecem quando estabilizarem — a comparação usa <strong>conversa → lead</strong>.
            </div>
          )}

          {variantFunnel.length === 0 ? (
            <p style={{ fontSize: 12, color: TEXT3 }}>Sem dados de variantes neste período.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {variantFunnel.map((v) => (
                <VariantFunnel key={v.variante} v={v} isBest={v.variante === bestVariant} />
              ))}
            </div>
          )}

          {bestVariant ? (
            <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 10, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)', fontSize: 13, color: NAVY, lineHeight: 1.5 }}>
              <strong style={{ color: '#22c55e' }}>Conclusão:</strong> a variante <strong>{VAR_LABEL[bestVariant] ?? bestVariant}</strong> é a mais eficaz
              {(() => {
                const w = variantFunnel.find((x) => x.variante === bestVariant);
                if (!w) return null;
                if (bestMetric === 'visitToLead' && w.visitToLead != null)
                  return <> — melhor funil completo <strong>visita → lead ({w.visitToLead}%)</strong></>;
                if (w.convToLead != null)
                  return <> — melhor conversão <strong>conversa → lead ({w.convToLead}%)</strong></>;
                return null;
              })()}.
            </div>
          ) : variantFunnel.length > 0 ? (
            <p style={{ marginTop: 12, fontSize: 12, color: TEXT3 }}>Amostra ainda insuficiente para eleger a vencedora (mínimo 5 conversas por variante).</p>
          ) : null}
        </div>

        {/* Projeção — maximização ao seguir a análise */}
        {projection && winner && (
          <div style={{ background: CARD_BG, borderRadius: 12, border: `1px solid ${BORDER}`, padding: '16px 18px', marginBottom: 14 }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: TEXT3, marginBottom: 4 }}>Projeção — potencial ao seguir a análise</p>
            <p style={{ fontSize: 11, color: TEXT3, marginBottom: 14, lineHeight: 1.5 }}>
              Se todo o tráfego do período ({projection.basis === 'visit' ? `${totVisits} visitas` : `${totConversas} conversas`}) convertesse às taxas da variante vencedora <strong style={{ color: NAVY }}>{VAR_LABEL[bestVariant!] ?? bestVariant}</strong>
              {projection.basis === 'visit'
                ? <> (<strong style={{ color: NAVY }}>{winner.visitToConv}%</strong> visita→inbox · <strong style={{ color: NAVY }}>{winner.visitToLead}%</strong> visita→lead):</>
                : <> (<strong style={{ color: NAVY }}>{winner.convToLead}%</strong> conversa→lead):</>}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: projection.basis === 'visit' ? '1fr 1fr' : '1fr', gap: 12 }}>
              {projection.basis === 'visit' && projection.projInbox != null && (
                <ProjStat label="Inbox (conversas)" current={totConversas} projected={projection.projInbox} uplift={projection.upliftInbox ?? 0} pct={projection.upliftInboxPct} />
              )}
              <ProjStat label="Leads confirmadas" current={totLeads} projected={projection.projLeads} uplift={projection.upliftLeads} pct={projection.upliftLeadsPct} highlight />
            </div>
            <p style={{ marginTop: 12, fontSize: 11, color: TEXT3, lineHeight: 1.5 }}>
              Estimativa teórica: assume que as taxas da variante vencedora se mantêm ao aplicarem-se a todo o tráfego — serve de tecto potencial, não de garantia.
              {projection.basis === 'conv' && ' Como as visitas ainda não são fiáveis, projeta-se apenas a passagem conversa→lead (a inbox mantém-se).'}
              {' '}Quanto maior a amostra, mais fiável a projeção.
            </p>
          </div>
        )}

        {/* Drop-off por passo — onde abandonam o quiz */}
        {selectedDrop && (
          <div style={{ background: CARD_BG, borderRadius: 12, border: `1px solid ${BORDER}`, padding: '16px 18px', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: TEXT3 }}>Onde abandonam — drop-off por passo</p>
              {dropoff.length > 1 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {dropoff.map((x) => {
                    const [bg, fg] = VAR_COLOR[x.variante] ?? ['rgba(148,163,184,0.15)', '#94a3b8'];
                    const on = x.variante === selectedDrop.variante;
                    return (
                      <button key={x.variante} onClick={() => setDropVar(x.variante)}
                        style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, cursor: 'pointer',
                          background: on ? bg : 'transparent', color: on ? fg : TEXT3, border: `1px solid ${on ? fg : BORDER}` }}>
                        {VAR_LABEL[x.variante] ?? x.variante}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <p style={{ fontSize: 11, color: TEXT3, marginBottom: 14, lineHeight: 1.5 }}>
              Quantos visitantes alcançaram cada passo de <strong style={{ color: NAVY }}>{VAR_LABEL[selectedDrop.variante] ?? selectedDrop.variante}</strong>, o <strong>tempo mediano</strong> em cada passo, e onde caíram. A barra a vermelho é o passo com a maior fuga — o muro a atacar.
            </p>
            <DropoffChart d={selectedDrop} />
            <div style={{ marginTop: 12, display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 12, color: TEXT2 }}>
              <span>Iniciaram: <strong style={{ color: NAVY }}>{selectedDrop.started}</strong></span>
              <span>Concluíram (lead): <strong style={{ color: '#22c55e' }}>{selectedDrop.completed}</strong></span>
              <span>Conclusão: <strong style={{ color: NAVY }}>{selectedDrop.started > 0 ? Math.round((selectedDrop.completed / selectedDrop.started) * 100) : 0}%</strong></span>
            </div>
          </div>
        )}

        {/* Performance do bot */}
        <div style={{ background: CARD_BG, borderRadius: 12, border: `1px solid ${BORDER}`, padding: '16px 18px', marginBottom: 14 }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: TEXT3, marginBottom: 14 }}>Performance do Bot</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'Concluídas', value: bot.completed, color: '#22c55e' },
              { label: 'Escaladas', value: bot.escalated, color: '#f59e0b' },
              { label: 'Fechadas', value: bot.closed, color: '#6b7280' },
              { label: 'Activas', value: bot.active, color: CYAN },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ textAlign: 'center', padding: '10px 8px', borderRadius: 10, background: CARD_INNER }}>
                <p style={{ fontSize: 22, fontWeight: 700, color, fontFamily: 'Space Grotesk' }}>{value}</p>
                <p style={{ fontSize: 11, color: TEXT2 }}>{label}</p>
                <p style={{ fontSize: 10, color: TEXT3 }}>{bot.total > 0 ? Math.round((value / bot.total) * 100) : 0}%</p>
              </div>
            ))}
          </div>
          <div style={{ background: 'rgba(0,188,212,0.08)', borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, border: '1px solid rgba(0,188,212,0.15)' }}>
            <span style={{ fontSize: 12, color: TEXT2 }}>Taxa de conclusão do bot:</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: botCompletionRate >= 30 ? '#22c55e' : '#f59e0b' }}>{botCompletionRate}%</span>
          </div>
          {bot.topActiveSteps.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: TEXT3, marginBottom: 8 }}>Conversas activas por estado</p>
              {bot.topActiveSteps.map(s => (
                <HBar key={s.step} label={STEP_PT[s.step] ?? s.step} value={s.count} max={bot.topActiveSteps[0]?.count ?? 1} color="#94a3b8" />
              ))}
            </div>
          )}
        </div>

        {/* Motivos de fecho */}
        {closeReasons.length > 0 && (
          <div style={{ background: CARD_BG, borderRadius: 12, border: `1px solid ${BORDER}`, padding: '16px 18px', marginBottom: 14 }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: TEXT3, marginBottom: 14 }}>Motivos de fecho</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {closeReasons.map((r, i) => {
                const isResolved = r.step === 'LEAD_REGISTERED';
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: isResolved ? 'rgba(16,185,129,0.08)' : CARD_INNER, border: `1px solid ${isResolved ? 'rgba(16,185,129,0.2)' : BORDER}` }}>
                    <span style={{ fontSize: 16, color: isResolved ? '#10b981' : TEXT3 }}>{isResolved ? 'Sim' : 'Não'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: NAVY, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.reason}</p>
                      <p style={{ fontSize: 10, color: TEXT3, margin: 0 }}>{isResolved ? 'Resolvida' : 'Fechada'}</p>
                    </div>
                    <span style={{ fontSize: 18, fontWeight: 700, color: isResolved ? '#22c55e' : TEXT2, flexShrink: 0 }}>{r.count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Top rotas */}
        <div style={{ background: CARD_BG, borderRadius: 12, border: `1px solid ${BORDER}`, padding: '16px 18px', marginBottom: 24 }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: TEXT3, marginBottom: 12 }}>Top rotas</p>
          {topRoutes.length === 0 && <p style={{ fontSize: 12, color: TEXT3 }}>Sem dados</p>}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                {['Origem', 'Destino', 'Leads', 'Preço médio'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '4px 8px', color: TEXT3, fontWeight: 600, fontSize: 10, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topRoutes.map((r, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${BORDER}` }}>
                  <td style={{ padding: '7px 8px', color: NAVY }}>{r.origem ?? '—'}</td>
                  <td style={{ padding: '7px 8px', color: NAVY }}>{r.destino ?? '—'}</td>
                  <td style={{ padding: '7px 8px', fontWeight: 700, color: CYAN }}>{r.count}</td>
                  <td style={{ padding: '7px 8px', color: r.avgPrice > 0 ? '#22c55e' : '#aaa' }}>
                    {r.avgPrice > 0 ? `€${r.avgPrice.toFixed(2)}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}
