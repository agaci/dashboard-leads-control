'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import ParceirosPage from './parceiros/page';
import ConversasPage from './conversas/page';
import ConhecimentoPage from './conhecimento/page';
import PrecosPage from './precos/page';
import RelatoriosPage from './relatorios/page';
import { useNotifications, type AggHintAlert } from '@/lib/useNotifications';
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
  const [aggToasts, setAggToasts] = useState<(AggHintAlert & { id: number; expiresAt: number })[]>([]);
  const [aggBlink, setAggBlink] = useState(false);
  const toastCounter = useRef(0);

  useNotifications((alert) => {
    if (alert.type === 'escalation') setBadges((b) => ({ ...b, conversas: true }));
    if (alert.type === 'lead')       setBadges((b) => ({ ...b, leads: true }));
    if (alert.type === 'aggHint') {
      const id = ++toastCounter.current;
      setAggToasts((ts) => [...ts, { ...alert, id, expiresAt: Date.now() + 30000 }]);
      setAggBlink(true);
    }
  });

  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'leads' | 'sims' | 'urgente'>('all');
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

  function dismissAggToast(id: number) {
    setAggToasts((ts) => {
      const toast = ts.find((t) => t.id === id);
      if (toast?.convId) {
        fetch(`/api/conversations/${toast.convId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ aggHintsSeen: true }),
        }).catch(() => {});
      }
      const remaining = ts.filter((t) => t.id !== id);
      if (remaining.length === 0) setAggBlink(false);
      return remaining;
    });
  }

  function goToConversas() {
    switchTab('inbox');
    setAggBlink(false);
    setAggToasts([]);
  }

  return (
    <AppShell
      activeTab={tab}
      onTabChange={switchTab}
      leadsCount={total}
      alertsCount={badges.conversas ? 1 : 0}
      inboxBadge={badges.leads ? 1 : 0}
      aggBlink={aggBlink}
    >
      {/* Toasts de hipótese de agregação */}
      <AggToastStack toasts={aggToasts} onDismiss={dismissAggToast} onGoToChat={goToConversas} />
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
                      onClick={() => setFilter(f as any)}
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

      {tab === 'precos' && (
        <div style={{ flex: 1, overflow: 'hidden', height: '100%' }}>
          <PrecosPage />
        </div>
      )}

      {tab === 'relatorios' && (
        <div style={{ flex: 1, overflow: 'hidden', height: '100%' }}>
          <RelatoriosPage />
        </div>
      )}

      {tab === 'clientes' && (
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

// ── Agg Toast Stack ───────────────────────────────────────────────────────────

function AggToastStack({
  toasts,
  onDismiss,
  onGoToChat,
}: {
  toasts: (AggHintAlert & { id: number; expiresAt: number })[];
  onDismiss: (id: number) => void;
  onGoToChat: () => void;
}) {
  // Auto-expirar
  useEffect(() => {
    if (toasts.length === 0) return;
    const id = setInterval(() => {
      const now = Date.now();
      toasts.filter((t) => t.expiresAt <= now).forEach((t) => onDismiss(t.id));
    }, 1000);
    return () => clearInterval(id);
  }, [toasts, onDismiss]);

  if (toasts.length === 0) return null;

  return (
    <>
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(110%); opacity: 0; }
          to   { transform: translateX(0);   opacity: 1; }
        }
        @keyframes toastPulse {
          0%, 100% { box-shadow: 0 4px 24px rgba(255,193,7,0.25); }
          50%       { box-shadow: 0 4px 32px rgba(255,193,7,0.55); }
        }
      `}</style>
      <div style={{
        position: 'fixed', right: 16, bottom: 16,
        display: 'flex', flexDirection: 'column-reverse', gap: 10,
        zIndex: 9999, pointerEvents: 'none',
      }}>
        {toasts.map((t, i) => {
          const timeLeft = Math.max(0, t.expiresAt - Date.now());
          const progress = (timeLeft / 30000) * 100;

          return (
            <div
              key={t.id}
              style={{
                width: 360, background: '#1a2332',
                border: '1.5px solid #ffc107',
                borderRadius: 12, overflow: 'hidden',
                animation: 'slideInRight 0.35s cubic-bezier(0.34,1.56,0.64,1), toastPulse 2s ease-in-out infinite',
                pointerEvents: 'all',
                opacity: 1 - i * 0.08,
              }}
            >
              {/* Barra de progresso */}
              <div style={{ height: 3, background: '#2d3748', position: 'relative' }}>
                <div style={{
                  position: 'absolute', top: 0, left: 0, height: '100%',
                  width: `${progress}%`, background: '#ffc107',
                  transition: 'width 1s linear',
                }} />
              </div>

              <div style={{ padding: '12px 14px' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{
                    fontSize: 9, fontWeight: 800, letterSpacing: '0.12em',
                    textTransform: 'uppercase', color: '#1a2332',
                    background: '#ffc107', padding: '3px 7px', borderRadius: 4,
                    flexShrink: 0,
                  }}>AGREGAÇÃO</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#ffc107' }}>
                    {t.hintCount} hipótese{t.hintCount > 1 ? 's' : ''} · {t.topScore}% compat.
                  </span>
                  {(t as any).isReturnTrip && (
                    <span style={{ fontSize: 10, color: '#94a3b8', whiteSpace: 'nowrap' }}>↩ volta</span>
                  )}
                  <button
                    onClick={() => onDismiss(t.id)}
                    style={{
                      marginLeft: 'auto', background: 'none', border: 'none',
                      color: 'rgba(255,255,255,0.4)', fontSize: 16, cursor: 'pointer',
                      padding: '0 2px', lineHeight: 1, flexShrink: 0,
                    }}
                  >×</button>
                </div>

                {/* Referência + rota */}
                <div style={{ marginBottom: 8 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: '#fff',
                    background: 'rgba(255,193,7,0.15)', border: '1px solid rgba(255,193,7,0.4)',
                    padding: '2px 8px', borderRadius: 6, marginRight: 8,
                  }}>{t.refCode}</span>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>
                    {t.origem.split(',')[0]} → {t.destino.split(',')[0]}
                  </span>
                </div>

                {/* Driver */}
                {t.topDriver ? (
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', margin: '0 0 10px' }}>
                    Motorista disponível: <b style={{ color: '#fff' }}>{t.topDriver.name}</b>
                    {t.topDriver.phone && (
                      <span style={{ color: '#ffc107', marginLeft: 6 }}>{t.topDriver.phone}</span>
                    )}
                  </p>
                ) : (
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontStyle: 'italic', margin: '0 0 10px' }}>
                    Motorista ainda não atribuído
                  </p>
                )}

                {/* Acção */}
                <button
                  onClick={onGoToChat}
                  style={{
                    width: '100%', padding: '7px 0',
                    background: '#ffc107', color: '#1a2332',
                    border: 'none', borderRadius: 7,
                    fontSize: 12, fontWeight: 800, cursor: 'pointer',
                    letterSpacing: '0.03em',
                  }}
                >
                  Ir ao chat {t.refCode}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
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

      {/* Hipóteses de agregação */}
      {lead.messageType === 'newLead' && d.origem && d.destino && (
        <AggregationHints origem={d.origem} destino={d.destino} />
      )}

      {/* Mensagem sistema */}
      <div style={cardS}>
        <p style={sectionTitle}>Mensagem Sistema</p>
        <div
          className="sys-msg"
          style={{ fontSize: 12, color: '#555' }}
          dangerouslySetInnerHTML={{ __html: lead.message.replace(/line-height\s*:\s*[\d.]+\s*;?/gi, 'line-height:1.8;').replace(/<p/gi, '<p style="margin:0 0 7px 0"') }}
        />
      </div>
    </div>
  );
}

// ── Aggregation Hints ─────────────────────────────────────────────────────────

type AggHint = {
  serviceId: string;
  score: number;
  serviceTime: string | null;
  pickup: string | null;
  delivery: string | null;
  detourPickupKm: number;
  detourDeliveryKm: number;
  bearingDiff: number;
  isReturnTrip: boolean;
  timeDeltaMin: number;
  driver: { name: string; phone: string } | null;
  driverLocationStale: boolean;
};

function AggregationHints({ origem, destino }: { origem: string; destino: string }) {
  const [hints, setHints] = useState<AggHint[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  async function load() {
    if (hints !== null) { setOpen((o) => !o); return; }
    setLoading(true); setOpen(true);
    try {
      const res = await fetch(`/api/aggregation-hints?origem=${encodeURIComponent(origem)}&destino=${encodeURIComponent(destino)}`);
      const data = await res.json();
      setHints(data.success ? data.hints : []);
    } catch {
      setHints([]);
    } finally {
      setLoading(false);
    }
  }

  const sectionTitle: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.07em', color: '#aaa', marginBottom: 10,
  };

  const cardS: React.CSSProperties = {
    background: '#fff', borderRadius: 10, border: `1px solid ${BORDER}`,
    padding: '14px 18px', marginBottom: 10,
  };

  const hasHints = hints !== null && hints.length > 0;

  return (
    <div style={cardS}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: open ? 12 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <p style={{ ...sectionTitle, margin: 0 }}>Hipóteses de Agregação</p>
          {hints !== null && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
              background: hasHints ? '#fff8e1' : '#f5f5f5',
              color: hasHints ? '#e65100' : '#aaa',
              border: `1px solid ${hasHints ? '#ffe082' : '#e0e0e0'}`,
            }}>
              {hasHints ? `${hints.length} encontrada${hints.length > 1 ? 's' : ''}` : 'nenhuma'}
            </span>
          )}
        </div>
        <button
          onClick={load}
          style={{
            fontSize: 11, color: CYAN, border: `1px solid ${CYAN}`,
            borderRadius: 6, padding: '3px 10px', background: '#fff', cursor: 'pointer',
          }}
        >
          {loading ? 'A analisar...' : hints === null ? 'Analisar' : open ? 'Fechar' : 'Ver'}
        </button>
      </div>

      {open && (
        <>
          {loading && <p style={{ fontSize: 12, color: '#aaa' }}>A procurar serviços em rota compatível...</p>}
          {!loading && hints?.length === 0 && (
            <p style={{ fontSize: 12, color: '#aaa' }}>Sem serviços activos com rota compatível nas próximas 4 horas.</p>
          )}
          {!loading && hints && hints.length > 0 && hints.map((h) => (
            <div key={h.serviceId} style={{
              background: '#fffbeb', border: '1px solid #ffe082',
              borderRadius: 8, padding: '10px 14px', marginBottom: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{
                  fontSize: 9, fontWeight: 800, letterSpacing: '0.1em',
                  textTransform: 'uppercase', color: '#e65100',
                  background: '#fff8e1', border: '1px solid #ffe082',
                  padding: '2px 6px', borderRadius: 4,
                }}>{h.isReturnTrip ? 'VOLTA' : 'HIPÓTESE'}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#e65100' }}>
                  Compatibilidade {h.score}%
                </span>
                {h.serviceTime && (
                  <span style={{
                    fontSize: 11,
                    marginLeft: 'auto',
                    fontWeight: 700,
                    color: h.timeDeltaMin < 0
                      ? '#1565c0'                          // azul = em curso
                      : h.timeDeltaMin <= 90
                        ? '#2e7d32'                        // verde = dentro de 1h30
                        : h.timeDeltaMin <= 300
                          ? '#e65100'                      // laranja = 1h30 a 5h
                          : '#888',                        // cinzento = mais de 5h
                  }}>
                    {h.serviceTime.slice(11, 16)}
                    <span style={{ fontWeight: 400, marginLeft: 3 }}>
                      {h.timeDeltaMin < 0
                        ? '(em curso)'
                        : h.timeDeltaMin < 60
                          ? `(+${h.timeDeltaMin}min)`
                          : `(+${Math.round(h.timeDeltaMin / 60 * 10) / 10}h)`}
                    </span>
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: '#555', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 16px' }}>
                {h.pickup && <span>Recolha: <b>{h.pickup.split(',')[0]}</b></span>}
                {h.delivery && <span>Entrega: <b>{h.delivery.split(',')[0]}</b></span>}
                <span>Desvio recolha: <b>{h.detourPickupKm} km</b></span>
                <span>Desvio entrega: <b>{h.detourDeliveryKm} km</b></span>
              </div>
              {h.driver ? (
                <div style={{ marginTop: 6, fontSize: 11, color: '#555' }}>
                  Motorista: <b style={{ color: NAVY }}>{h.driver.name}</b>
                  {h.driver.phone && <span style={{ color: CYAN, marginLeft: 8 }}>{h.driver.phone}</span>}
                </div>
              ) : (
                <div style={{ marginTop: 6, fontSize: 11, color: '#aaa', fontStyle: 'italic' }}>
                  Motorista ainda não atribuído
                </div>
              )}
            </div>
          ))}
        </>
      )}
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
