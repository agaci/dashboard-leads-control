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
  leadsPerSource: { source: string; count: number }[];
  leadsPerUrgency: { urgency: string; count: number }[];
  topRoutes: { origem: string; destino: string; count: number; avgPrice: number }[];
  bot: { total: number; completed: number; escalated: number; closed: number; active: number; topActiveSteps: { step: string; count: number }[] };
  closeReasons: { reason: string; step: string; count: number }[];
  variantFunnel: VariantFunnelRow[];
  bestVariant: string | null;
  visitsSince: string | null;
};

type VariantFunnelRow = {
  variante: string;
  visits: number; conversas: number; leads: number;
  visitsReliable: boolean;
  visitToConv: number | null; convToLead: number | null; visitToLead: number | null;
};

const VAR_COLOR: Record<string, [string, string]> = {
  QUIZ:  ['rgba(99,102,241,0.16)', '#818cf8'],
  QUIZ4: ['rgba(234,88,12,0.16)', '#fb923c'],
  QUIZ5: ['rgba(20,184,166,0.16)', '#2dd4bf'],
};
const VAR_LABEL: Record<string, string> = { QUIZ: 'Quiz', QUIZ4: 'Quiz 4', QUIZ5: 'Quiz 5' };

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

function BarChart({ data }: { data: { date: string; count: number }[] }) {
  const max = Math.max(...data.map(d => d.count), 1);
  const W = 700, H = 120, barW = Math.floor(W / data.length) - 2;

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H + 24}`} style={{ display: 'block' }}>
      {data.map((d, i) => {
        const h = Math.max(2, (d.count / max) * H);
        const x = i * (W / data.length) + 1;
        const showLabel = i % 5 === 0;
        return (
          <g key={d.date}>
            <rect x={x} y={H - h} width={barW} height={h} rx={2} fill={d.count > 0 ? CYAN : 'rgba(255,255,255,0.06)'} opacity={0.85} />
            {d.count > 0 && (
              <text x={x + barW / 2} y={H - h - 4} textAnchor="middle" fontSize={9} fill={TEXT2}>{d.count}</text>
            )}
            {showLabel && (
              <text x={x + barW / 2} y={H + 16} textAnchor="middle" fontSize={8} fill={TEXT3}>{d.date.slice(5)}</text>
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
  { key: '7d',  label: '7 dias' },
  { key: '30d', label: '30 dias' },
  { key: '90d', label: '90 dias' },
  { key: 'mes', label: 'Este mês' },
] as const;

type PeriodKey = typeof PERIODS[number]['key'];

const PERIOD_LABEL: Record<PeriodKey, string> = {
  '7d': 'últimos 7 dias', '30d': 'últimos 30 dias',
  '90d': 'últimos 90 dias', 'mes': 'este mês',
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

export default function RelatoriosPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodKey>('30d');

  const load = (p: PeriodKey) => {
    setLoading(true);
    fetch(`/api/reports?period=${p}`).then(r => r.json()).then(d => {
      if (d.success) setData(d);
      setLoading(false);
    });
  };

  useEffect(() => { load(period); }, [period]);

  if (loading) return <div className="p-8 text-sm text-gray-400">A carregar relatório...</div>;
  if (!data) return <div className="p-8 text-sm text-red-400">Erro ao carregar dados.</div>;

  const { kpis, leadsPerDay, leadsPerSource, leadsPerUrgency, topRoutes, bot, closeReasons, variantFunnel = [], bestVariant = null, visitsSince = null } = data;
  const visitsMaturing = variantFunnel.some((v) => v.conversas > 0 && v.visitToConv == null);
  const visitsSinceLabel = visitsSince ? new Date(visitsSince).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : null;
  const maxSource = Math.max(...leadsPerSource.map(s => s.count), 1);
  const maxUrgency = Math.max(...leadsPerUrgency.map(u => u.count), 1);
  const botCompletionRate = bot.total > 0 ? Math.round((bot.completed / bot.total) * 100) : 0;

  const growthLabel = kpis.growthRate !== null
    ? `${kpis.growthRate >= 0 ? '+' : ''}${Math.round(kpis.growthRate)}% vs mês anterior`
    : 'primeiro mês';

  return (
    <div style={{ overflowY: 'auto', height: '100%', background: 'var(--yb-bg)', padding: 24 }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>

        {/* Header */}
        <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 20, color: 'var(--yb-fg)' }}>Relatórios</h1>
            <p style={{ fontSize: 12, color: TEXT3, marginTop: 2 }}>Dados em tempo real · {PERIOD_LABEL[period]}</p>
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
            <button
              onClick={() => load(period)}
              style={{ fontSize: 12, color: TEXT3, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '5px 10px', background: 'rgba(255,255,255,0.04)', cursor: 'pointer' }}
              title="Actualizar"
            >↻</button>
          </div>
        </div>

        {/* KPIs */}
        <div className="flex gap-3 mb-4 flex-wrap">
          <KPI label="Leads este mês" value={String(kpis.leadsMonth)} sub={growthLabel} color={CYAN} icon="" />
          <KPI label="Total leads" value={String(kpis.leadsAllTime)} sub="desde o início" icon="" />
          <KPI label="Taxa conversão" value={`${kpis.conversionRate}%`} sub="simulações → confirmadas" color={kpis.conversionRate >= 20 ? '#22c55e' : '#f59e0b'} icon="" />
          <KPI label="Receita estimada" value={`€${kpis.totalRevMonth.toFixed(0)}`} sub={`Média: €${kpis.avgLeadValue.toFixed(0)}/lead`} color="#22c55e" icon="" />
        </div>

        {/* Gráfico leads por dia */}
        <div style={{ background: CARD_BG, borderRadius: 12, border: `1px solid ${BORDER}`, padding: '16px 18px', marginBottom: 14 }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: TEXT3, marginBottom: 12 }}>Leads confirmadas — {PERIOD_LABEL[period]}</p>
          <BarChart data={leadsPerDay} />
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
          <p style={{ fontSize: 11, color: TEXT3, marginBottom: variantFunnel.length && visitsMaturing ? 10 : 14 }}>Visitas ao site → conversas iniciadas → leads concluídas, e as taxas de passagem.</p>

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
                return w?.convToLead != null ? <> — melhor conversão <strong>conversa → lead ({w.convToLead}%)</strong></> : null;
              })()}.
            </div>
          ) : variantFunnel.length > 0 ? (
            <p style={{ marginTop: 12, fontSize: 12, color: TEXT3 }}>Amostra ainda insuficiente para eleger a vencedora (mínimo 5 conversas por variante).</p>
          ) : null}
        </div>

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
