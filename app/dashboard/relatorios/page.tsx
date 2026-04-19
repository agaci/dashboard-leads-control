'use client';

import { useEffect, useState } from 'react';

const CYAN = '#00bcd4';
const NAVY = '#1a2332';
const BORDER = '#e5e7eb';

type ReportData = {
  kpis: { leadsMonth: number; leadsAllTime: number; conversionRate: number; totalRevMonth: number; avgLeadValue: number; growthRate: number | null };
  leadsPerDay: { date: string; count: number }[];
  leadsPerSource: { source: string; count: number }[];
  leadsPerUrgency: { urgency: string; count: number }[];
  topRoutes: { origem: string; destino: string; count: number; avgPrice: number }[];
  bot: { total: number; completed: number; escalated: number; closed: number; active: number; topActiveSteps: { step: string; count: number }[] };
};

const STEP_PT: Record<string, string> = {
  COLLECTING_ORIGEM: 'A recolher origem', COLLECTING_DESTINO: 'A recolher destino',
  COLLECTING_VIATURA: 'A escolher viatura', COLLECTING_URGENCIA: 'A escolher urgência',
  COLLECTING_WEIGHT: 'A recolher peso', CALCULATING_PRICE: 'A calcular preço',
  PRESENTING_PRICE: 'Preço apresentado', PRESENTING_PARTNER_PRICE: 'Preço parceiro',
  HANDLING_OBJECTION: 'Objecção', COLLECTING_NOME: 'A recolher nome', COLLECTING_EMAIL: 'A recolher email',
};

function KPI({ label, value, sub, color, icon }: { label: string; value: string; sub?: string; color?: string; icon: string }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${BORDER}`, padding: '16px 18px', flex: 1 }}>
      <div className="flex items-start justify-between">
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#aaa', marginBottom: 6 }}>{label}</p>
          <p style={{ fontSize: 26, fontWeight: 700, color: color ?? NAVY, fontFamily: 'Space Grotesk, sans-serif', lineHeight: 1 }}>{value}</p>
          {sub && <p style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>{sub}</p>}
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
            <rect x={x} y={H - h} width={barW} height={h} rx={2} fill={d.count > 0 ? CYAN : '#e5e7eb'} opacity={0.85} />
            {d.count > 0 && (
              <text x={x + barW / 2} y={H - h - 4} textAnchor="middle" fontSize={9} fill="#555">{d.count}</text>
            )}
            {showLabel && (
              <text x={x + barW / 2} y={H + 16} textAnchor="middle" fontSize={8} fill="#aaa">{d.date.slice(5)}</text>
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
      <span style={{ fontSize: 12, color: '#555', width: 110, textAlign: 'right', flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 8, background: '#f0f0f0', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.6s ease' }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: NAVY, width: 30 }}>{value}</span>
    </div>
  );
}

export default function RelatoriosPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/reports').then(r => r.json()).then(d => {
      if (d.success) setData(d);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="p-8 text-sm text-gray-400">A carregar relatório...</div>;
  if (!data) return <div className="p-8 text-sm text-red-400">Erro ao carregar dados.</div>;

  const { kpis, leadsPerDay, leadsPerSource, leadsPerUrgency, topRoutes, bot } = data;
  const maxSource = Math.max(...leadsPerSource.map(s => s.count), 1);
  const maxUrgency = Math.max(...leadsPerUrgency.map(u => u.count), 1);
  const botCompletionRate = bot.total > 0 ? Math.round((bot.completed / bot.total) * 100) : 0;

  const growthLabel = kpis.growthRate !== null
    ? `${kpis.growthRate >= 0 ? '+' : ''}${Math.round(kpis.growthRate)}% vs mês anterior`
    : 'primeiro mês';

  return (
    <div style={{ overflowY: 'auto', height: '100%', background: '#f5f6fa', padding: 24 }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 20, color: NAVY }}>Relatórios</h1>
            <p style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>Dados em tempo real · últimos 30 dias</p>
          </div>
          <button onClick={() => { setLoading(true); fetch('/api/reports').then(r => r.json()).then(d => { if (d.success) setData(d); setLoading(false); }); }}
            style={{ fontSize: 12, color: CYAN, border: `1px solid ${CYAN}`, borderRadius: 8, padding: '6px 14px', background: '#fff', cursor: 'pointer' }}>
            ↻ Actualizar
          </button>
        </div>

        {/* KPIs */}
        <div className="flex gap-3 mb-4 flex-wrap">
          <KPI label="Leads este mês" value={String(kpis.leadsMonth)} sub={growthLabel} color={CYAN} icon="" />
          <KPI label="Total leads" value={String(kpis.leadsAllTime)} sub="desde o início" icon="" />
          <KPI label="Taxa conversão" value={`${kpis.conversionRate}%`} sub="simulações → confirmadas" color={kpis.conversionRate >= 20 ? '#22c55e' : '#f59e0b'} icon="" />
          <KPI label="Receita estimada" value={`€${kpis.totalRevMonth.toFixed(0)}`} sub={`Média: €${kpis.avgLeadValue.toFixed(0)}/lead`} color="#22c55e" icon="" />
        </div>

        {/* Gráfico leads por dia */}
        <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${BORDER}`, padding: '16px 18px', marginBottom: 14 }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#aaa', marginBottom: 12 }}>Leads confirmadas — últimos 30 dias</p>
          <BarChart data={leadsPerDay} />
        </div>

        {/* Fonte + Urgência */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${BORDER}`, padding: '16px 18px' }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#aaa', marginBottom: 12 }}>Por fonte</p>
            {leadsPerSource.length === 0 && <p style={{ fontSize: 12, color: '#aaa' }}>Sem dados</p>}
            {leadsPerSource.map(s => <HBar key={s.source} label={s.source} value={s.count} max={maxSource} />)}
          </div>
          <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${BORDER}`, padding: '16px 18px' }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#aaa', marginBottom: 12 }}>Por urgência</p>
            {leadsPerUrgency.length === 0 && <p style={{ fontSize: 12, color: '#aaa' }}>Sem dados</p>}
            {leadsPerUrgency.map(u => <HBar key={u.urgency} label={u.urgency ?? '—'} value={u.count} max={maxUrgency} color="#f59e0b" />)}
          </div>
        </div>

        {/* Performance do bot */}
        <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${BORDER}`, padding: '16px 18px', marginBottom: 14 }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#aaa', marginBottom: 14 }}>Performance do Bot</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'Concluídas', value: bot.completed, color: '#22c55e' },
              { label: 'Escaladas', value: bot.escalated, color: '#f59e0b' },
              { label: 'Fechadas', value: bot.closed, color: '#6b7280' },
              { label: 'Activas', value: bot.active, color: CYAN },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ textAlign: 'center', padding: '10px 8px', borderRadius: 10, background: '#f9fafb' }}>
                <p style={{ fontSize: 22, fontWeight: 700, color, fontFamily: 'Space Grotesk' }}>{value}</p>
                <p style={{ fontSize: 11, color: '#aaa' }}>{label}</p>
                <p style={{ fontSize: 10, color: '#ccc' }}>{bot.total > 0 ? Math.round((value / bot.total) * 100) : 0}%</p>
              </div>
            ))}
          </div>
          <div style={{ background: '#f0f9ff', borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#555' }}>Taxa de conclusão do bot:</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: botCompletionRate >= 30 ? '#22c55e' : '#f59e0b' }}>{botCompletionRate}%</span>
          </div>
          {bot.topActiveSteps.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#aaa', marginBottom: 8 }}>Conversas activas por estado</p>
              {bot.topActiveSteps.map(s => (
                <HBar key={s.step} label={STEP_PT[s.step] ?? s.step} value={s.count} max={bot.topActiveSteps[0]?.count ?? 1} color="#94a3b8" />
              ))}
            </div>
          )}
        </div>

        {/* Top rotas */}
        <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${BORDER}`, padding: '16px 18px', marginBottom: 24 }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#aaa', marginBottom: 12 }}>Top rotas</p>
          {topRoutes.length === 0 && <p style={{ fontSize: 12, color: '#aaa' }}>Sem dados</p>}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                {['Origem', 'Destino', 'Leads', 'Preço médio'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '4px 8px', color: '#aaa', fontWeight: 600, fontSize: 10, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topRoutes.map((r, i) => (
                <tr key={i} style={{ borderBottom: `1px solid #f5f5f5` }}>
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
