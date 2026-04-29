'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useIsMobile } from '@/lib/useIsMobile';
import ParceirosPage from './parceiros/page';
import ConversasPage from './conversas/page';
import ConhecimentoPage from './conhecimento/page';
import PrecosPage from './precos/page';
import RelatoriosPage from './relatorios/page';
import ClientesPage from './clientes/page';
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
  recolherMoradasCompletas: boolean;
  pagamentoAtivo: boolean;
  pagamentoProvider: 'paybylink' | 'mbway' | 'stripe';
  whatsappBotAtivo: boolean;
  whatsappNumero: string;
  evolutionApiUrl: string;
  evolutionApiKey: string;
  evolutionInstance: string;
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
  clientId?: string | null;
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
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<NavTab>('inbox');
  const [badges, setBadges] = useState<{ leads: boolean; conversas: boolean }>({ leads: false, conversas: false });
  const [aggToasts, setAggToasts] = useState<(AggHintAlert & { id: number; expiresAt: number })[]>([]);
  const [aggBlink, setAggBlink] = useState(false);
  const [pendingConvId, setPendingConvId] = useState<string | undefined>(undefined);
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

  function goToConversas(convId: string) {
    setPendingConvId(convId);
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
          {/* Lista — hidden on mobile when a lead is selected */}
          <div style={{
            width: isMobile ? '100%' : 276,
            flexShrink: 0,
            background: '#fff',
            borderRight: isMobile ? 'none' : `1px solid ${BORDER}`,
            display: isMobile && selected ? 'none' : 'flex',
            flexDirection: 'column',
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
                      {lead.clientId && (
                        <span style={{
                          fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 3,
                          background: '#e8f5e9', color: '#2e7d32', letterSpacing: '0.04em',
                          textTransform: 'uppercase', flexShrink: 0,
                        }}>
                          Cliente
                        </span>
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
          {(!isMobile || selected) && (
            <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? 16 : 24, background: YB_BG }}>
              {isMobile && selected && (
                <button
                  onClick={() => setSelected(null)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, background: 'none', border: 'none', cursor: 'pointer', color: NAVY, fontSize: 13, fontWeight: 600, padding: 0 }}
                >
                  ← Voltar
                </button>
              )}
              {!selected ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, color: '#bbb' }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>
                    <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
                  </svg>
                  <p style={{ fontSize: 13 }}>Seleccione uma lead para ver detalhes</p>
                </div>
              ) : (
                <DetailPanel
                  lead={selected}
                  onClose={() => setSelected(null)}
                  onClientConverted={(clientId) => {
                    setLeads(ls => ls.map(l => l.id === selected.id ? { ...l, clientId } : l));
                    setSelected(s => s ? { ...s, clientId } : s);
                  }}
                />
              )}
            </div>
          )}
        </>
      )}

      {/* inbox → Conversas/escalações */}
      {tab === 'inbox' && (
        <div style={{ flex: 1, overflow: 'hidden', height: '100%' }}>
          <ConversasPage isMobile={isMobile} initialConvId={pendingConvId} onGoToAgg={(convId) => { setPendingConvId(convId); switchTab('agregacoes'); }} />
        </div>
      )}

      {/* agregacoes → Histórico de hipóteses de agregação */}
      {tab === 'agregacoes' && (
        <div style={{ flex: 1, overflow: 'auto', height: '100%' }}>
          <AgregacoesPage onGoToConv={(id) => goToConversas(id)} highlightConvId={pendingConvId} />
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
        <div style={{ flex: 1, overflow: 'hidden', height: '100%' }}>
          <ClientesPage />
        </div>
      )}

      {tab === 'routing' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 32 }}>
          <div style={{ maxWidth: 600 }}>
            <RoutingPanel />
          </div>
        </div>
      )}

      {tab === 'config' && (
        <div style={{ flex: 1, overflowY: 'auto', height: '100%' }}>
          <ConfigPage />
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
  onGoToChat: (convId: string) => void;
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
                  onClick={() => onGoToChat(t.convId)}
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

// ── Agregações — histórico de hipóteses por dia ───────────────────────────────

type AggHistoryItem = {
  convId: string;
  refCode: string;
  telemovel: string;
  origem: string;
  destino: string;
  aggHintsAt: string;
  aggHintsSeen: boolean;
  hints: {
    serviceId: string;
    score: number;
    serviceTime: string | null;
    timeDeltaMin: number;
    pickup: string | null;
    delivery: string | null;
    detourPickupKm: number;
    detourDeliveryKm: number;
    isReturnTrip: boolean;
    driver: { name: string; phone: string } | null;
  }[];
};

function AgregacoesPage({ onGoToConv, highlightConvId }: { onGoToConv: (convId: string) => void; highlightConvId?: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [items, setItems] = useState<AggHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const highlightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/agg-history?date=${date}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setItems(d.items); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [date]);

  useEffect(() => {
    if (highlightConvId && highlightRef.current) {
      setTimeout(() => highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
    }
  }, [highlightConvId, items]);

  return (
    <div style={{ padding: '24px 28px', maxWidth: 900 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: NAVY }}>Hipóteses de Agregação</h2>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#888' }}>
            Avisos gerados pelo sistema — por dia
          </p>
        </div>
        <input
          type="date"
          value={date}
          max={today}
          onChange={(e) => setDate(e.target.value)}
          style={{
            marginLeft: 'auto', padding: '6px 10px', borderRadius: 7,
            border: '1.5px solid #e0e0e0', fontSize: 13, color: NAVY,
            fontFamily: 'inherit', cursor: 'pointer',
          }}
        />
      </div>

      {loading && (
        <p style={{ color: '#aaa', fontSize: 13 }}>A carregar...</p>
      )}

      {!loading && items.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '60px 0', color: '#bbb',
        }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>◈</div>
          <p style={{ fontSize: 14 }}>Sem hipóteses de agregação para {date}</p>
        </div>
      )}

      {!loading && items.map((item) => (
        <div
          key={item.convId}
          ref={item.convId === highlightConvId ? highlightRef : undefined}
          style={{
            background: '#fff', borderRadius: 12,
            border: `1.5px solid ${item.convId === highlightConvId ? '#00bcd4' : item.aggHintsSeen ? '#e0e0e0' : '#ffc107'}`,
            marginBottom: 16, overflow: 'hidden',
            boxShadow: item.convId === highlightConvId ? '0 0 0 3px rgba(0,188,212,0.2)' : item.aggHintsSeen ? 'none' : '0 2px 12px rgba(255,193,7,0.15)',
          }}
        >
          {/* Cabeçalho */}
          <div style={{
            padding: '12px 16px',
            background: item.aggHintsSeen ? '#fafafa' : '#fffde7',
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          }}>
            <span style={{
              fontSize: 9, fontWeight: 800, letterSpacing: '0.1em',
              textTransform: 'uppercase', background: '#ffc107',
              color: NAVY, padding: '3px 7px', borderRadius: 4,
            }}>AGREGAÇÃO</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{item.refCode}</span>
            <span style={{ fontSize: 12, color: '#555' }}>
              {item.origem.split(',')[0]} → {item.destino.split(',')[0]}
            </span>
            <span style={{ fontSize: 11, color: '#aaa', marginLeft: 'auto' }}>
              {new Date(item.aggHintsAt).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
            </span>
            <button
              onClick={() => onGoToConv(item.convId)}
              style={{
                padding: '5px 12px', borderRadius: 6,
                background: CYAN, color: '#fff',
                border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Ver conversa
            </button>
          </div>

          {/* Hints */}
          <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {item.hints.map((h, i) => (
              <div key={h.serviceId} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', borderRadius: 8,
                background: i === 0 ? '#f0f9ff' : '#f9f9f9',
                flexWrap: 'wrap',
              }}>
                <span style={{
                  fontSize: 11, fontWeight: 800,
                  color: h.score >= 80 ? '#2e7d32' : h.score >= 60 ? '#e65100' : '#888',
                  minWidth: 50,
                }}>
                  {h.score}%
                </span>
                {h.isReturnTrip && (
                  <span style={{ fontSize: 10, color: '#1565c0', fontWeight: 700 }}>↩ VOLTA</span>
                )}
                <span style={{ fontSize: 11, color: '#444', flex: 1, minWidth: 160 }}>
                  {h.pickup?.split(',')[0] ?? '—'} → {h.delivery?.split(',')[0] ?? '—'}
                </span>
                <span style={{ fontSize: 11, color: '#888' }}>
                  +{h.detourPickupKm}km / +{h.detourDeliveryKm}km
                </span>
                {h.serviceTime && (
                  <span style={{
                    fontSize: 11, fontWeight: 700,
                    color: h.timeDeltaMin < 0 ? '#1565c0'
                      : h.timeDeltaMin <= 90 ? '#2e7d32'
                      : h.timeDeltaMin <= 300 ? '#e65100' : '#888',
                  }}>
                    {h.serviceTime.slice(11, 16)}
                    {h.timeDeltaMin < 0 ? ' (em curso)' : ` (+${h.timeDeltaMin < 60 ? h.timeDeltaMin + 'min' : Math.round(h.timeDeltaMin / 60 * 10) / 10 + 'h'})`}
                  </span>
                )}
                {h.driver && (
                  <span style={{ fontSize: 11, color: NAVY, fontWeight: 600 }}>
                    {h.driver.name}
                    {h.driver.phone && <span style={{ color: CYAN, marginLeft: 5 }}>{h.driver.phone}</span>}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Config / Gestão de utilizadores ──────────────────────────────────────────

const ROLE_LABEL: Record<string, string> = {
  administrator:       'Admin',
  Operator:            'Operador',
  commissionOperator:  'Comissão',
};
const ROLE_COLOR: Record<string, [string, string]> = {
  administrator:      ['#1a2332', '#fff'],
  Operator:           ['#e3f2fd', '#1565c0'],
  commissionOperator: ['#f3e5f5', '#6a1b9a'],
};

type DashUser = {
  _id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  createdAt: string;
};

function ConfigPage() {
  const { data: session } = useSession();
  const selfRole = (session?.user as any)?.role ?? '';
  const selfId   = (session?.user as any)?.id   ?? '';
  const isAdmin  = selfRole === 'administrator';

  const [users, setUsers]         = useState<DashUser[]>([]);
  const [loading, setLoading]     = useState(true);
  const [editId, setEditId]       = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Form criar
  const [newName, setNewName]     = useState('');
  const [newEmail, setNewEmail]   = useState('');
  const [newPass, setNewPass]     = useState('');
  const [newRole, setNewRole]     = useState('Operator');

  // Form editar password própria
  const [myPass, setMyPass]       = useState('');
  const [myPassMsg, setMyPassMsg] = useState('');

  const fetchUsers = useCallback(async () => {
    if (!isAdmin) return;
    const res = await fetch('/api/users');
    const d = await res.json();
    if (d.success) setUsers(d.users);
    setLoading(false);
  }, [isAdmin]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  async function toggleActive(u: DashUser) {
    await fetch(`/api/users/${u._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !u.active }),
    });
    fetchUsers();
  }

  async function changeRole(u: DashUser, role: string) {
    await fetch(`/api/users/${u._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    setEditId(null);
    fetchUsers();
  }

  async function createUser() {
    if (!newEmail || !newPass) return;
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, email: newEmail, password: newPass, role: newRole }),
    });
    const d = await res.json();
    if (d.success) {
      setNewName(''); setNewEmail(''); setNewPass(''); setNewRole('Operator');
      setShowCreate(false);
      fetchUsers();
    }
  }

  async function saveMyPassword() {
    if (myPass.length < 6) { setMyPassMsg('Mínimo 6 caracteres'); return; }
    const res = await fetch(`/api/users/${selfId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: myPass }),
    });
    const d = await res.json();
    setMyPassMsg(d.success ? 'Password alterada.' : (d.error ?? 'Erro'));
    if (d.success) setMyPass('');
  }

  const inputStyle: React.CSSProperties = {
    padding: '7px 10px', borderRadius: 7, border: '1.5px solid #e0e0e0',
    fontSize: 13, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
    color: NAVY, outline: 'none',
  };
  const btnStyle = (bg: string, fg: string): React.CSSProperties => ({
    padding: '7px 14px', borderRadius: 7, border: 'none',
    background: bg, color: fg, fontSize: 12, fontWeight: 700,
    cursor: 'pointer', whiteSpace: 'nowrap',
  });

  return (
    <div style={{ padding: '28px 32px', maxWidth: 780, fontFamily: 'system-ui, sans-serif' }}>

      {/* Perfil próprio */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1.5px solid #e8e8e8', padding: '20px 24px', marginBottom: 28 }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, color: NAVY }}>O meu perfil</h3>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: '#888' }}>
          {session?.user?.email} —{' '}
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
            background: ROLE_COLOR[selfRole]?.[0] ?? '#eee',
            color: ROLE_COLOR[selfRole]?.[1] ?? '#555',
          }}>
            {ROLE_LABEL[selfRole] ?? selfRole}
          </span>
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="password"
            placeholder="Nova password (mín. 6 caracteres)"
            value={myPass}
            onChange={(e) => { setMyPass(e.target.value); setMyPassMsg(''); }}
            style={{ ...inputStyle, maxWidth: 280 }}
          />
          <button onClick={saveMyPassword} style={btnStyle(CYAN, '#fff')}>Alterar password</button>
          <button onClick={() => signOut({ callbackUrl: '/login' })} style={btnStyle('#fee2e2', '#dc2626')}>
            Terminar sessão
          </button>
        </div>
        {myPassMsg && (
          <p style={{ margin: '8px 0 0', fontSize: 12, color: myPassMsg.includes('alterada') ? '#2e7d32' : '#dc2626' }}>
            {myPassMsg}
          </p>
        )}
      </div>

      {/* Gestão de utilizadores — só admin */}
      {isAdmin && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: NAVY }}>Utilizadores</h3>
            <button
              onClick={() => setShowCreate((s) => !s)}
              style={btnStyle(showCreate ? '#f5f5f5' : CYAN, showCreate ? '#555' : '#fff')}
            >
              {showCreate ? 'Cancelar' : '+ Novo utilizador'}
            </button>
          </div>

          {/* Form criar */}
          {showCreate && (
            <div style={{
              background: '#f8fbff', border: '1.5px solid #bde0ff', borderRadius: 10,
              padding: '16px 18px', marginBottom: 16,
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 12px',
            }}>
              <input placeholder="Nome" value={newName} onChange={(e) => setNewName(e.target.value)} style={inputStyle} />
              <input placeholder="Email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} style={inputStyle} />
              <input placeholder="Password (mín. 6)" type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} style={inputStyle} />
              <select value={newRole} onChange={(e) => setNewRole(e.target.value)} style={{ ...inputStyle }}>
                <option value="Operator">Operador</option>
                <option value="commissionOperator">Comissão</option>
                <option value="administrator">Admin</option>
              </select>
              <div style={{ gridColumn: '1/-1', display: 'flex', gap: 8 }}>
                <button onClick={createUser} style={btnStyle('#2e7d32', '#fff')}>Criar utilizador</button>
              </div>
            </div>
          )}

          {/* Lista */}
          {loading ? (
            <p style={{ color: '#aaa', fontSize: 13 }}>A carregar...</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {users.map((u) => (
                <div key={u._id} style={{
                  background: '#fff', border: `1.5px solid ${u.active ? '#e8e8e8' : '#fee2e2'}`,
                  borderRadius: 10, padding: '12px 16px',
                  display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                  opacity: u.active ? 1 : 0.6,
                }}>
                  {/* Initials */}
                  <div style={{
                    width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                    background: u.active ? CYAN : '#ccc',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: 12, fontWeight: 800,
                  }}>
                    {(u.name || u.email).slice(0, 2).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: NAVY }}>
                      {u.name || u.email}
                      {u._id === selfId && <span style={{ fontSize: 10, color: CYAN, marginLeft: 6 }}>(eu)</span>}
                    </p>
                    <p style={{ margin: 0, fontSize: 11, color: '#888' }}>{u.email}</p>
                  </div>

                  {/* Role */}
                  {editId === u._id ? (
                    <select
                      autoFocus
                      defaultValue={u.role}
                      onBlur={(e) => changeRole(u, e.target.value)}
                      onChange={(e) => changeRole(u, e.target.value)}
                      style={{ ...inputStyle, width: 'auto', padding: '4px 8px' }}
                    >
                      <option value="Operator">Operador</option>
                      <option value="commissionOperator">Comissão</option>
                      <option value="administrator">Admin</option>
                    </select>
                  ) : (
                    <span
                      onClick={() => u._id !== selfId && setEditId(u._id)}
                      title={u._id !== selfId ? 'Clique para editar role' : ''}
                      style={{
                        fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 5,
                        background: ROLE_COLOR[u.role]?.[0] ?? '#eee',
                        color: ROLE_COLOR[u.role]?.[1] ?? '#555',
                        cursor: u._id !== selfId ? 'pointer' : 'default',
                      }}
                    >
                      {ROLE_LABEL[u.role] ?? u.role}
                    </span>
                  )}

                  {/* Acções */}
                  {u._id !== selfId && (
                    <button
                      onClick={() => toggleActive(u)}
                      style={btnStyle(u.active ? '#fff8e1' : '#e8f5e9', u.active ? '#e65100' : '#2e7d32')}
                    >
                      {u.active ? 'Desactivar' : 'Activar'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Configuração do Bot — só admin */}
      {isAdmin && (
        <>
          <div style={{ height: 1, background: '#e8e8e8', margin: '28px 0' }} />
          <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 800, color: NAVY }}>Configuração do Bot</h3>
          <RoutingPanel />
        </>
      )}
    </div>
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

function DetailPanel({ lead, onClose, onClientConverted }: {
  lead: Lead;
  onClose: () => void;
  onClientConverted?: (clientId: string) => void;
}) {
  const d = lead.leadData;
  const nome = d.nome ?? 'Sem nome';
  const [clientId, setClientId] = useState<string | null>(lead.clientId ?? null);
  const [converting, setConverting] = useState(false);

  async function convertToClient() {
    setConverting(true);
    try {
      const res  = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id }),
      });
      const data = await res.json();
      if (data.success) {
        setClientId(data.clientId);
        onClientConverted?.(data.clientId);
      }
    } finally {
      setConverting(false);
    }
  }

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

      {/* Converter para Cliente */}
      {lead.messageType === 'newLead' && (
        <div style={{ ...cardS, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <p style={{ ...sectionTitle, margin: 0 }}>CRM</p>
            {clientId
              ? <p style={{ fontSize: 12, color: '#2e7d32', margin: '4px 0 0', fontWeight: 600 }}>✓ Lead convertida para cliente</p>
              : <p style={{ fontSize: 12, color: '#888', margin: '4px 0 0' }}>Guarda este contacto na lista de Clientes</p>
            }
          </div>
          {!clientId ? (
            <button
              onClick={convertToClient}
              disabled={converting}
              style={{
                padding: '7px 16px', borderRadius: 7, border: 'none',
                background: CYAN, color: '#fff', fontSize: 12, fontWeight: 700,
                cursor: converting ? 'wait' : 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >
              {converting ? 'A converter...' : 'Converter para Cliente'}
            </button>
          ) : (
            <span style={{
              fontSize: 11, padding: '5px 12px', borderRadius: 6,
              background: '#e8f5e9', color: '#2e7d32', fontWeight: 700, flexShrink: 0,
            }}>
              Cliente criado ✓
            </span>
          )}
        </div>
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
  nr: string | number | null;
  serviceStatus: string;
  pointsStatuses: Array<{ type: string; status: string }>;
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

const SVC_STATUS: Record<string, [string, string]> = {
  pending:   ['#fff8e1', '#e65100'],
  assigned:  ['#e3f2fd', '#1565c0'],
  accepted:  ['#e8f5e9', '#2e7d32'],
  completed: ['#f5f5f5', '#757575'],
  cancelled: ['#fce4ec', '#c62828'],
};

const PT_STATUS: Record<string, string> = {
  pending:     'Pendente',
  completed:   'Concluído',
  failed:      'Falhou',
  in_progress: 'Em curso',
  accepted:    'Aceite',
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: 9, fontWeight: 800, letterSpacing: '0.1em',
                  textTransform: 'uppercase', color: '#e65100',
                  background: '#fff8e1', border: '1px solid #ffe082',
                  padding: '2px 6px', borderRadius: 4,
                }}>{h.isReturnTrip ? 'VOLTA' : 'HIPÓTESE'}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#e65100' }}>
                  Compatibilidade {h.score}%
                </span>
                {h.nr != null && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#555', background: '#f0f0f0', border: '1px solid #ddd', padding: '1px 6px', borderRadius: 4 }}>
                    #{h.nr}
                  </span>
                )}
                {(() => {
                  const [bg, fg] = SVC_STATUS[h.serviceStatus] ?? ['#f0f0f0', '#555'];
                  return (
                    <span style={{ fontSize: 10, fontWeight: 700, background: bg, color: fg, padding: '1px 6px', borderRadius: 4 }}>
                      {h.serviceStatus}
                    </span>
                  );
                })()}
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
              {h.pointsStatuses.length > 0 && (
                <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {h.pointsStatuses.map((p, i) => (
                    <span key={i} style={{
                      fontSize: 10, padding: '2px 7px', borderRadius: 4,
                      background: p.status === 'completed' ? '#e8f5e9' : p.status === 'failed' ? '#fce4ec' : '#f0f0f0',
                      color:      p.status === 'completed' ? '#2e7d32' : p.status === 'failed' ? '#c62828' : '#666',
                      fontWeight: 600,
                    }}>
                      {p.type === 'collection' ? 'Recolha' : 'Entrega'}: {PT_STATUS[p.status] ?? p.status}
                    </span>
                  ))}
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
    recolherMoradasCompletas: false, pagamentoAtivo: false, pagamentoProvider: 'paybylink',
    whatsappBotAtivo: false, whatsappNumero: '', evolutionApiUrl: '', evolutionApiKey: '', evolutionInstance: 'yourbox',
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
    try {
      const res = await fetch('/api/routing-config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert('Erro ao guardar: ' + (data.error ?? res.status));
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (e: any) {
      alert('Erro de rede: ' + e.message);
    } finally {
      setSaving(false);
    }
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
      <ToggleRow cardS={cardS} label="Recolher moradas completas" description="Após nome e email, bot pede moradas exactas, janelas horárias e contactos de recolha/entrega" checked={config.recolherMoradasCompletas} onChange={() => toggle('recolherMoradasCompletas')} />
      <ToggleRow cardS={cardS} label="Pagamento automático activo" description="Bot solicita pagamento antes de registar a lead — o pedido só fica confirmado após pagamento bem-sucedido" checked={config.pagamentoAtivo} onChange={() => toggle('pagamentoAtivo')} />

      {config.pagamentoAtivo && (
        <div style={{ ...cardS, marginTop: -4 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: NAVY, margin: '0 0 10px' }}>Provider de pagamento</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            {([
              { key: 'paybylink', label: 'Pay By Link', hint: 'Link no chat — cliente escolhe MB Way / Multibanco / Cartão' },
              { key: 'mbway',     label: 'MB Way',      hint: 'Push directo para app MB Way (4 min)' },
              { key: 'stripe',    label: 'Stripe',      hint: 'Stripe MB Way' },
            ] as const).map(({ key: p, label, hint }) => (
              <button key={p} onClick={() => setConfig((c) => ({ ...c, pagamentoProvider: p }))}
                title={hint}
                style={{ flex: 1, padding: '8px 4px', borderRadius: 8, border: `2px solid ${config.pagamentoProvider === p ? CYAN : BORDER}`, background: config.pagamentoProvider === p ? '#e0f7fa' : '#fff', color: config.pagamentoProvider === p ? NAVY : '#888', fontWeight: config.pagamentoProvider === p ? 700 : 400, fontSize: 12, cursor: 'pointer', transition: 'all 0.15s' }}>
                {label}
              </button>
            ))}
          </div>
          <p style={{ fontSize: 11, color: '#aaa', margin: '8px 0 0' }}>
            {config.pagamentoProvider === 'paybylink' && 'Requer PBL_GATEWAY_KEY e PBL_ANTI_PHISHING_KEY no .env'}
            {config.pagamentoProvider === 'mbway'     && 'Requer MBWAY_KEY e MBWAY_ANTI_PHISHING_KEY no .env'}
            {config.pagamentoProvider === 'stripe'    && 'Requer STRIPE_SECRET_KEY e STRIPE_WEBHOOK_SECRET no .env'}
          </p>
        </div>
      )}

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

      {/* ── WhatsApp / Evolution API ── */}
      <div style={{ ...cardS, borderTop: `3px solid #25d366`, marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: NAVY, margin: 0 }}>WhatsApp Bot (Evolution API)</h3>
            <p style={{ fontSize: 11, color: '#aaa', margin: '3px 0 0' }}>Liga o bot automático ao WhatsApp via Evolution API</p>
          </div>
          <ToggleSwitch checked={config.whatsappBotAtivo} onChange={() => toggle('whatsappBotAtivo')} />
        </div>

        {config.whatsappBotAtivo && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <WaField label="Número WhatsApp do bot" hint="Só dígitos com indicativo, sem + (ex: 351964078194)"
              value={config.whatsappNumero}
              onChange={(v) => setConfig((c) => ({ ...c, whatsappNumero: v }))} />
            <WaField label="URL da Evolution API" hint="Ex: http://evolution-api:8080 ou https://api.seudominio.pt"
              value={config.evolutionApiUrl}
              onChange={(v) => setConfig((c) => ({ ...c, evolutionApiUrl: v }))} />
            <WaField label="API Key" hint="Chave definida na variável AUTHENTICATION_API_KEY do Evolution"
              value={config.evolutionApiKey} password
              onChange={(v) => setConfig((c) => ({ ...c, evolutionApiKey: v }))} />
            <WaField label="Nome da instância" hint="Nome configurado no Evolution (ex: yourbox)"
              value={config.evolutionInstance}
              onChange={(v) => setConfig((c) => ({ ...c, evolutionInstance: v }))} />
          </div>
        )}
      </div>

      <button onClick={save} disabled={saving}
        style={{ width: '100%', padding: '11px 20px', borderRadius: 8, border: 'none', cursor: saving ? 'default' : 'pointer', background: saved ? '#2e7d32' : CYAN, color: '#fff', fontSize: 14, fontWeight: 700, opacity: saving ? 0.7 : 1, transition: 'background 0.2s' }}>
        {saving ? 'A guardar...' : saved ? '✓ Guardado' : 'Guardar configuração'}
      </button>
    </div>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button onClick={onChange} style={{
      width: 42, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
      background: checked ? '#25d366' : '#ddd', position: 'relative', transition: 'background 0.2s', flexShrink: 0,
    }}>
      <span style={{
        position: 'absolute', top: 3, left: checked ? 20 : 3,
        width: 18, height: 18, borderRadius: '50%', background: '#fff',
        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </button>
  );
}

function WaField({ label, hint, value, onChange, password }: {
  label: string; hint: string; value: string; onChange: (v: string) => void; password?: boolean;
}) {
  return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 3 }}>{label}</label>
      <input
        type={password ? 'password' : 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={hint}
        style={{ width: '100%', padding: '7px 10px', border: '1.5px solid #e0e0e0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: password ? 'monospace' : 'inherit' }}
      />
      <p style={{ fontSize: 10, color: '#aaa', margin: '3px 0 0' }}>{hint}</p>
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
