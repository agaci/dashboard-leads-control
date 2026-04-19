'use client';

import { useEffect, useState, useCallback } from 'react';
import ParceirosPage from './parceiros/page';
import ConversasPage from './conversas/page';
import ConhecimentoPage from './conhecimento/page';
import { useNotifications } from '@/lib/useNotifications';
import AppShell from '@/components/layout/AppShell';
import type { NavTab } from '@/components/layout/NavSidebar';

// ── Design tokens ─────────────────────────────────────────────────────────────
const CYAN   = '#00bcd4';
const NAVY   = '#1a2332';
const YELLOW = '#ffc107';
const YB_BG  = '#f5f6fa';
const BORDER = '#dde1e8';

// ── Types ─────────────────────────────────────────────────────────────────────

type RoutingConfig = {
  systemActive: boolean;
  alwaysBot: boolean;
  delayMinutesBeforeBot: number;
  autoStartHour: number;
  autoEndHour: number;
  autoWeekends: boolean;
};

type LeadData = {
  nome?: string;
  email?: string;
  telefone?: string;
  origem?: string;
  destino?: string;
  viatura?: string;
  urgencia?: string;
  serviceType?: 'direto' | 'arrasto' | 'internacional';
  weightKg?: number;
  partnerWindow?: string;
  partnerFinalPrice?: number;
  priceCalculated?: number;
  priceWithDiscount?: number;
  discount?: number;
  distance?: number;
  converted?: boolean;
  source?: string;
};

type Lead = {
  id: string;
  messageType: 'newLead' | 'preLeadSimulation' | 'clientSimulation';
  timeStamp: string;
  closed: boolean;
  closedAt?: string;
  message: string;
  senderName: string;
  variante: string | null;
  leadData: LeadData;
};

const VARIANTE_LABELS: Record<string, string> = {
  A: 'Site A', B: 'Site B', C: 'Site C', D: 'Site D', BOT: 'Bot',
};

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ name, size = 36, bot = false }: { name?: string; size?: number; bot?: boolean }) {
  const initials = bot
    ? 'AI'
    : (name ?? '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  const palettes: [string, string][] = [
    ['#e3f2fd', '#1565c0'], ['#e8f5e9', '#2e7d32'], ['#fff8e1', '#e65100'],
    ['#fce4ec', '#880e4f'], ['#ede7f6', '#4527a0'], ['#e0f7fa', '#006064'],
  ];
  const idx = bot ? 0 : (name?.charCodeAt(0) ?? 0) % palettes.length;
  const [bg, fg] = palettes[idx];

  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: bg, color: fg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.36, fontWeight: 700, flexShrink: 0,
      fontFamily: 'Space Grotesk, sans-serif',
    }}>
      {initials}
    </div>
  );
}

// ── Relative time ─────────────────────────────────────────────────────────────

function relTime(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'agora';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

// ── Tag badge ─────────────────────────────────────────────────────────────────

const TAG: Record<string, [string, string]> = {
  bot:      ['#e3f2fd', '#1565c0'],
  auto:     ['#e8f5e9', '#2e7d32'],
  manual:   ['#fff8e1', '#e65100'],
  urgente:  ['#ffebee', '#c62828'],
  novo:     ['#e0f7fa', '#006064'],
  perdido:  ['#f5f5f5', '#757575'],
  lead:     ['#e8f5e9', '#2e7d32'],
  sim:      ['#e3f2fd', '#1565c0'],
};

function Tag({ label, type }: { label: string; type: string }) {
  const [bg, fg] = TAG[type] ?? ['#f0f0f0', '#555'];
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: bg, color: fg }}>
      {label}
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [tab, setTab] = useState<NavTab>('leads');
  const [badges, setBadges] = useState<{ leads: boolean; conversas: boolean }>({ leads: false, conversas: false });

  useNotifications((alert) => {
    if (alert.type === 'escalation') setBadges((b) => ({ ...b, conversas: true }));
    if (alert.type === 'lead')       setBadges((b) => ({ ...b, leads: true }));
  });

  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'leads' | 'sims'>('all');
  const [selected, setSelected] = useState<Lead | null>(null);
  const [page, setPage] = useState(0);
  const LIMIT = 20;

  const fetchLeads = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/leads?type=${filter}&limit=${LIMIT}&skip=${page * LIMIT}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? 'Erro desconhecido');
      setLeads(data.leads);
      setTotal(data.total);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filter, page]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);
  useEffect(() => { setPage(0); }, [filter]);

  const totalPages = Math.ceil(total / LIMIT);

  function switchTab(t: NavTab) {
    setTab(t);
    setBadges((b) => ({ ...b, [t]: false }));
  }

  return (
    <AppShell
      activeTab={tab}
      onTabChange={switchTab}
      leadsCount={total}
      alertsCount={badges.conversas ? 1 : 0}
      inboxBadge={badges.leads ? 1 : 0}
    >
      {/* ── Leads ── */}
      {tab === 'leads' && (
        <>
          {/* Lista */}
          <div style={{
            width: 276, flexShrink: 0,
            background: '#fff',
            borderRight: `1px solid ${BORDER}`,
            display: 'flex', flexDirection: 'column',
          }}>
            {/* Header */}
            <div style={{ background: '#fff', padding: '12px 12px 0', borderBottom: `1px solid ${BORDER}` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>Leads</span>
                <button
                  onClick={fetchLeads}
                  style={{ fontSize: 14, color: '#aaa', border: 'none', background: 'none', cursor: 'pointer', padding: '2px 6px' }}
                  title="Actualizar"
                >↻</button>
              </div>
              {/* Search */}
              <input
                type="text"
                placeholder="Pesquisar..."
                style={{
                  width: '100%', height: 32, padding: '0 10px',
                  background: YB_BG, border: `1px solid ${BORDER}`,
                  borderRadius: 6, fontSize: 12, outline: 'none',
                  boxSizing: 'border-box', color: NAVY,
                }}
              />
              {/* Filters */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '8px 0 10px' }}>
                {(['all', 'leads', 'sims', 'urgente'] as const).map((f) => {
                  const label = f === 'all' ? 'Todas' : f === 'leads' ? 'Bot' : f === 'sims' ? 'Manual' : 'Urgente';
                  const active = filter === f;
                  return (
                    <button
                      key={f}
                      onClick={() => setFilter(f === 'urgente' ? 'all' : f as any)}
                      style={{
                        padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        border: `1px solid ${active ? CYAN : BORDER}`,
                        background: active ? CYAN : '#fff',
                        color: active ? '#fff' : '#666',
                        transition: 'all 0.15s',
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Lead items */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {loading && <div style={{ padding: '20px 12px', textAlign: 'center', fontSize: 12, color: '#aaa' }}>A carregar...</div>}
              {error && <div style={{ padding: '12px', fontSize: 12, color: '#e53e3e' }}>{error}</div>}
              {!loading && leads.length === 0 && (
                <div style={{ padding: '32px 12px', textAlign: 'center', fontSize: 12, color: '#aaa' }}>Sem resultados</div>
              )}
              {leads.map((lead) => {
                const isSelected = selected?.id === lead.id;
                const isBot = lead.variante === 'BOT';
                const nome = lead.leadData.nome ?? lead.leadData.telefone ?? 'Sem nome';
                const rota = lead.leadData.origem
                  ? `${lead.leadData.origem.split(',')[0]} → ${(lead.leadData.destino ?? '?').split(',')[0]}`
                  : lead.senderName;
                const price = lead.leadData.priceWithDiscount ?? lead.leadData.partnerFinalPrice;
                const unread = !lead.closed && lead.messageType === 'newLead';

                return (
                  <button
                    key={lead.id}
                    onClick={() => setSelected(lead)}
                    style={{
                      width: '100%', textAlign: 'left',
                      padding: '10px 12px',
                      background: isSelected ? '#f0f8ff' : '#fff',
                      borderLeft: isSelected ? `3px solid ${CYAN}` : '3px solid transparent',
                      borderBottom: `1px solid #e8eaf0`,
                      borderTop: 'none', borderRight: 'none',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = '#f0f8ff'; }}
                    onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = '#fff'; }}
                  >
                    {/* Row 1: nome + tempo */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                      <span style={{
                        fontSize: 13, fontWeight: 600,
                        color: isSelected ? '#007a8a' : NAVY,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140,
                      }}>
                        {nome}
                      </span>
                      <span style={{ fontSize: 11, color: '#aaa', flexShrink: 0 }}>{relTime(lead.timeStamp)}</span>
                    </div>
                    {/* Row 2: rota + preço */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>
                        {rota}
                      </span>
                      {price != null ? (
                        <span style={{ fontSize: 12, fontWeight: 700, color: CYAN, flexShrink: 0 }}>
                          {price.toFixed(0)}€
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: '#aaa', flexShrink: 0 }}>—</span>
                      )}
                    </div>
                    {/* Row 3: badges + dot */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Tag label={isBot ? 'Bot' : 'Manual'} type={isBot ? 'bot' : 'manual'} />
                      {lead.leadData.urgencia && (
                        <Tag
                          label={lead.leadData.urgencia}
                          type={lead.leadData.urgencia === '1 Hora' ? 'urgente' : 'auto'}
                        />
                      )}
                      {unread && (
                        <span style={{
                          marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%',
                          background: YELLOW, flexShrink: 0, display: 'inline-block',
                        }} />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ padding: '8px 12px', borderTop: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between' }}>
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
                  style={{ fontSize: 11, color: '#aaa', border: 'none', background: 'none', cursor: page === 0 ? 'default' : 'pointer', opacity: page === 0 ? 0.3 : 1 }}
                >← Anterior</button>
                <span style={{ fontSize: 11, color: '#aaa' }}>{page + 1}/{totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                  style={{ fontSize: 11, color: '#aaa', border: 'none', background: 'none', cursor: page >= totalPages - 1 ? 'default' : 'pointer', opacity: page >= totalPages - 1 ? 0.3 : 1 }}
                >Próximo →</button>
              </div>
            )}
          </div>

          {/* Detail */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 24, background: YB_BG }}>
            {!selected ? (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, color: '#bbb' }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>
                  <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
                </svg>
                <p style={{ fontSize: 13 }}>Seleccione uma lead para ver detalhes</p>
              </div>
            ) : (
              <DetailPanel lead={selected} onClose={() => setSelected(null)} />
            )}
          </div>
        </>
      )}

      {/* inbox → Conversas/escalações */}
      {tab === 'inbox' && (
        <div style={{ flex: 1, overflow: 'hidden', height: '100%' }}>
          <ConversasPage />
        </div>
      )}

      {/* servicos → Parceiros/tarifas */}
      {tab === 'servicos' && (
        <div style={{ flex: 1, overflow: 'hidden', height: '100%' }}>
          <ParceirosPage />
        </div>
      )}

      {/* baseIA → Base de conhecimento */}
      {tab === 'baseIA' && (
        <div style={{ flex: 1, overflow: 'hidden', height: '100%' }}>
          <ConhecimentoPage />
        </div>
      )}

      {(tab === 'clientes' || tab === 'precos' || tab === 'relatorios') && (
        <ComingSoon tab={tab} />
      )}

      {tab === 'routing' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 32 }}>
          <div style={{ maxWidth: 600 }}>
            <RoutingPanel />
          </div>
        </div>
      )}
    </AppShell>
  );
}

// ── Coming Soon ───────────────────────────────────────────────────────────────

const COMING_SOON_META: Record<string, { label: string; icon: string; desc: string }> = {
  clientes:   { label: 'Clientes',   icon: '👥', desc: 'Gestão completa de clientes, histórico de encomendas e segmentação.' },
  precos:     { label: 'Preços',     icon: '💰', desc: 'Configuração de tarifas, descontos e simulação de preços avançada.' },
  relatorios: { label: 'Relatórios', icon: '📊', desc: 'Dashboards, métricas de conversão e exportação de dados.' },
  inbox:      { label: 'Inbox',      icon: '📬', desc: 'Central de mensagens e notificações em tempo real.' },
};

function ComingSoon({ tab }: { tab: NavTab }) {
  const meta = COMING_SOON_META[tab] ?? { label: tab, icon: '🚧', desc: 'Esta secção está em desenvolvimento.' };

  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: YB_BG, height: '100%',
    }}>
      <div style={{ textAlign: 'center', maxWidth: 380 }}>
        {/* Glow ring */}
        <div style={{
          width: 100, height: 100, borderRadius: '50%', margin: '0 auto 28px',
          background: 'linear-gradient(135deg, rgba(0,188,212,0.15) 0%, rgba(0,188,212,0.05) 100%)',
          border: '2px solid rgba(0,188,212,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 40,
          boxShadow: '0 0 40px rgba(0,188,212,0.12)',
        }}>
          {meta.icon}
        </div>

        {/* Label pill */}
        <div style={{
          display: 'inline-block', marginBottom: 12,
          background: 'rgba(0,188,212,0.10)', color: CYAN,
          fontSize: 10, fontWeight: 800, letterSpacing: '0.12em',
          padding: '4px 12px', borderRadius: 20,
          border: '1px solid rgba(0,188,212,0.25)',
          textTransform: 'uppercase',
        }}>
          {meta.label}
        </div>

        <h2 style={{
          fontFamily: 'Space Grotesk, sans-serif',
          fontSize: 28, fontWeight: 800, color: NAVY,
          margin: '0 0 10px', letterSpacing: '-0.02em',
        }}>
          Para Breve
        </h2>

        <p style={{ fontSize: 14, color: '#888', lineHeight: 1.65, margin: '0 0 28px' }}>
          {meta.desc}
        </p>

        {/* Dots */}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{
              width: 8, height: 8, borderRadius: '50%',
              background: i === 0 ? CYAN : i === 1 ? `rgba(0,188,212,0.45)` : `rgba(0,188,212,0.2)`,
            }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Detail Panel ──────────────────────────────────────────────────────────────

const VARIANTE_TAG: Record<string, [string, string]> = {
  A: ['#ede9fe', '#5b21b6'], B: ['#fef3c7', '#92400e'],
  C: ['#d1fae5', '#065f46'], D: ['#fce7f3', '#9d174d'],
  BOT: ['#e3f2fd', '#1565c0'],
};

function DetailPanel({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const d = lead.leadData;
  const nome = d.nome ?? 'Sem nome';

  function fmt(ts?: string) {
    if (!ts) return '—';
    return new Date(ts).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' });
  }

  const cardS: React.CSSProperties = {
    background: '#fff', borderRadius: 10, border: `1px solid ${BORDER}`,
    padding: '14px 18px', marginBottom: 10,
  };
  const sectionTitle: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.07em', color: '#aaa', marginBottom: 10,
  };

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 20 }}>
        <Avatar name={nome} size={44} bot={lead.variante === 'BOT'} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 5, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
              background: lead.messageType === 'newLead' ? '#e8f5e9' : '#e3f2fd',
              color: lead.messageType === 'newLead' ? '#2e7d32' : '#1565c0',
            }}>
              {lead.messageType === 'newLead' ? 'Lead Confirmada' : 'Simulação'}
            </span>
            {lead.variante && (() => {
              const [bg, fg] = VARIANTE_TAG[lead.variante] ?? ['#f0f0f0', '#555'];
              return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: bg, color: fg }}>{VARIANTE_LABELS[lead.variante] ?? lead.variante}</span>;
            })()}
          </div>
          <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 18, color: NAVY, margin: '0 0 2px' }}>{nome}</h2>
          <p style={{ fontSize: 11, color: '#aaa', margin: 0 }}>{fmt(lead.timeStamp)}</p>
        </div>
        <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${BORDER}`, background: '#fff', cursor: 'pointer', fontSize: 16, color: '#aaa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
      </div>

      {/* Contacto */}
      <div style={cardS}>
        <p style={sectionTitle}>Contacto</p>
        <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px' }}>
          <F label="Telefone" value={d.telefone} cyan />
          <F label="Email" value={d.email} />
          <F label="Fonte" value={d.source} />
          <F label="Convertida" value={d.converted ? 'Sim' : undefined} green={d.converted} />
        </dl>
      </div>

      {/* Serviço */}
      <div style={cardS}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <p style={{ ...sectionTitle, margin: 0 }}>Serviço</p>
          {d.serviceType && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: '#e0f7fa', color: '#006064' }}>
              {d.serviceType === 'arrasto' ? 'Entrega Amanhã' : d.serviceType === 'internacional' ? 'Internacional' : 'Direto'}
            </span>
          )}
        </div>
        <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px' }}>
          <div style={{ gridColumn: '1/-1' }}><F label="Trajecto" value={`${d.origem ?? '—'} → ${d.destino ?? '—'}`} /></div>
          {d.serviceType === 'arrasto' ? (
            <><F label="Peso" value={d.weightKg != null ? `${d.weightKg} kg` : undefined} /><F label="Janela" value={d.partnerWindow ? `Amanhã ${d.partnerWindow}` : undefined} /></>
          ) : (
            <><F label="Viatura" value={d.viatura} /><F label="Urgência" value={d.urgencia} />{d.distance != null && <F label="Distância" value={`${d.distance} km`} />}</>
          )}
        </dl>
      </div>

      {/* Preço */}
      {d.priceCalculated != null && (
        <div style={cardS}>
          <p style={sectionTitle}>Preço</p>
          <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
            <PB label="Base" value={`€${d.priceCalculated.toFixed(2)}`} strike />
            <PB label="Desconto" value={`-€${d.discount?.toFixed(2)}`} color="#e53e3e" />
            <PB label="Final" value={`€${d.priceWithDiscount?.toFixed(2)}`} color="#2e7d32" large />
          </div>
        </div>
      )}
      {d.partnerFinalPrice != null && !d.priceCalculated && (
        <div style={cardS}>
          <p style={sectionTitle}>Preço</p>
          <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
            <PB label="Serviço" value={`Entrega ${d.partnerWindow}`} />
            <PB label="Peso" value={`${d.weightKg} kg`} />
            <PB label="Total" value={`€${d.partnerFinalPrice.toFixed(2)}`} color="#2e7d32" large />
          </div>
        </div>
      )}

      {/* Mensagem sistema */}
      <div style={cardS}>
        <p style={sectionTitle}>Mensagem Sistema</p>
        <div style={{ fontSize: 12, color: '#555' }}>
          {lead.message.split('\n').map((line, i) => (
            <p key={i} style={{ margin: '0 0 5px 0', lineHeight: 1.7 }} dangerouslySetInnerHTML={{ __html: line || '&nbsp;' }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function F({ label, value, cyan, green }: { label: string; value?: string; cyan?: boolean; green?: boolean }) {
  return (
    <div>
      <dt style={{ fontSize: 10, color: '#aaa', marginBottom: 2 }}>{label}</dt>
      <dd style={{ fontSize: 13, fontWeight: 600, margin: 0, color: cyan ? CYAN : green ? '#2e7d32' : NAVY }}>
        {value ?? '—'}
      </dd>
    </div>
  );
}

function PB({ label, value, strike, color, large }: { label: string; value?: string; strike?: boolean; color?: string; large?: boolean }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ fontSize: 10, color: '#aaa', margin: '0 0 2px' }}>{label}</p>
      <p style={{ fontSize: large ? 22 : 14, fontWeight: large ? 800 : 600, color: color ?? NAVY, margin: 0, textDecoration: strike ? 'line-through' : 'none', fontFamily: 'Space Grotesk, sans-serif' }}>
        {value}
      </p>
    </div>
  );
}

// ── Routing Panel ─────────────────────────────────────────────────────────────

function RoutingPanel() {
  const defaults: RoutingConfig = {
    systemActive: true, alwaysBot: false, delayMinutesBeforeBot: 0,
    autoStartHour: 9, autoEndHour: 20, autoWeekends: false,
  };

  const [config, setConfig] = useState<RoutingConfig>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/routing-config')
      .then((r) => r.json())
      .then((d) => { if (d.success) setConfig(d.config); })
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true); setSaved(false);
    await fetch('/api/routing-config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (loading) return <p style={{ fontSize: 13, color: '#aaa' }}>A carregar...</p>;

  function toggle(key: keyof RoutingConfig) { setConfig((c) => ({ ...c, [key]: !c[key] })); }
  function num(key: keyof RoutingConfig, val: string) { setConfig((c) => ({ ...c, [key]: parseInt(val) || 0 })); }

  const cardS: React.CSSProperties = { background: '#fff', borderRadius: 10, border: `1px solid ${BORDER}`, padding: '14px 18px', marginBottom: 10 };

  return (
    <div>
      <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 18, color: NAVY, margin: '0 0 4px' }}>Configuração do Bot</h2>
      <p style={{ fontSize: 13, color: '#aaa', marginBottom: 20 }}>Controle quando o bot responde automaticamente às leads.</p>

      <ToggleRow cardS={cardS} label="Sistema activo" description="Activa ou desactiva todo o bot de atendimento automático" checked={config.systemActive} onChange={() => toggle('systemActive')} />
      <ToggleRow cardS={cardS} label="Sempre bot (ignorar horários)" description="O bot responde 24/7 independentemente do horário configurado" checked={config.alwaysBot} onChange={() => toggle('alwaysBot')} />
      <ToggleRow cardS={cardS} label="Activo aos fins de semana" description="Bot responde automaticamente aos sábados e domingos" checked={config.autoWeekends} onChange={() => toggle('autoWeekends')} />

      <div style={cardS}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: NAVY, margin: '0 0 12px' }}>Horário de operação automática</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[['Hora início', 'autoStartHour'], ['Hora fim', 'autoEndHour']].map(([label, key]) => (
            <div key={key}>
              <label style={{ fontSize: 11, color: '#aaa', display: 'block', marginBottom: 4 }}>{label}</label>
              <input type="number" min={0} max={23} value={(config as any)[key]} onChange={(e) => num(key as any, e.target.value)}
                style={{ width: '100%', padding: '7px 10px', border: `1.5px solid ${BORDER}`, borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
            </div>
          ))}
        </div>
      </div>

      <div style={cardS}>
        <label style={{ fontSize: 13, fontWeight: 600, color: NAVY, display: 'block', marginBottom: 4 }}>Delay antes do bot (minutos)</label>
        <p style={{ fontSize: 11, color: '#aaa', marginBottom: 8 }}>Quantos minutos esperar antes do bot responder (0 = imediato)</p>
        <input type="number" min={0} max={60} value={config.delayMinutesBeforeBot} onChange={(e) => num('delayMinutesBeforeBot', e.target.value)}
          style={{ width: 100, padding: '7px 10px', border: `1.5px solid ${BORDER}`, borderRadius: 8, fontSize: 14, outline: 'none' }} />
      </div>

      <button onClick={save} disabled={saving}
        style={{ width: '100%', padding: '11px 20px', borderRadius: 8, border: 'none', cursor: saving ? 'default' : 'pointer', background: saved ? '#2e7d32' : CYAN, color: '#fff', fontSize: 14, fontWeight: 700, opacity: saving ? 0.7 : 1, transition: 'background 0.2s' }}>
        {saving ? 'A guardar...' : saved ? '✓ Guardado' : 'Guardar configuração'}
      </button>
    </div>
  );
}

function ToggleRow({ cardS, label, description, checked, onChange }: {
  cardS: React.CSSProperties; label: string; description: string; checked: boolean; onChange: () => void;
}) {
  return (
    <div style={{ ...cardS, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
      <div>
        <p style={{ fontSize: 13, fontWeight: 600, color: NAVY, margin: '0 0 2px' }}>{label}</p>
        <p style={{ fontSize: 11, color: '#aaa', margin: 0 }}>{description}</p>
      </div>
      <button onClick={onChange} style={{ position: 'relative', width: 44, height: 24, background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }} role="switch" aria-checked={checked}>
        <span style={{ position: 'absolute', inset: 0, borderRadius: 12, background: checked ? CYAN : '#ddd', transition: 'background 0.2s' }} />
        <span style={{ position: 'absolute', top: 3, borderRadius: '50%', background: '#fff', width: 18, height: 18, left: checked ? 23 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
      </button>
    </div>
  );
}
