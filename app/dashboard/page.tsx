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
import WidgetsPage from './widgets/page';
import { useNotifications, type AggHintAlert } from '@/lib/useNotifications';
import { useTheme } from '@/lib/useTheme';
import AppShell from '@/components/layout/AppShell';
import type { NavTab } from '@/components/layout/NavSidebar';
import { PriceBreakdownModal } from '@/components/PriceBreakdownModal';

// ── Design tokens ─────────────────────────────────────────────────────────────
const CYAN   = 'var(--yb-cyan)';
const NAVY   = 'var(--yb-fg)';
const YELLOW = '#ffc107';
const YB_BG  = 'var(--yb-bg)';
const BORDER = 'var(--yb-border)';

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
  aggEscalationThreshold: number;
  depotDistanceMultiplier: number;
  urgencyPhone: string;
  assistantName: string;
  voiceAssistantName: string;
  voiceAssistantGender: 'female' | 'male';
  notificationTargets: NotificationTarget[];
  quizNudge?: {
    active: boolean;
    delayMinutes: number;
    channel: 'whatsapp_email' | 'whatsapp' | 'email';
    messageTemplate: string;
    startHour: number;
    endHour: number;
    weekendsOff: boolean;
  };
};

const DEFAULT_QUIZ_NUDGE = {
  active: false,
  delayMinutes: 5,
  channel: 'whatsapp_email' as 'whatsapp_email' | 'whatsapp' | 'email',
  messageTemplate: 'Olá {nome}, aqui é a YourBox. Vi que começou a pedir um orçamento ({rota}) mas não chegou a concluir. Quer que tratemos disso por si? Responda aqui ou ligue 214 304 546 — é rápido.',
  startHour: 9,
  endHour: 20,
  weekendsOff: true,
};

type NotificationTarget = {
  name: string;
  phone: string;
  email: string;
  events: ('conversation' | 'escalation' | 'lead')[];
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
  geo?: { source?: string; city?: string; region?: string; country?: string; lat?: number; lng?: number; address?: string };
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
    if (alert.type === 'live_chat')  setBadges((b) => ({ ...b, conversas: true }));
    if (alert.type === 'new_conv')   setBadges((b) => ({ ...b, conversas: true }));
    if (alert.type === 'lead') {
      setBadges((b) => ({ ...b, leads: true }));
      fetchLeads();
    }
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
  const [dateFilter, setDateFilter] = useState<'all' | 'hoje' | 'ontem' | 'semana' | 'custom'>('hoje');
  const [customDate, setCustomDate] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Lead | null>(null);
  const [page, setPage] = useState(0);
  const [leadCounts, setLeadCounts] = useState<{ all: number; leads: number; sims: number; urgente: number }>({ all: 0, leads: 0, sims: 0, urgente: 0 });
  const LIMIT = 20;
  const autoSelectedLeadRef = useRef(false);
  const [showDatePopover, setShowDatePopover] = useState(false);
  const datePopoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sp     = new URLSearchParams(window.location.search);
    const convId = sp.get('conv');
    const leadId = sp.get('lead');
    if (convId) {
      setPendingConvId(convId);
      setTab('inbox');
      window.history.replaceState(null, '', '/dashboard');
    } else if (leadId) {
      setTab('leads');
      setDateFilter('all');
      fetch(`/api/leads/${leadId}`)
        .then(r => r.json())
        .then(data => { if (data.lead) setSelected(data.lead); })
        .catch(() => {});
      window.history.replaceState(null, '', '/dashboard');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function buildDateParams(df: 'all' | 'hoje' | 'ontem' | 'semana' | 'custom'): string {
    if (df === 'all') return '';
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const dayStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    if (df === 'hoje') {
      const s = dayStr(now);
      return `&dateFrom=${s}T00:00:00.000Z&dateTo=${s}T23:59:59.999Z`;
    }
    if (df === 'ontem') {
      const y = new Date(now); y.setDate(now.getDate() - 1);
      const s = dayStr(y);
      return `&dateFrom=${s}T00:00:00.000Z&dateTo=${s}T23:59:59.999Z`;
    }
    if (df === 'custom' && customDate) {
      return `&dateFrom=${customDate}T00:00:00.000Z&dateTo=${customDate}T23:59:59.999Z`;
    }
    // semana — desde segunda-feira desta semana
    const day = now.getDay();
    const diff = (day === 0 ? -6 : 1 - day);
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);
    return `&dateFrom=${dayStr(monday)}T00:00:00.000Z`;
  }

  const fetchLeadCounts = useCallback(async () => {
    const dp = buildDateParams(dateFilter);
    const qs = dp ? `?${dp.slice(1)}` : '';
    const res = await fetch(`/api/leads/counts${qs}`);
    const data = await res.json();
    if (data.success) setLeadCounts(data.counts);
  }, [dateFilter, customDate]);

  const fetchLeads = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const dateParams = buildDateParams(dateFilter);
      const res = await fetch(`/api/leads?type=${filter}&limit=${LIMIT}&skip=${page * LIMIT}${dateParams}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? 'Erro desconhecido');
      setLeads(data.leads);
      setTotal(data.total);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filter, dateFilter, page, customDate]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);
  useEffect(() => { fetchLeadCounts(); }, [fetchLeadCounts]);
  useEffect(() => { setPage(0); }, [filter, dateFilter]);

  useEffect(() => {
    if (!showDatePopover) return;
    function handleOutside(e: MouseEvent) {
      if (datePopoverRef.current && !datePopoverRef.current.contains(e.target as Node)) {
        setShowDatePopover(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showDatePopover]);

  // Auto-seleccionar a lead mais recente na primeira carga
  useEffect(() => {
    if (autoSelectedLeadRef.current) return;
    if (leads.length === 0) return;
    autoSelectedLeadRef.current = true;
    setSelected(leads[0]);
  }, [leads]);

  const totalPages = Math.ceil(total / LIMIT);

  function switchTab(t: NavTab) {
    setTab(t);
    if (t === 'inbox') setBadges((b) => ({ ...b, conversas: false }));
    else if (t === 'leads') setBadges((b) => ({ ...b, leads: false }));
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
      inboxBadge={badges.conversas ? 1 : 0}
      leadsBadge={badges.leads ? 1 : 0}
      aggBlink={aggBlink}
    >
      {/* Toasts de hipótese de agregação */}
      <AggToastStack toasts={aggToasts} onDismiss={dismissAggToast} onGoToChat={goToConversas} />
      {/* ── Leads ── */}
      {tab === 'leads' && (
        <>
          {/* Lista — hidden on mobile when a lead is selected */}
          <div
            style={{
              width: isMobile ? '100%' : 340,
              flexShrink: 0,
              display: isMobile && selected ? 'none' : 'flex',
              flexDirection: 'column',
              borderRight: '1px solid rgba(255,255,255,0.06)',
              background: 'var(--yb-card)',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 10px' }}>
              <h1 style={{ fontSize: 16, fontWeight: 600, color: 'var(--yb-fg)', margin: 0, letterSpacing: '-0.01em' }}>Leads</h1>
              <button
                onClick={fetchLeads}
                title="Actualizar"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--yb-subtle)', padding: 4, borderRadius: 6, display: 'flex' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#8B9EC9'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#4a6080'; }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                </svg>
              </button>
            </div>

            {/* Search */}
            <div style={{ padding: '0 12px 10px' }}>
              <div style={{ position: 'relative' }}>
                <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--yb-subtle)' }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
                <input
                  type="text"
                  placeholder="Nome, telefone, rota..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    width: '100%', height: 36, borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(255,255,255,0.04)',
                    paddingLeft: 30, paddingRight: 10,
                    fontSize: 12, color: 'var(--yb-fg)', outline: 'none',
                    boxSizing: 'border-box',
                  }}
                  onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = 'rgba(0,188,212,0.4)'; }}
                  onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = 'var(--yb-border)'; }}
                />
              </div>
            </div>

            {/* Filters — tipo */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '0 12px 8px' }}>
              {(['all', 'leads', 'sims', 'urgente'] as const).map((f) => {
                const label = f === 'all' ? 'Todas' : f === 'leads' ? 'AUTO' : f === 'sims' ? 'MANUAL' : 'Urgente';
                const active = filter === f;
                const count = leadCounts[f];
                return (
                  <button
                    key={f}
                    onClick={() => setFilter(f as any)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                      fontSize: 11, fontWeight: 600,
                      background: active ? 'rgba(0,188,212,0.14)' : 'rgba(255,255,255,0.04)',
                      color: active ? '#00bcd4' : '#8B9EC9',
                      boxShadow: active ? 'inset 0 0 0 1px rgba(0,188,212,0.3)' : 'inset 0 0 0 1px rgba(255,255,255,0.07)',
                      transition: 'all 0.15s',
                    }}
                  >
                    {label}
                    {count > 0 && (
                      <span style={{
                        fontSize: 9, fontWeight: 700,
                        minWidth: 16, height: 16, borderRadius: 8,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px',
                        background: f === 'urgente' ? 'rgba(239,68,68,0.2)' : active ? 'rgba(0,188,212,0.2)' : 'var(--yb-border)',
                        color: f === 'urgente' ? '#f87171' : active ? '#00bcd4' : '#8B9EC9',
                      }}>
                        {count > 99 ? '99+' : count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Filters — data */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '0 12px 12px' }}>
              {(['all', 'hoje', 'ontem', 'semana'] as const).map((df) => {
                const label = df === 'all' ? 'Sempre' : df === 'hoje' ? 'Hoje' : df === 'ontem' ? 'Ontem' : 'Semana';
                const active = dateFilter === df;
                return (
                  <button
                    key={df}
                    onClick={() => setDateFilter(df)}
                    style={{
                      padding: '3px 9px', borderRadius: 6, border: 'none', cursor: 'pointer',
                      fontSize: 11, fontWeight: 600,
                      background: active ? 'rgba(0,188,212,0.14)' : 'rgba(255,255,255,0.04)',
                      color: active ? '#00bcd4' : '#4a6080',
                      boxShadow: active ? 'inset 0 0 0 1px rgba(0,188,212,0.3)' : 'inset 0 0 0 1px rgba(255,255,255,0.06)',
                    }}
                  >
                    {label}
                  </button>
                );
              })}
              {/* Date picker */}
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowDatePopover((v) => !v)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '3px 9px', borderRadius: 6, border: 'none', cursor: 'pointer',
                    fontSize: 11, fontWeight: 600,
                    background: dateFilter === 'custom' ? 'rgba(0,188,212,0.14)' : 'rgba(255,255,255,0.04)',
                    color: dateFilter === 'custom' ? '#00bcd4' : '#4a6080',
                    boxShadow: dateFilter === 'custom' ? 'inset 0 0 0 1px rgba(0,188,212,0.3)' : 'inset 0 0 0 1px rgba(255,255,255,0.06)',
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                  {dateFilter === 'custom' && customDate ? customDate.slice(5).replace('-', '/') : 'Data'}
                </button>
                {showDatePopover && (
                  <div
                    ref={datePopoverRef}
                    style={{
                      position: 'absolute', left: 0, top: 'calc(100% + 6px)', zIndex: 50,
                      width: 220, borderRadius: 10,
                      border: '1px solid rgba(255,255,255,0.1)',
                      background: 'var(--yb-card-2)',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                      padding: 14,
                    }}
                  >
                    <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--yb-subtle)' }}>Escolher data</p>
                    <input
                      type="date"
                      value={customDate}
                      max={new Date().toISOString().slice(0, 10)}
                      autoFocus
                      onChange={(e) => {
                        setCustomDate(e.target.value);
                        setDateFilter('custom');
                        setShowDatePopover(false);
                      }}
                      style={{
                        width: '100%', borderRadius: 7,
                        border: '1px solid rgba(255,255,255,0.12)',
                        background: 'var(--yb-input)',
                        padding: '6px 10px', fontSize: 12,
                        color: 'var(--yb-fg)', outline: 'none',
                        boxSizing: 'border-box',
                        colorScheme: 'inherit' as const,
                      }}
                    />
                    {customDate && (
                      <p style={{ marginTop: 8, textAlign: 'center', fontSize: 11, color: 'var(--yb-muted)' }}>
                        {new Date(customDate + 'T12:00:00').toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' })}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Lead items */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 12px' }}>
              {loading && (
                <div style={{ padding: '32px 0', textAlign: 'center', fontSize: 12, color: 'var(--yb-subtle)' }}>
                  A carregar...
                </div>
              )}
              {error && (
                <div style={{ padding: 10, fontSize: 12, color: '#f87171' }}>{error}</div>
              )}
              {!loading && leads.length === 0 && (
                <div style={{ padding: '40px 0', textAlign: 'center', fontSize: 12, color: 'var(--yb-subtle)' }}>Sem resultados</div>
              )}
              {(() => {
                const q = search.trim().toLowerCase();
                const visibleLeads = q
                  ? leads.filter((l) => {
                      const nome = (l.leadData.nome ?? '').toLowerCase();
                      const tel  = (l.leadData.telefone ?? '').toLowerCase();
                      const orig = (l.leadData.origem ?? '').toLowerCase();
                      const dest = (l.leadData.destino ?? '').toLowerCase();
                      return nome.includes(q) || tel.includes(q) || orig.includes(q) || dest.includes(q);
                    })
                  : leads;
                if (!loading && q && visibleLeads.length === 0)
                  return (
                    <div style={{ padding: '40px 0', textAlign: 'center', fontSize: 12, color: 'var(--yb-subtle)' }}>
                      Sem resultados para &ldquo;{search}&rdquo;
                    </div>
                  );
                return visibleLeads.map((lead) => {
                  const isSelected = selected?.id === lead.id;
                  const isBot = lead.variante === 'BOT';
                  const nome = lead.leadData.nome ?? lead.leadData.telefone ?? 'Sem nome';
                  const rota = lead.leadData.origem
                    ? `${lead.leadData.origem.split(',')[0]} → ${(lead.leadData.destino ?? '?').split(',')[0]}`
                    : lead.senderName;
                  const price = lead.leadData.serviceType === 'arrasto'
                    ? lead.leadData.partnerFinalPrice
                    : lead.leadData.priceWithDiscount;
                  const unread = !lead.closed && lead.messageType === 'newLead';
                  const urgencia = lead.leadData.urgencia;

                  return (
                    <button
                      key={lead.id}
                      onClick={() => setSelected(lead)}
                      style={{
                        width: '100%', textAlign: 'left', cursor: 'pointer',
                        borderRadius: 8, border: 'none',
                        borderLeft: isSelected ? '2px solid #00bcd4' : '2px solid transparent',
                        background: isSelected ? 'rgba(0,188,212,0.07)' : 'transparent',
                        padding: '10px 12px',
                        marginBottom: 2,
                        transition: 'background 0.15s, border-color 0.15s',
                        display: 'block',
                        position: 'relative',
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.03)';
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                      }}
                    >
                      {/* Row 1: routing + timestamp */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{
                            fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3,
                            textTransform: 'uppercase', letterSpacing: '0.06em',
                            background: isBot ? 'rgba(0,188,212,0.12)' : 'rgba(255,193,7,0.12)',
                            color: isBot ? '#00bcd4' : '#ffc107',
                            border: `1px solid ${isBot ? 'rgba(0,188,212,0.25)' : 'rgba(255,193,7,0.25)'}`,
                          }}>
                            {isBot ? 'AUTO' : 'MANUAL'}
                          </span>
                          {urgencia === '1 Hora' && (
                            <span style={{ fontSize: 9, fontWeight: 700, color: '#f87171', letterSpacing: '0.04em' }}>URGENTE</span>
                          )}
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--yb-subtle)' }}>{relTime(lead.timeStamp)}</span>
                      </div>

                      {/* Row 2: nome */}
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--yb-fg)', marginBottom: 3, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                        {nome}
                      </div>

                      {/* Row 3: rota */}
                      <div style={{ fontSize: 11, color: 'var(--yb-muted)', marginBottom: 8, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                        {rota}{lead.leadData.weightKg ? ` · ${lead.leadData.weightKg} kg` : ''}
                      </div>

                      {/* Row 4: preço + urgência + badges */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {price != null ? (
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#00bcd4' }}>
                            {price.toFixed(2)}€
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, color: 'var(--yb-subtle)' }}>—</span>
                        )}
                        {urgencia && urgencia !== '1 Hora' && (
                          <span style={{
                            fontSize: 10, fontWeight: 600, padding: '1px 5px', borderRadius: 3,
                            background: urgencia === '4 Horas' ? 'rgba(245,158,11,0.12)' : 'rgba(139,158,201,0.1)',
                            color: urgencia === '4 Horas' ? '#fbbf24' : '#8B9EC9',
                          }}>
                            {urgencia}
                          </span>
                        )}
                        {lead.leadData.source && lead.leadData.source !== 'bot' && (
                          <span style={{
                            fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 3,
                            background: 'rgba(139,92,246,0.12)', color: '#a78bfa',
                            maxWidth: 80, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                          }} title={lead.leadData.source}>
                            {lead.leadData.source}
                          </span>
                        )}
                        {lead.clientId && (
                          <span style={{
                            fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, textTransform: 'uppercase',
                            background: 'rgba(16,185,129,0.12)', color: '#10b981',
                          }}>
                            Cliente
                          </span>
                        )}
                        {unread && (
                          <span style={{
                            marginLeft: 'auto', width: 7, height: 7, borderRadius: '50%',
                            background: '#ffc107', flexShrink: 0, display: 'inline-block',
                          }} />
                        )}
                      </div>
                    </button>
                  );
                });
              })()}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 16px',
                borderTop: '1px solid rgba(255,255,255,0.06)',
              }}>
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  style={{ fontSize: 11, color: 'var(--yb-muted)', background: 'none', border: 'none', cursor: 'pointer', opacity: page === 0 ? 0.3 : 1 }}
                >← Anterior</button>
                <span style={{ fontSize: 11, color: 'var(--yb-subtle)' }}>{page + 1}/{totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  style={{ fontSize: 11, color: 'var(--yb-muted)', background: 'none', border: 'none', cursor: 'pointer', opacity: page >= totalPages - 1 ? 0.3 : 1 }}
                >Próximo →</button>
              </div>
            )}
          </div>

          {/* Detail */}
          {(!isMobile || selected) && (
            <div style={{ flex: 1, overflowY: 'auto', background: 'var(--yb-bg)', padding: isMobile ? 16 : 24 }}>
              {isMobile && selected && (
                <button
                  onClick={() => setSelected(null)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16,
                    background: 'none', border: 'none', fontSize: 13, fontWeight: 600,
                    color: 'var(--yb-muted)', cursor: 'pointer', padding: 0,
                  }}
                >
                  ← Voltar
                </button>
              )}
              {!selected ? (
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--yb-subtle)' }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>
                    <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
                  </svg>
                  <p style={{ fontSize: 13, margin: 0 }}>Seleccione uma lead para ver detalhes</p>
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
            <div style={{ marginTop: 32 }}>
              <VariantPanel />
              <VariantSchedulePanel />
            </div>
          </div>
        </div>
      )}

      {tab === 'widgets' && (
        <div style={{ flex: 1, overflowY: 'auto', height: '100%' }}>
          <WidgetsPage />
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
                width: 360, background: 'var(--yb-card)',
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
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--yb-fg)' }}>Hipóteses de Agregação</h2>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--yb-subtle)' }}>
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
            border: `1.5px solid ${BORDER}`, fontSize: 13, color: 'var(--yb-fg)',
            fontFamily: 'inherit', cursor: 'pointer',
            background: 'var(--yb-input)', colorScheme: 'inherit' as const,
          }}
        />
      </div>

      {loading && (
        <p style={{ color: 'var(--yb-subtle)', fontSize: 13 }}>A carregar...</p>
      )}

      {!loading && items.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '60px 0', color: 'var(--yb-subtle)',
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
            background: 'var(--yb-card)', borderRadius: 12,
            border: `1.5px solid ${item.convId === highlightConvId ? '#00bcd4' : item.aggHintsSeen ? BORDER : '#ffc107'}`,
            marginBottom: 16, overflow: 'hidden',
            boxShadow: item.convId === highlightConvId ? '0 0 0 3px rgba(0,188,212,0.2)' : item.aggHintsSeen ? 'none' : '0 2px 12px rgba(255,193,7,0.15)',
          }}
        >
          {/* Cabeçalho */}
          <div style={{
            padding: '12px 16px',
            background: item.aggHintsSeen ? 'rgba(255,255,255,0.03)' : 'rgba(255,193,7,0.06)',
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          }}>
            <span style={{
              fontSize: 9, fontWeight: 800, letterSpacing: '0.1em',
              textTransform: 'uppercase', background: '#ffc107',
              color: '#0F1B2D', padding: '3px 7px', borderRadius: 4,
            }}>AGREGAÇÃO</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--yb-fg)' }}>{item.refCode}</span>
            <span style={{ fontSize: 12, color: 'var(--yb-muted)' }}>
              {item.origem.split(',')[0]} → {item.destino.split(',')[0]}
            </span>
            <span style={{ fontSize: 11, color: 'var(--yb-subtle)', marginLeft: 'auto' }}>
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
                background: i === 0 ? 'rgba(0,188,212,0.06)' : 'rgba(255,255,255,0.03)',
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
                  <span style={{ fontSize: 10, color: '#00bcd4', fontWeight: 700 }}>↩ VOLTA</span>
                )}
                <span style={{ fontSize: 11, color: 'var(--yb-muted)', flex: 1, minWidth: 160 }}>
                  {h.pickup?.split(',')[0] ?? '—'} → {h.delivery?.split(',')[0] ?? '—'}
                </span>
                <span style={{ fontSize: 11, color: 'var(--yb-subtle)' }}>
                  +{h.detourPickupKm}km / +{h.detourDeliveryKm}km
                </span>
                {h.serviceTime && (
                  <span style={{
                    fontSize: 11, fontWeight: 700,
                    color: h.timeDeltaMin < 0 ? '#00bcd4'
                      : h.timeDeltaMin <= 90 ? '#22c55e'
                      : h.timeDeltaMin <= 300 ? '#f97316' : '#4a6080',
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
  administrator:      ['rgba(0,188,212,0.15)', '#00bcd4'],
  Operator:           ['rgba(99,179,237,0.15)', '#63b3ed'],
  commissionOperator: ['rgba(167,139,250,0.15)', '#a78bfa'],
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
  const { theme, setTheme } = useTheme();

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
    padding: '7px 10px', borderRadius: 7, border: `1.5px solid ${BORDER}`,
    fontSize: 13, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
    color: 'var(--yb-fg)', outline: 'none', background: 'var(--yb-input)',
    colorScheme: 'inherit' as const,
  };
  const btnStyle = (bg: string, fg: string): React.CSSProperties => ({
    padding: '7px 14px', borderRadius: 7, border: 'none',
    background: bg, color: fg, fontSize: 12, fontWeight: 700,
    cursor: 'pointer', whiteSpace: 'nowrap',
  });

  return (
    <div style={{ padding: '28px 32px', maxWidth: 780, fontFamily: 'system-ui, sans-serif' }}>

      {/* Aparência */}
      <div style={{ background: 'var(--yb-card)', borderRadius: 12, border: `1.5px solid var(--yb-border)`, padding: '20px 24px', marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, color: 'var(--yb-fg)' }}>Aparência</h3>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--yb-muted)' }}>Escolhe entre o tema claro e escuro. A preferência é guardada no browser.</p>
        <div style={{ display: 'flex', gap: 10 }}>
          {(['light', 'dark'] as const).map((t) => {
            const active = theme === t;
            const label = t === 'light' ? 'Claro' : 'Escuro';
            const preview = t === 'light'
              ? { bg: '#F1F5F9', card: '#FFFFFF', dot: '#0097a7' }
              : { bg: '#0F1B2D', card: '#162236', dot: '#00bcd4' };
            return (
              <button
                key={t}
                onClick={() => setTheme(t)}
                style={{
                  flex: 1, padding: '12px 16px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                  border: `2px solid ${active ? 'var(--yb-cyan)' : 'var(--yb-border)'}`,
                  background: active ? `color-mix(in srgb, var(--yb-cyan) 8%, var(--yb-card))` : 'var(--yb-card)',
                  transition: 'border-color .15s',
                }}
              >
                {/* mini preview */}
                <div style={{ width: '100%', height: 44, borderRadius: 6, background: preview.bg, marginBottom: 8, padding: 6, boxSizing: 'border-box', display: 'flex', gap: 4 }}>
                  <div style={{ width: 12, height: '100%', borderRadius: 3, background: preview.card, opacity: 0.9 }} />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div style={{ height: 5, borderRadius: 2, background: preview.dot, width: '60%' }} />
                    <div style={{ height: 4, borderRadius: 2, background: preview.card, width: '80%' }} />
                    <div style={{ height: 4, borderRadius: 2, background: preview.card, width: '50%' }} />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: active ? 'var(--yb-cyan)' : 'var(--yb-fg)' }}>{label}</span>
                  {active && <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--yb-cyan)' }}>ACTIVO</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Perfil próprio */}
      <div style={{ background: 'var(--yb-card)', borderRadius: 12, border: `1.5px solid var(--yb-border)`, padding: '20px 24px', marginBottom: 28 }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, color: 'var(--yb-fg)' }}>O meu perfil</h3>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--yb-muted)' }}>
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
          <button onClick={() => signOut({ callbackUrl: '/login' })} style={btnStyle('rgba(239,68,68,0.12)', '#f87171')}>
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
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--yb-fg)' }}>Utilizadores</h3>
            <button
              onClick={() => setShowCreate((s) => !s)}
              style={btnStyle(showCreate ? 'rgba(255,255,255,0.07)' : CYAN, showCreate ? '#8B9EC9' : '#0F1B2D')}
            >
              {showCreate ? 'Cancelar' : '+ Novo utilizador'}
            </button>
          </div>

          {/* Form criar */}
          {showCreate && (
            <div style={{
              background: 'rgba(0,188,212,0.06)', border: `1.5px solid rgba(0,188,212,0.2)`, borderRadius: 10,
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
            <p style={{ color: 'var(--yb-subtle)', fontSize: 13 }}>A carregar...</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {users.map((u) => (
                <div key={u._id} style={{
                  background: 'var(--yb-card)', border: `1.5px solid ${u.active ? BORDER : 'rgba(239,68,68,0.25)'}`,
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
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--yb-fg)' }}>
                      {u.name || u.email}
                      {u._id === selfId && <span style={{ fontSize: 10, color: CYAN, marginLeft: 6 }}>(eu)</span>}
                    </p>
                    <p style={{ margin: 0, fontSize: 11, color: 'var(--yb-subtle)' }}>{u.email}</p>
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
                      style={btnStyle(u.active ? 'rgba(249,115,22,0.12)' : 'rgba(34,197,94,0.12)', u.active ? '#f97316' : '#22c55e')}
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
          <div style={{ height: 1, background: BORDER, margin: '28px 0' }} />
          <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 800, color: 'var(--yb-fg)' }}>Configuração do Bot</h3>
          <RoutingPanel />
          <div style={{ height: 1, background: BORDER, margin: '32px 0' }} />
          <VariantPanel />
          <VariantSchedulePanel />
          <div style={{ height: 1, background: BORDER, margin: '32px 0' }} />
          <DepotPanel />
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

        <p style={{ fontSize: 14, color: 'var(--yb-muted)', lineHeight: 1.65, margin: '0 0 28px' }}>
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
  A: ['rgba(139,92,246,0.15)', '#a78bfa'],
  B: ['rgba(245,158,11,0.15)', '#fbbf24'],
  C: ['rgba(16,185,129,0.15)', '#34d399'],
  D: ['rgba(236,72,153,0.15)', '#f472b6'],
  BOT: ['rgba(0,188,212,0.15)', '#00bcd4'],
};

function DetailField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium text-foreground">{children}</div>
    </div>
  );
}

// Carrega o Leaflet por CDN (sem dependência no build). Cacheia a promessa.
let _leafletPromise: Promise<any> | null = null;
function loadLeaflet(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject();
  if ((window as any).L) return Promise.resolve((window as any).L);
  if (_leafletPromise) return _leafletPromise;
  _leafletPromise = new Promise((resolve, reject) => {
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    s.onload = () => resolve((window as any).L);
    s.onerror = reject;
    document.body.appendChild(s);
  });
  return _leafletPromise;
}

// Mini-mapa Leaflet + OpenStreetMap (sem chave). Marker; círculo de incerteza se aproximado.
function MiniMap({ lat, lng, zoom, exact }: { lat: number; lng: number; zoom: number; exact: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let map: any = null;
    let cancelled = false;
    loadLeaflet().then((L: any) => {
      if (cancelled || !ref.current || !L) return;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });
      map = L.map(ref.current, { scrollWheelZoom: false, attributionControl: true }).setView([lat, lng], zoom);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '&copy; OpenStreetMap',
      }).addTo(map);
      L.marker([lat, lng]).addTo(map);
      if (!exact) {
        L.circle([lat, lng], { radius: 4000, color: '#00bcd4', weight: 1, fillColor: '#00bcd4', fillOpacity: 0.12 }).addTo(map);
      }
      setTimeout(() => { if (!cancelled && map) map.invalidateSize(); }, 100);
    }).catch(() => {});
    return () => { cancelled = true; if (map) map.remove(); };
  }, [lat, lng, zoom, exact]);
  return <div ref={ref} style={{ height: 170, width: '100%', borderRadius: 10, overflow: 'hidden', zIndex: 0 }} />;
}

function DetailPanel({ lead, onClose, onClientConverted }: {
  lead: Lead;
  onClose: () => void;
  onClientConverted?: (clientId: string) => void;
}) {
  const [currentLead, setCurrentLead] = useState<Lead>(lead);
  const d = currentLead.leadData;
  const nome = d.nome ?? 'Sem nome';
  const [clientId, setClientId] = useState<string | null>(currentLead.clientId ?? null);
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [showBreakdown, setShowBreakdown] = useState(false);

  useEffect(() => {
    setCurrentLead(lead);
    fetch(`/api/leads/${lead.id}`)
      .then(r => r.json())
      .then(data => {
        if (data.lead) {
          setCurrentLead(data.lead);
        }
      })
      .catch(() => {});
  }, [lead.id]);

  async function convertToClient() {
    setConverting(true);
    setConvertError(null);
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: currentLead.id }),
      });
      const data = await res.json();
      if (data.success) {
        setClientId(data.clientId);
        onClientConverted?.(data.clientId);
      } else {
        setConvertError(data.error ?? 'Erro ao converter');
      }
    } catch {
      setConvertError('Erro de ligação');
    } finally {
      setConverting(false);
    }
  }

  function fmt(ts?: string) {
    if (!ts) return '—';
    return new Date(ts).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-soft text-sm font-bold text-orange shrink-0">
            {currentLead.variante === 'BOT' ? 'AI' : nome.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()}
          </div>
          <div>
            <div className="mb-2 flex flex-wrap gap-1.5">
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${currentLead.messageType === 'newLead' ? 'bg-success-soft text-success' : 'bg-cyan-soft text-cyan'}`}>
                {currentLead.messageType === 'newLead' ? 'Lead Confirmada' : 'Simulação'}
              </span>
              {currentLead.variante && (() => {
                const [bg, fg] = VARIANTE_TAG[currentLead.variante] ?? ['#f0f0f0', '#555'];
                return (
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 999, background: bg, color: fg }}>
                    {VARIANTE_LABELS[currentLead.variante] ?? currentLead.variante}
                  </span>
                );
              })()}
              {d.source && d.source !== 'bot' && (
                <span className="rounded-full bg-brand-purple-soft px-2.5 py-0.5 text-[11px] font-semibold text-brand-purple">
                  {d.source}
                </span>
              )}
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">{nome}</h2>
            <div className="mt-1 text-xs text-muted-foreground">{fmt(currentLead.timeStamp)}</div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>

      {/* Contacto */}
      <section className="rounded-xl bg-card p-5 shadow-card">
        <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Contacto</div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
          <DetailField label="Telefone">
            {d.telefone ? <a className="text-cyan hover:underline" href={`tel:${d.telefone}`}>{d.telefone}</a> : <span className="text-muted-foreground">—</span>}
          </DetailField>
          <DetailField label="Email">
            <span className={d.email ? 'text-foreground' : 'text-muted-foreground'}>{d.email ?? '—'}</span>
          </DetailField>
          <DetailField label="Fonte">{d.source ?? '—'}</DetailField>
          <DetailField label="Convertida">
            {d.converted ? <span className="text-success font-semibold">Sim</span> : <span className="text-muted-foreground">Não</span>}
          </DetailField>
        </div>
      </section>

      {/* Serviço */}
      <section className="rounded-xl bg-card p-5 shadow-card">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Serviço</div>
          {d.serviceType && (
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${d.serviceType === 'direto' ? 'bg-orange-soft text-orange' : 'bg-cyan-soft text-cyan'}`}>
              {d.serviceType === 'arrasto' ? 'Entrega Amanhã' : d.serviceType === 'internacional' ? 'Internacional' : 'Direto'}
            </span>
          )}
        </div>
        <div className="space-y-4">
          <DetailField label="Trajecto">{`${d.origem ?? '—'} → ${d.destino ?? '—'}`}</DetailField>
          {d.geo && (() => {
            const g: any = d.geo;
            const isGps = g.source === 'gps';
            const txt = isGps
              ? (g.address ? String(g.address).split(',').slice(0, 2).join(',').trim() : (g.lat != null ? `${Number(g.lat).toFixed(4)}, ${Number(g.lng).toFixed(4)}` : ''))
              : [g.city, g.region].filter(Boolean).join(', ');
            if (!txt) return null;
            const hasCoords = g.lat != null && g.lng != null;
            const maps = hasCoords ? `https://www.google.com/maps?q=${g.lat},${g.lng}` : null;
            return (
              <>
                <DetailField label={isGps ? 'Localização do visitante (GPS)' : 'Localização do visitante (aprox.)'}>
                  {maps ? <a href={maps} target="_blank" rel="noopener" className="text-cyan hover:underline">{txt}</a> : txt}
                </DetailField>
                {hasCoords && <MiniMap lat={Number(g.lat)} lng={Number(g.lng)} zoom={isGps ? 16 : 11} exact={isGps} />}
              </>
            );
          })()}
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            {d.serviceType === 'arrasto' ? (
              <>
                <DetailField label="Peso">{d.weightKg != null ? `${d.weightKg} kg` : '—'}</DetailField>
                <DetailField label="Janela">{d.partnerWindow ? `Amanhã ${d.partnerWindow}` : '—'}</DetailField>
              </>
            ) : (
              <>
                <DetailField label="Viatura">{d.viatura ?? '—'}</DetailField>
                <DetailField label="Urgência">
                  {d.urgencia ? (
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${d.urgencia === '1 Hora' ? 'bg-destructive/10 text-destructive' : 'bg-success-soft text-success'}`}>
                      {d.urgencia}
                    </span>
                  ) : '—'}
                </DetailField>
                {d.distance != null && <DetailField label="Distância">{`${d.distance} km`}</DetailField>}
              </>
            )}
          </div>
        </div>
      </section>

      {/* Preço */}
      {d.priceCalculated != null && (
        <section className="rounded-xl bg-card p-5 shadow-card">
          <div className="flex justify-between items-center mb-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Preço</div>
            {(d as any).priceBreakdown && (
              <button
                onClick={() => setShowBreakdown(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--yb-cyan)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                Ver Cálculo →
              </button>
            )}
          </div>
          <div className="flex gap-6 items-end">
            <div>
              <div className="text-[11px] text-muted-foreground mb-1">Base</div>
              <div className="text-sm line-through text-muted-foreground">€{d.priceCalculated.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground mb-1">Desconto</div>
              <div className="text-sm text-destructive">-€{d.discount?.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground mb-1">Final</div>
              <div className="text-xl font-bold text-orange">€{d.priceWithDiscount?.toFixed(2)}</div>
            </div>
          </div>
        </section>
      )}
      {d.partnerFinalPrice != null && !d.priceCalculated && (
        <section className="rounded-xl bg-card p-5 shadow-card">
          <div className="flex justify-between items-center mb-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Preço</div>
            {(d as any).priceBreakdown && (
              <button
                onClick={() => setShowBreakdown(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--yb-cyan)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                Ver Cálculo →
              </button>
            )}
          </div>
          <div className="flex gap-6 items-end">
            <div>
              <div className="text-[11px] text-muted-foreground mb-1">Serviço</div>
              <div className="text-sm text-foreground">Entrega {d.partnerWindow}</div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground mb-1">Peso</div>
              <div className="text-sm text-foreground">{d.weightKg} kg</div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground mb-1">Total</div>
              <div className="text-xl font-bold text-orange">€{d.partnerFinalPrice.toFixed(2)}</div>
            </div>
          </div>
        </section>
      )}

      {/* Hipóteses de agregação */}
      {currentLead.messageType === 'newLead' && d.origem && d.destino && (
        <AggregationHints origem={d.origem} destino={d.destino} />
      )}

      {/* Converter para Cliente */}
      {currentLead.messageType === 'newLead' && (
        <div className="rounded-xl bg-card p-5 shadow-card">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">CRM</div>
              {clientId
                ? <p className="mt-1 text-sm text-success font-semibold">✓ Lead convertida para cliente</p>
                : !d.telefone
                  ? <p className="mt-1 text-sm text-muted-foreground">Lead sem telefone — não é possível criar cliente</p>
                  : <p className="mt-1 text-sm text-muted-foreground">Guarda este contacto na lista de Clientes</p>
              }
            </div>
            {!clientId ? (
              <button
                onClick={convertToClient}
                disabled={converting || !d.telefone}
                className="rounded-lg bg-orange px-5 py-2.5 text-sm font-semibold text-white shadow-card transition-transform hover:-translate-y-px disabled:opacity-60 disabled:cursor-not-allowed shrink-0 cursor-pointer"
              >
                {converting ? 'A converter...' : 'Converter para Cliente'}
              </button>
            ) : (
              <span className="rounded-full bg-success-soft px-3 py-1.5 text-xs font-semibold text-success shrink-0">
                Cliente criado ✓
              </span>
            )}
          </div>
          {convertError && (
            <p className="mt-2 text-xs text-destructive">{convertError}</p>
          )}
        </div>
      )}

      {/* Mensagem sistema */}
      <section className="rounded-xl bg-card p-5 shadow-card">
        <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Mensagem Sistema</div>
        <div
          className="sys-msg text-sm text-foreground"
          dangerouslySetInnerHTML={{ __html: lead.message.replace(/line-height\s*:\s*[\d.]+\s*;?/gi, 'line-height:1.8;').replace(/<p/gi, '<p style="margin:0 0 7px 0"') }}
        />
      </section>

      {/* Modal Breakdown */}
      <PriceBreakdownModal
        breakdown={(d as any).priceBreakdown}
        isOpen={showBreakdown}
        onClose={() => setShowBreakdown(false)}
      />
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
  pending:   ['rgba(251,191,36,0.12)', '#fbbf24'],
  assigned:  ['rgba(0,188,212,0.12)', '#00bcd4'],
  accepted:  ['rgba(34,197,94,0.12)', '#22c55e'],
  completed: ['rgba(255,255,255,0.06)', '#8B9EC9'],
  cancelled: ['rgba(239,68,68,0.12)', '#f87171'],
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
    letterSpacing: '0.07em', color: 'var(--yb-subtle)', marginBottom: 10,
  };

  const cardS: React.CSSProperties = {
    background: 'var(--yb-card)', borderRadius: 10, border: `1px solid ${BORDER}`,
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
              background: hasHints ? 'rgba(251,191,36,0.12)' : 'var(--yb-input)',
              color: hasHints ? '#fbbf24' : '#4a6080',
              border: `1px solid ${hasHints ? 'rgba(251,191,36,0.3)' : BORDER}`,
            }}>
              {hasHints ? `${hints.length} encontrada${hints.length > 1 ? 's' : ''}` : 'nenhuma'}
            </span>
          )}
        </div>
        <button
          onClick={load}
          style={{
            fontSize: 11, color: CYAN, border: `1px solid ${CYAN}`,
            borderRadius: 6, padding: '3px 10px', background: 'rgba(0,188,212,0.08)', cursor: 'pointer',
          }}
        >
          {loading ? 'A analisar...' : hints === null ? 'Analisar' : open ? 'Fechar' : 'Ver'}
        </button>
      </div>

      {open && (
        <>
          {loading && <p style={{ fontSize: 12, color: 'var(--yb-subtle)' }}>A procurar serviços em rota compatível...</p>}
          {!loading && hints?.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--yb-subtle)' }}>Sem serviços activos com rota compatível nas próximas 4 horas.</p>
          )}
          {!loading && hints && hints.length > 0 && hints.map((h) => (
            <div key={h.serviceId} style={{
              background: 'rgba(251,191,36,0.06)', border: `1px solid rgba(251,191,36,0.2)`,
              borderRadius: 8, padding: '10px 14px', marginBottom: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: 9, fontWeight: 800, letterSpacing: '0.1em',
                  textTransform: 'uppercase', color: '#fbbf24',
                  background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.3)',
                  padding: '2px 6px', borderRadius: 4,
                }}>{h.isReturnTrip ? 'VOLTA' : 'HIPÓTESE'}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#fbbf24' }}>
                  Compatibilidade {h.score}%
                </span>
                {h.nr != null && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--yb-muted)', background: 'rgba(255,255,255,0.06)', border: `1px solid ${BORDER}`, padding: '1px 6px', borderRadius: 4 }}>
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
                      ? '#00bcd4'
                      : h.timeDeltaMin <= 90
                        ? '#22c55e'
                        : h.timeDeltaMin <= 300
                          ? '#f97316'
                          : '#4a6080',
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
              <div style={{ fontSize: 11, color: 'var(--yb-muted)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 16px' }}>
                {h.pickup && <span>Recolha: <b>{h.pickup.split(',')[0]}</b></span>}
                {h.delivery && <span>Entrega: <b>{h.delivery.split(',')[0]}</b></span>}
                <span>Desvio recolha: <b>{h.detourPickupKm} km</b></span>
                <span>Desvio entrega: <b>{h.detourDeliveryKm} km</b></span>
              </div>
              {h.driver ? (
                <div style={{ marginTop: 6, fontSize: 11, color: 'var(--yb-muted)' }}>
                  Motorista: <b style={{ color: 'var(--yb-fg)' }}>{h.driver.name}</b>
                  {h.driver.phone && <span style={{ color: CYAN, marginLeft: 8 }}>{h.driver.phone}</span>}
                </div>
              ) : (
                <div style={{ marginTop: 6, fontSize: 11, color: 'var(--yb-subtle)', fontStyle: 'italic' }}>
                  Motorista ainda não atribuído
                </div>
              )}
              {h.pointsStatuses.length > 0 && (
                <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {h.pointsStatuses.map((p, i) => (
                    <span key={i} style={{
                      fontSize: 10, padding: '2px 7px', borderRadius: 4,
                      background: p.status === 'completed' ? 'rgba(34,197,94,0.12)' : p.status === 'failed' ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.06)',
                      color:      p.status === 'completed' ? '#22c55e' : p.status === 'failed' ? '#f87171' : '#8B9EC9',
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
      <dt style={{ fontSize: 10, color: 'var(--yb-subtle)', marginBottom: 2 }}>{label}</dt>
      <dd style={{ fontSize: 13, fontWeight: 600, margin: 0, color: cyan ? CYAN : green ? '#22c55e' : '#F0F4FF' }}>
        {value ?? '—'}
      </dd>
    </div>
  );
}

function PB({ label, value, strike, color, large }: { label: string; value?: string; strike?: boolean; color?: string; large?: boolean }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ fontSize: 10, color: 'var(--yb-subtle)', margin: '0 0 2px' }}>{label}</p>
      <p style={{ fontSize: large ? 22 : 14, fontWeight: large ? 800 : 600, color: color ?? '#F0F4FF', margin: 0, textDecoration: strike ? 'line-through' : 'none', fontFamily: 'Space Grotesk, sans-serif' }}>
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
    aggEscalationThreshold: 0, depotDistanceMultiplier: 1, urgencyPhone: '', assistantName: '',
    voiceAssistantName: 'Yox', voiceAssistantGender: 'female', notificationTargets: [],
    quizNudge: { ...DEFAULT_QUIZ_NUDGE },
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

  if (loading) return <p style={{ fontSize: 13, color: 'var(--yb-subtle)' }}>A carregar...</p>;

  function toggle(key: keyof RoutingConfig) { setConfig((c) => ({ ...c, [key]: !c[key] })); }
  function num(key: keyof RoutingConfig, val: string) { setConfig((c) => ({ ...c, [key]: parseInt(val) || 0 })); }
  function numFloat(key: keyof RoutingConfig, rawNum: number) { setConfig((c) => ({ ...c, [key]: isNaN(rawNum) ? 0 : rawNum })); }

  const cardS: React.CSSProperties = { background: 'var(--yb-card)', borderRadius: 10, border: `1px solid ${BORDER}`, padding: '14px 18px', marginBottom: 10 };
  const inputS: React.CSSProperties = { border: `1.5px solid ${BORDER}`, borderRadius: 8, fontSize: 14, outline: 'none', background: 'var(--yb-input)', color: 'var(--yb-fg)', colorScheme: 'inherit' as const };
  const labelS: React.CSSProperties = { fontSize: 11, color: 'var(--yb-subtle)', display: 'block', marginBottom: 4 };

  return (
    <div>
      <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 18, color: NAVY, margin: '0 0 4px' }}>Configuração do Bot</h2>
      <p style={{ fontSize: 13, color: 'var(--yb-muted)', marginBottom: 20 }}>Controle quando o bot responde automaticamente às leads.</p>

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
                style={{ flex: 1, padding: '8px 4px', borderRadius: 8, border: `2px solid ${config.pagamentoProvider === p ? CYAN : BORDER}`, background: config.pagamentoProvider === p ? 'rgba(0,188,212,0.12)' : 'rgba(255,255,255,0.04)', color: config.pagamentoProvider === p ? '#F0F4FF' : '#8B9EC9', fontWeight: config.pagamentoProvider === p ? 700 : 400, fontSize: 12, cursor: 'pointer', transition: 'all 0.15s' }}>
                {label}
              </button>
            ))}
          </div>
          <p style={{ fontSize: 11, color: 'var(--yb-subtle)', margin: '8px 0 0' }}>
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
              <label style={labelS}>{label}</label>
              <input type="number" min={0} max={23} value={(config as any)[key]} onChange={(e) => num(key as any, e.target.value)}
                style={{ ...inputS, width: '100%', padding: '7px 10px', boxSizing: 'border-box' }} />
            </div>
          ))}
        </div>
      </div>

      <div style={cardS}>
        <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--yb-fg)', display: 'block', marginBottom: 4 }}>Delay antes do bot (minutos)</label>
        <p style={{ fontSize: 11, color: 'var(--yb-subtle)', marginBottom: 8 }}>Minutos a aguardar antes do bot responder (0 = imediato · 0.5 = 30 segundos · 1 = 1 minuto)</p>
        <input type="number" min={0} max={60} step={0.5} value={config.delayMinutesBeforeBot} onChange={(e) => numFloat('delayMinutesBeforeBot', e.target.valueAsNumber)}
          style={{ ...inputS, width: 100, padding: '7px 10px' }} />
      </div>

      {/* ── Oferta de agregação ── */}
      <div style={cardS}>
        <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--yb-fg)', display: 'block', marginBottom: 4 }}>Limiar de oferta de agregação (€)</label>
        <p style={{ fontSize: 11, color: 'var(--yb-subtle)', marginBottom: 8 }}>Valor mínimo do orçamento (1h/4h) para apresentar oferta de análise de agregação. Coloque 0 para desactivar.</p>
        <input type="number" min={0} step={10} value={config.aggEscalationThreshold} onChange={(e) => num('aggEscalationThreshold', e.target.value)}
          style={{ ...inputS, width: 120, padding: '7px 10px' }} />
        <span style={{ fontSize: 12, color: 'var(--yb-subtle)', marginLeft: 8 }}>{config.aggEscalationThreshold === 0 ? 'desactivado' : `activo para orçamentos > €${config.aggEscalationThreshold}`}</span>
      </div>

      {/* ── Multiplicador de distância depot ── */}
      <div style={cardS}>
        <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--yb-fg)', display: 'block', marginBottom: 4 }}>Multiplicador de distância — Recolha até Depósito</label>
        <p style={{ fontSize: 11, color: 'var(--yb-subtle)', marginBottom: 8 }}>
          Factor aplicado à distância medida origem→depósito no cálculo do preço de recolha 24h.<br />
          <b>1</b> = apenas a distância directa · <b>2</b> = ida e volta · <b>3</b> = tripla, etc.
        </p>
        <input type="number" min={1} max={10} step={1} value={config.depotDistanceMultiplier ?? 1} onChange={(e) => num('depotDistanceMultiplier', e.target.value)}
          style={{ ...inputS, width: 100, padding: '7px 10px' }} />
        <span style={{ fontSize: 12, color: 'var(--yb-subtle)', marginLeft: 8 }}>
          {(config.depotDistanceMultiplier ?? 1) === 1 ? 'distância simples (apenas ida)' : `distância × ${config.depotDistanceMultiplier}`}
        </span>
      </div>

      {/* ── Contacto de urgência ── */}
      <div style={cardS}>
        <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--yb-fg)', display: 'block', marginBottom: 4 }}>Contacto de urgência</label>
        <p style={{ fontSize: 11, color: 'var(--yb-subtle)', marginBottom: 10 }}>
          Apresentado em negrito nas mensagens de escalamento. Deixe em branco para usar mensagem genérica.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <label style={labelS}>Número de telefone</label>
            <input
              type="tel"
              placeholder="ex: 214 304 546"
              value={config.urgencyPhone ?? ''}
              onChange={(e) => setConfig((c) => ({ ...c, urgencyPhone: e.target.value }))}
              style={{ ...inputS, width: 170, padding: '7px 10px', fontFamily: 'monospace' }}
            />
          </div>
          <div>
            <label style={labelS}>Nome do assistente</label>
            <input
              type="text"
              placeholder="ex: Rui Almeida"
              value={config.assistantName ?? ''}
              onChange={(e) => setConfig((c) => ({ ...c, assistantName: e.target.value }))}
              style={{ ...inputS, width: 200, padding: '7px 10px' }}
            />
          </div>
        </div>
        {config.urgencyPhone && (
          <p style={{ fontSize: 11, color: 'var(--yb-subtle)', marginTop: 8 }}>
            Preview: <em>Em caso de urgência, ligue <strong>{config.urgencyPhone}</strong>{config.assistantName ? ` — ${config.assistantName}` : ''}.</em>
          </p>
        )}
      </div>

      {/* ── Assistente de voz ── */}
      <div style={{ ...cardS, borderTop: `3px solid #5b8dee`, marginTop: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--yb-fg)', margin: '0 0 4px' }}>Assistente de Voz</h3>
        <p style={{ fontSize: 11, color: 'var(--yb-subtle)', margin: '0 0 12px' }}>Configuração do motor de voz nas versões _voz das landing pages</p>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <label style={labelS}>Nome do assistente de voz</label>
            <input
              type="text"
              placeholder="ex: Yox"
              value={config.voiceAssistantName ?? ''}
              onChange={(e) => setConfig((c) => ({ ...c, voiceAssistantName: e.target.value }))}
              style={{ ...inputS, width: 200, padding: '7px 10px' }}
            />
          </div>
          <div>
            <label style={labelS}>Género da voz</label>
            <select
              value={config.voiceAssistantGender ?? 'female'}
              onChange={(e) => setConfig((c) => ({ ...c, voiceAssistantGender: e.target.value as 'female' | 'male' }))}
              style={{ ...inputS, padding: '7px 10px' }}
            >
              <option value="female">Feminino</option>
              <option value="male">Masculino</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── WhatsApp / Evolution API ── */}
      <div style={{ ...cardS, borderTop: `3px solid #25d366`, marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--yb-fg)', margin: 0 }}>WhatsApp Bot (Evolution API)</h3>
            <p style={{ fontSize: 11, color: 'var(--yb-subtle)', margin: '3px 0 0' }}>Liga o bot automático ao WhatsApp via Evolution API</p>
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

      {/* ── Notificações ── */}
      <div style={{ ...cardS, borderTop: `3px solid #f59e0b`, marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--yb-fg)', margin: 0 }}>Notificações de Alerta</h3>
            <p style={{ fontSize: 11, color: 'var(--yb-subtle)', margin: '3px 0 0' }}>Aviso por WhatsApp e/ou email quando há escalamento ou nova lead</p>
          </div>
          <button onClick={() => setConfig((c) => ({ ...c, notificationTargets: [...(c.notificationTargets ?? []), { name: '', phone: '', email: '', events: ['escalation', 'lead'] }] }))}
            style={{ fontSize: 12, fontWeight: 700, background: CYAN, color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', cursor: 'pointer' }}>
            + Adicionar
          </button>
        </div>

        {(config.notificationTargets ?? []).length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--yb-subtle)', margin: 0 }}>Nenhum destinatário configurado. Adicione pelo menos um para receber alertas.</p>
        )}

        {(config.notificationTargets ?? []).map((t, i) => (
          <div key={i} style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 12px', marginBottom: 8, background: 'rgba(255,255,255,0.03)' }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <input placeholder="Nome" value={t.name}
                onChange={(e) => setConfig((c) => { const tgts = [...(c.notificationTargets ?? [])]; tgts[i] = { ...tgts[i], name: e.target.value }; return { ...c, notificationTargets: tgts }; })}
                style={{ ...inputS, flex: 1, padding: '6px 8px', borderRadius: 6, fontSize: 12 }} />
              <button onClick={() => setConfig((c) => { const tgts = [...(c.notificationTargets ?? [])]; tgts.splice(i, 1); return { ...c, notificationTargets: tgts }; })}
                style={{ fontSize: 16, background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input placeholder="Telefone (351914...)" value={t.phone}
                onChange={(e) => setConfig((c) => { const tgts = [...(c.notificationTargets ?? [])]; tgts[i] = { ...tgts[i], phone: e.target.value }; return { ...c, notificationTargets: tgts }; })}
                style={{ ...inputS, flex: 1, padding: '6px 8px', borderRadius: 6, fontSize: 12 }} />
              <input placeholder="Email (opcional)" value={t.email}
                onChange={(e) => setConfig((c) => { const tgts = [...(c.notificationTargets ?? [])]; tgts[i] = { ...tgts[i], email: e.target.value }; return { ...c, notificationTargets: tgts }; })}
                style={{ ...inputS, flex: 1, padding: '6px 8px', borderRadius: 6, fontSize: 12 }} />
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              {(['conversation', 'escalation', 'lead'] as const).map((ev) => (
                <label key={ev} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', color: 'var(--yb-muted)' }}>
                  <input type="checkbox" checked={t.events.includes(ev)}
                    onChange={(e) => setConfig((c) => {
                      const tgts = [...(c.notificationTargets ?? [])];
                      const evts = e.target.checked ? [...tgts[i].events, ev] : tgts[i].events.filter(x => x !== ev);
                      tgts[i] = { ...tgts[i], events: evts };
                      return { ...c, notificationTargets: tgts };
                    })} />
                  {ev === 'conversation' ? 'Nova Conversa' : ev === 'escalation' ? 'Escalamento' : 'Nova Lead'}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── Reengajamento de Quiz Abandonado ── */}
      {(() => {
        const qn = config.quizNudge ?? DEFAULT_QUIZ_NUDGE;
        const setQn = (patch: Partial<typeof DEFAULT_QUIZ_NUDGE>) =>
          setConfig((c) => ({ ...c, quizNudge: { ...(c.quizNudge ?? DEFAULT_QUIZ_NUDGE), ...patch } }));
        const lblS: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--yb-muted)', display: 'block', marginBottom: 3 };
        return (
          <div style={{ ...cardS, borderTop: `3px solid #8b5cf6`, marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--yb-fg)', margin: 0 }}>Reengajamento de Quiz Abandonado</h3>
                <p style={{ fontSize: 11, color: 'var(--yb-subtle)', margin: '3px 0 0' }}>Toque proactivo quando o visitante deu nome + contacto mas não concluiu o quiz</p>
              </div>
              <ToggleSwitch checked={qn.active} onChange={() => setQn({ active: !qn.active })} />
            </div>

            {qn.active && (
              <div style={{ marginTop: 14, display: 'grid', gap: 12 }}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 150px' }}>
                    <label style={lblS}>Inactividade antes do toque (min)</label>
                    <input type="number" min={1} value={qn.delayMinutes}
                      onChange={(e) => setQn({ delayMinutes: parseInt(e.target.value) || 1 })}
                      style={{ ...inputS, width: '100%', padding: '7px 10px', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ flex: '1 1 180px' }}>
                    <label style={lblS}>Canal</label>
                    <select value={qn.channel}
                      onChange={(e) => setQn({ channel: e.target.value as 'whatsapp_email' | 'whatsapp' | 'email' })}
                      style={{ ...inputS, width: '100%', padding: '7px 10px', boxSizing: 'border-box' }}>
                      <option value="whatsapp_email">WhatsApp (email se falhar)</option>
                      <option value="whatsapp">Só WhatsApp</option>
                      <option value="email">Só email</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div style={{ flex: '1 1 90px' }}>
                    <label style={lblS}>Das (h)</label>
                    <input type="number" min={0} max={23} value={qn.startHour}
                      onChange={(e) => setQn({ startHour: parseInt(e.target.value) || 0 })}
                      style={{ ...inputS, width: '100%', padding: '7px 10px', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ flex: '1 1 90px' }}>
                    <label style={lblS}>Às (h)</label>
                    <input type="number" min={1} max={24} value={qn.endHour}
                      onChange={(e) => setQn({ endHour: parseInt(e.target.value) || 0 })}
                      style={{ ...inputS, width: '100%', padding: '7px 10px', boxSizing: 'border-box' }} />
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--yb-fg)', flex: '1 1 auto' }}>
                    <ToggleSwitch checked={qn.weekendsOff} onChange={() => setQn({ weekendsOff: !qn.weekendsOff })} />
                    Não enviar ao fim-de-semana
                  </label>
                </div>

                <div>
                  <label style={lblS}>Mensagem (tokens: {'{nome}'} e {'{rota}'})</label>
                  <textarea value={qn.messageTemplate} rows={3}
                    onChange={(e) => setQn({ messageTemplate: e.target.value })}
                    style={{ ...inputS, width: '100%', padding: '8px 10px', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} />
                </div>

                <p style={{ fontSize: 10, color: 'var(--yb-subtle)', margin: 0 }}>
                  Requer o cron a chamar <code>/api/cron/quiz-nudge</code> e o WhatsApp (Evolution) configurado. Envia um toque por visitante.
                </p>
              </div>
            )}
          </div>
        );
      })()}

      <button onClick={save} disabled={saving}
        style={{ width: '100%', padding: '11px 20px', borderRadius: 8, border: 'none', cursor: saving ? 'default' : 'pointer', background: saved ? '#166534' : CYAN, color: '#fff', fontSize: 14, fontWeight: 700, opacity: saving ? 0.7 : 1, transition: 'background 0.2s' }}>
        {saving ? 'A guardar...' : saved ? '✓ Guardado' : 'Guardar configuração'}
      </button>
    </div>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button onClick={onChange} style={{
      width: 42, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
      background: checked ? '#25d366' : 'rgba(255,255,255,0.15)', position: 'relative', transition: 'background 0.2s', flexShrink: 0,
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
      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--yb-muted)', display: 'block', marginBottom: 3 }}>{label}</label>
      <input
        type={password ? 'password' : 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={hint}
        style={{ width: '100%', padding: '7px 10px', border: `1.5px solid ${BORDER}`, borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: password ? 'monospace' : 'inherit', background: 'var(--yb-input)', color: 'var(--yb-fg)', colorScheme: 'inherit' as const }}
      />
      <p style={{ fontSize: 10, color: 'var(--yb-subtle)', margin: '3px 0 0' }}>{hint}</p>
    </div>
  );
}

// ── Variant A/B Panel ─────────────────────────────────────────────────────────

type VariantItem = { key: string; label: string; desc: string; file: string; weight: number };

const EMPTY_VARIANT: VariantItem = { key: '', label: '', desc: '', file: '', weight: 0 };

function VariantPanel() {
  const [variants, setVariants] = useState<VariantItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newItem, setNewItem] = useState<VariantItem>(EMPTY_VARIANT);

  useEffect(() => {
    fetch('/api/variant-config')
      .then((r) => r.json())
      .then((d) => setVariants(d.variants ?? []))
      .finally(() => setLoading(false));
  }, []);

  const total = variants.reduce((s, v) => s + (v.weight || 0), 0);

  function updateVariant(idx: number, field: keyof VariantItem, value: string | number) {
    setVariants((vs) => vs.map((v, i) => i === idx ? { ...v, [field]: value } : v));
  }

  function deleteVariant(idx: number) {
    setVariants((vs) => vs.filter((_, i) => i !== idx));
  }

  function addVariant() {
    const key = newItem.key.trim();
    if (!key) { setError('A chave é obrigatória'); return; }
    if (variants.some((v) => v.key === key)) { setError(`Chave duplicada: "${key}"`); return; }
    const file = newItem.file.trim() || `index-${key}.html`;
    const label = newItem.label.trim() || `Variante ${key.toUpperCase()}`;
    setVariants((vs) => [...vs, { ...newItem, key, label, file }]);
    setNewItem(EMPTY_VARIANT);
    setShowAdd(false);
    setError('');
  }

  async function save() {
    if (total !== 100) { setError(`A soma deve ser 100 (actual: ${total})`); return; }
    setError(''); setSaving(true); setSaved(false);
    try {
      const res = await fetch('/api/variant-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variants }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) setError(data.error ?? 'Erro ao guardar');
      else { setSaved(true); setTimeout(() => setSaved(false), 2000); }
    } catch (e: any) { setError('Erro de rede: ' + e.message); }
    finally { setSaving(false); }
  }

  if (loading) return <p style={{ fontSize: 13, color: 'var(--yb-subtle)' }}>A carregar...</p>;

  const cardS: React.CSSProperties = { background: 'var(--yb-card)', borderRadius: 10, border: `1px solid ${BORDER}`, padding: '14px 18px', marginBottom: 10 };
  const inpS: React.CSSProperties = { padding: '5px 8px', border: `1.5px solid ${BORDER}`, borderRadius: 7, fontSize: 13, outline: 'none', background: 'var(--yb-input)', color: 'var(--yb-fg)', colorScheme: 'inherit' as const, width: '100%' };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
        <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 18, color: NAVY, margin: 0 }}>Distribuição de Variantes A/B</h2>
        <span style={{ fontSize: 13, fontWeight: 700, color: total === 100 ? '#22c55e' : '#f87171' }}>Total: {total}%</span>
      </div>
      <p style={{ fontSize: 13, color: 'var(--yb-muted)', marginBottom: 16 }}>
        Controle em tempo real a percentagem de visitantes que vê cada versão da landing page. A soma deve ser exactamente 100%.
      </p>

      {variants.map((v, idx) => (
        <div key={v.key} style={cardS}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: 60 }}>
              <span style={{ fontSize: 10, color: 'var(--yb-subtle)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Chave</span>
              <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: CYAN, background: 'rgba(0,188,212,0.12)', padding: '5px 8px', borderRadius: 7, textAlign: 'center' }}>{v.key}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 2, minWidth: 100 }}>
              <span style={{ fontSize: 10, color: 'var(--yb-subtle)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Etiqueta</span>
              <input value={v.label} onChange={(e) => updateVariant(idx, 'label', e.target.value)} style={inpS} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 3, minWidth: 120 }}>
              <span style={{ fontSize: 10, color: 'var(--yb-subtle)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Descrição</span>
              <input value={v.desc} placeholder="opcional" onChange={(e) => updateVariant(idx, 'desc', e.target.value)} style={inpS} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 2, minWidth: 120 }}>
              <span style={{ fontSize: 10, color: 'var(--yb-subtle)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Ficheiro</span>
              <input value={v.file} onChange={(e) => updateVariant(idx, 'file', e.target.value)} style={{ ...inpS, fontFamily: 'monospace', fontSize: 12 }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: 72 }}>
              <span style={{ fontSize: 10, color: 'var(--yb-subtle)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Peso %</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <input type="number" min={0} max={100} value={v.weight}
                  onChange={(e) => updateVariant(idx, 'weight', parseInt(e.target.value) || 0)}
                  style={{ ...inpS, width: 52, textAlign: 'right' }} />
                <span style={{ fontSize: 12, color: 'var(--yb-muted)' }}>%</span>
              </div>
            </div>
            <button onClick={() => deleteVariant(idx)}
              style={{ flexShrink: 0, background: 'none', border: `1.5px solid rgba(239,68,68,0.3)`, borderRadius: 7, padding: '5px 11px', cursor: 'pointer', fontSize: 18, color: '#f87171', lineHeight: 1 }}
              title="Remover variante">×</button>
          </div>
          <div style={{ marginTop: 8, height: 5, background: 'var(--yb-border)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(v.weight, 100)}%`, height: '100%', background: v.weight > 0 ? CYAN : 'transparent', transition: 'width 0.2s' }} />
          </div>
        </div>
      ))}

      {showAdd ? (
        <div style={{ ...cardS, borderStyle: 'dashed', background: 'rgba(0,188,212,0.04)' }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: NAVY, margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: 0.5 }}>Nova variante</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: 72 }}>
              <span style={{ fontSize: 10, color: 'var(--yb-subtle)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Chave *</span>
              <input value={newItem.key} placeholder="ex: e"
                onChange={(e) => {
                  const k = e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '');
                  setNewItem((n) => ({ ...n, key: k, file: n.file || `index-${k}.html` }));
                }}
                style={{ ...inpS, width: 72 }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 2, minWidth: 100 }}>
              <span style={{ fontSize: 10, color: 'var(--yb-subtle)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Etiqueta</span>
              <input value={newItem.label} placeholder="Variante E" onChange={(e) => setNewItem((n) => ({ ...n, label: e.target.value }))} style={inpS} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 2, minWidth: 100 }}>
              <span style={{ fontSize: 10, color: 'var(--yb-subtle)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Descrição</span>
              <input value={newItem.desc} placeholder="opcional" onChange={(e) => setNewItem((n) => ({ ...n, desc: e.target.value }))} style={inpS} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 2, minWidth: 120 }}>
              <span style={{ fontSize: 10, color: 'var(--yb-subtle)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Ficheiro</span>
              <input value={newItem.file} placeholder="index-e.html"
                onChange={(e) => setNewItem((n) => ({ ...n, file: e.target.value }))}
                style={{ ...inpS, fontFamily: 'monospace', fontSize: 12 }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: 72 }}>
              <span style={{ fontSize: 10, color: 'var(--yb-subtle)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Peso %</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <input type="number" min={0} max={100} value={newItem.weight}
                  onChange={(e) => setNewItem((n) => ({ ...n, weight: parseInt(e.target.value) || 0 }))}
                  style={{ ...inpS, width: 52, textAlign: 'right' }} />
                <span style={{ fontSize: 12, color: 'var(--yb-muted)' }}>%</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button onClick={addVariant}
                style={{ padding: '7px 14px', background: CYAN, color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                Adicionar
              </button>
              <button onClick={() => { setShowAdd(false); setError(''); setNewItem(EMPTY_VARIANT); }}
                style={{ padding: '7px 12px', background: 'none', border: `1.5px solid ${BORDER}`, borderRadius: 7, cursor: 'pointer', fontSize: 13, color: 'var(--yb-muted)' }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)}
          style={{ width: '100%', padding: '10px', border: `1.5px dashed ${BORDER}`, borderRadius: 8, background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--yb-muted)', marginBottom: 10 }}>
          + Adicionar variante
        </button>
      )}

      {error && <p style={{ fontSize: 12, color: '#f87171', margin: '0 0 8px' }}>{error}</p>}

      <button onClick={save} disabled={saving || total !== 100}
        style={{ width: '100%', padding: '11px 20px', borderRadius: 8, border: 'none', cursor: (saving || total !== 100) ? 'default' : 'pointer', background: saved ? '#166534' : total !== 100 ? 'rgba(255,255,255,0.1)' : CYAN, color: total !== 100 ? '#4a6080' : '#fff', fontSize: 14, fontWeight: 700, opacity: saving ? 0.7 : 1, transition: 'background 0.2s' }}>
        {saving ? 'A guardar...' : saved ? '✓ Guardado' : 'Guardar distribuição'}
      </button>
      <p style={{ fontSize: 11, color: 'var(--yb-subtle)', marginTop: 6, textAlign: 'center' }}>Propagação máxima: 60 segundos (cache PHP)</p>
    </div>
  );
}

// ── Variant Schedule Panel ────────────────────────────────────────────────────

type VariantSchedule = {
  id: string;
  label: string;
  startHour: number;
  endHour: number;
  weights: Record<string, number>;
  enabled?: boolean;
};

function newSlotId() {
  return Math.random().toString(36).slice(2, 9);
}

function VariantSchedulePanel() {
  const [variantKeys, setVariantKeys] = useState<string[]>([]);
  const [schedules, setSchedules] = useState<VariantSchedule[]>([]);
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // Hora actual de Lisboa (para chip "slot activo agora")
  const [nowHour, setNowHour] = useState(() =>
    new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Lisbon' })).getHours()
  );
  useEffect(() => {
    const t = setInterval(() =>
      setNowHour(new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Lisbon' })).getHours()),
      60_000,
    );
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    Promise.all([
      fetch('/api/variant-config').then((r) => r.json()),
      fetch('/api/variant-config/schedules').then((r) => r.json()),
    ]).then(([varData, schData]) => {
      setVariantKeys((varData.variants ?? []).map((v: { key: string }) => v.key));
      setSchedules(schData.schedules ?? []);
      setActive(schData.active ?? false);
    }).finally(() => setLoading(false));
  }, []);

  const activeSlot = schedules.find((s) => s.enabled !== false && nowHour >= s.startHour && nowHour < s.endHour);

  function addSlot() {
    const used = new Set(schedules.flatMap((s) => Array.from({ length: s.endHour - s.startHour }, (_, i) => s.startHour + i)));
    let start = 0;
    while (used.has(start) && start < 24) start++;
    const end = Math.min(start + 4, 24);
    const w: Record<string, number> = {};
    if (variantKeys.length > 0) {
      variantKeys.forEach((k) => (w[k] = 0));
      w[variantKeys[0]] = 100;
    }
    setSchedules((s) => [...s, { id: newSlotId(), label: 'Novo slot', startHour: start, endHour: end, weights: w, enabled: true }]);
  }

  function removeSlot(id: string) {
    setSchedules((s) => s.filter((sl) => sl.id !== id));
  }

  function updateSlot(id: string, field: keyof VariantSchedule, value: unknown) {
    setSchedules((s) => s.map((sl) => sl.id === id ? { ...sl, [field]: value } : sl));
  }

  function updateWeight(id: string, key: string, val: number) {
    setSchedules((s) => s.map((sl) => sl.id === id ? { ...sl, weights: { ...sl.weights, [key]: val } } : sl));
  }

  async function save() {
    setError(''); setSaving(true); setSaved(false);
    try {
      const res = await fetch('/api/variant-config/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedules, active }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) setError(data.error ?? 'Erro ao guardar');
      else { setSaved(true); setTimeout(() => setSaved(false), 2500); }
    } catch (e: any) { setError('Erro de rede: ' + e.message); }
    finally { setSaving(false); }
  }

  const cardS: React.CSSProperties = { background: 'var(--yb-card)', borderRadius: 10, border: `1px solid ${BORDER}`, padding: '14px 18px', marginBottom: 10 };
  const inpS: React.CSSProperties = { padding: '5px 8px', border: `1.5px solid ${BORDER}`, borderRadius: 7, fontSize: 13, outline: 'none', background: 'var(--yb-input)', color: 'var(--yb-fg)', colorScheme: 'inherit' as const, width: '100%' };
  const numS: React.CSSProperties = { ...inpS, width: 56, textAlign: 'right' as const };

  if (loading) return null;

  return (
    <div style={{ marginTop: 32 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 18, color: NAVY, margin: 0 }}>
          Agendamento de Distribuição
        </h2>
        {active && activeSlot && (
          <span style={{ fontSize: 12, fontWeight: 700, background: 'rgba(34,197,94,0.15)', color: '#22c55e', padding: '3px 10px', borderRadius: 20 }}>
            Activo agora: {activeSlot.label}
          </span>
        )}
        {active && !activeSlot && (
          <span style={{ fontSize: 12, fontWeight: 600, background: 'rgba(250,204,21,0.15)', color: '#ca8a04', padding: '3px 10px', borderRadius: 20 }}>
            Fora de slot — usando distribuição base
          </span>
        )}
      </div>
      <p style={{ fontSize: 13, color: 'var(--yb-muted)', marginBottom: 14 }}>
        Define percentagens automáticas por faixa horária. Quando activo, a distribuição muda sozinha à hora programada (propagação máx. 60s).
      </p>

      {/* Toggle activar */}
      <div style={{ ...cardS, display: 'flex', alignItems: 'center', gap: 14 }}>
        <button
          onClick={() => setActive((v) => !v)}
          style={{
            width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', position: 'relative',
            background: active ? CYAN : 'var(--yb-border)', transition: 'background 0.2s', flexShrink: 0,
          }}>
          <span style={{
            position: 'absolute', top: 3, left: active ? 22 : 3, width: 18, height: 18,
            borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
          }} />
        </button>
        <div>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--yb-fg)' }}>
            {active ? 'Agendamento activo' : 'Agendamento desactivado'}
          </span>
          <p style={{ fontSize: 11, color: 'var(--yb-subtle)', margin: '2px 0 0' }}>
            {active ? 'Os pesos são definidos automaticamente pela hora de Lisboa.' : 'A distribuição manual (painel acima) está em vigor.'}
          </p>
        </div>
      </div>

      {/* Lista de slots */}
      {schedules.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--yb-subtle)', textAlign: 'center', padding: '16px 0' }}>
          Nenhum slot definido. Clique em "+ Adicionar slot" para começar.
        </p>
      )}

      {schedules.map((slot) => {
        const slotEnabled = slot.enabled !== false;
        const slotTotal = Object.values(slot.weights).reduce((a, b) => a + b, 0);
        const isNow = active && slotEnabled && nowHour >= slot.startHour && nowHour < slot.endHour;
        const borderColor = isNow ? CYAN : slotEnabled ? BORDER : 'rgba(150,150,150,0.25)';
        return (
          <div key={slot.id} style={{ ...cardS, border: `1.5px solid ${borderColor}`, opacity: slotEnabled ? 1 : 0.5, transition: 'opacity 0.2s' }}>
            {/* Cabeçalho do slot */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: slotEnabled ? 12 : 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 2, minWidth: 100 }}>
                <span style={{ fontSize: 10, color: 'var(--yb-subtle)', textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>Etiqueta</span>
                <input value={slot.label} onChange={(e) => updateSlot(slot.id, 'label', e.target.value)} style={inpS} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 10, color: 'var(--yb-subtle)', textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>Das</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input type="number" min={0} max={23} value={slot.startHour}
                    onChange={(e) => updateSlot(slot.id, 'startHour', Math.max(0, Math.min(23, parseInt(e.target.value) || 0)))}
                    style={numS} />
                  <span style={{ fontSize: 12, color: 'var(--yb-muted)' }}>h</span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 10, color: 'var(--yb-subtle)', textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>Até</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input type="number" min={1} max={24} value={slot.endHour}
                    onChange={(e) => updateSlot(slot.id, 'endHour', Math.max(1, Math.min(24, parseInt(e.target.value) || 1)))}
                    style={numS} />
                  <span style={{ fontSize: 12, color: 'var(--yb-muted)' }}>h</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                {isNow && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: CYAN }}>ACTIVO AGORA</span>
                )}
                {!slotEnabled && (
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--yb-muted)' }}>Desactivado</span>
                )}
                {slotEnabled && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: slotTotal === 100 ? '#22c55e' : '#f87171' }}>
                    {slotTotal}%
                  </span>
                )}
                {/* Toggle activo/inactivo */}
                <button
                  title={slotEnabled ? 'Desactivar slot' : 'Activar slot'}
                  onClick={() => updateSlot(slot.id, 'enabled', !slotEnabled)}
                  style={{
                    width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer', position: 'relative',
                    background: slotEnabled ? CYAN : 'var(--yb-border)', transition: 'background 0.2s', flexShrink: 0,
                  }}>
                  <span style={{
                    position: 'absolute', top: 2, left: slotEnabled ? 17 : 2, width: 16, height: 16,
                    borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
                  }} />
                </button>
                <button onClick={() => removeSlot(slot.id)}
                  style={{ background: 'none', border: `1.5px solid rgba(239,68,68,0.3)`, borderRadius: 7, padding: '4px 10px', cursor: 'pointer', fontSize: 16, color: '#f87171', lineHeight: 1 }}>
                  ×
                </button>
              </div>
            </div>

            {/* Pesos por variante — só mostra se activo */}
            {slotEnabled && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {variantKeys.map((key) => (
                  <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center', minWidth: 60 }}>
                    <span style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 700, color: CYAN, background: 'rgba(0,188,212,0.12)', padding: '2px 7px', borderRadius: 5 }}>{key}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <input type="number" min={0} max={100}
                        value={slot.weights[key] ?? 0}
                        onChange={(e) => updateWeight(slot.id, key, parseInt(e.target.value) || 0)}
                        style={{ ...numS, width: 48 }} />
                      <span style={{ fontSize: 11, color: 'var(--yb-muted)' }}>%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <button onClick={addSlot}
        style={{ width: '100%', padding: '10px', border: `1.5px dashed ${BORDER}`, borderRadius: 8, background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--yb-muted)', marginBottom: 10 }}>
        + Adicionar slot
      </button>

      {error && <p style={{ fontSize: 12, color: '#f87171', margin: '0 0 8px' }}>{error}</p>}

      <button onClick={save} disabled={saving}
        style={{ width: '100%', padding: '11px 20px', borderRadius: 8, border: 'none', cursor: saving ? 'default' : 'pointer', background: saved ? '#166534' : CYAN, color: '#fff', fontSize: 14, fontWeight: 700, opacity: saving ? 0.7 : 1, transition: 'background 0.2s' }}>
        {saving ? 'A guardar...' : saved ? '✓ Guardado' : 'Guardar horários'}
      </button>
      <p style={{ fontSize: 11, color: 'var(--yb-subtle)', marginTop: 6, textAlign: 'center' }}>Propagação máxima: 60 segundos (cache PHP)</p>
    </div>
  );
}

// ── Depot Panel ───────────────────────────────────────────────────────────────

type DepotItem = { name: string; address: string; maxKm: number };
const EMPTY_DEPOT: DepotItem = { name: '', address: '', maxKm: 50 };

function DepotPanel() {
  const [depots, setDepots] = useState<DepotItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newDepot, setNewDepot] = useState<DepotItem>(EMPTY_DEPOT);

  useEffect(() => {
    fetch('/api/routing-config')
      .then((r) => r.json())
      .then((d) => setDepots(d.config?.partnerDepots ?? []))
      .finally(() => setLoading(false));
  }, []);

  function updateDepot(idx: number, field: keyof DepotItem, value: string | number) {
    setDepots((ds) => ds.map((d, i) => i === idx ? { ...d, [field]: value } : d));
  }

  function deleteDepot(idx: number) {
    setDepots((ds) => ds.filter((_, i) => i !== idx));
  }

  function addDepot() {
    if (!newDepot.name.trim() || !newDepot.address.trim()) { setError('Nome e morada são obrigatórios'); return; }
    setDepots((ds) => [...ds, { ...newDepot, name: newDepot.name.trim(), address: newDepot.address.trim() }]);
    setNewDepot(EMPTY_DEPOT);
    setShowAdd(false);
    setError('');
  }

  async function save() {
    setError(''); setSaving(true); setSaved(false);
    try {
      const res = await fetch('/api/routing-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnerDepots: depots }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) setError(data.error ?? 'Erro ao guardar');
      else { setSaved(true); setTimeout(() => setSaved(false), 2000); }
    } catch (e: any) { setError('Erro de rede: ' + e.message); }
    finally { setSaving(false); }
  }

  if (loading) return <p style={{ fontSize: 13, color: 'var(--yb-subtle)' }}>A carregar...</p>;

  const cardS: React.CSSProperties = { background: 'var(--yb-card)', borderRadius: 10, border: `1px solid ${BORDER}`, padding: '14px 18px', marginBottom: 10 };
  const inpS: React.CSSProperties = { padding: '5px 8px', border: `1.5px solid ${BORDER}`, borderRadius: 7, fontSize: 13, outline: 'none', background: 'var(--yb-input)', color: 'var(--yb-fg)', colorScheme: 'inherit' as const, width: '100%' };

  return (
    <div>
      <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 18, color: NAVY, margin: '0 0 4px' }}>Depósitos Parceiro 24h</h2>
      <p style={{ fontSize: 13, color: 'var(--yb-muted)', marginBottom: 16 }}>
        Localizações de entrega ao parceiro. O bot calcula o preço da recolha até ao depósito mais próximo dentro do limite de km. Se nenhum depósito estiver dentro do limite, escala para operador.
      </p>

      {depots.map((d, idx) => (
        <div key={idx} style={cardS}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 100 }}>
              <span style={{ fontSize: 10, color: 'var(--yb-subtle)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Nome</span>
              <input value={d.name} onChange={(e) => updateDepot(idx, 'name', e.target.value)} style={inpS} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 3, minWidth: 160 }}>
              <span style={{ fontSize: 10, color: 'var(--yb-subtle)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Morada (para geocoding)</span>
              <input value={d.address} placeholder="ex: Alfragide, Amadora, Portugal" onChange={(e) => updateDepot(idx, 'address', e.target.value)} style={{ ...inpS, fontFamily: 'monospace', fontSize: 12 }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: 90 }}>
              <span style={{ fontSize: 10, color: 'var(--yb-subtle)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Máx. km</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <input type="number" min={1} max={500} value={d.maxKm}
                  onChange={(e) => updateDepot(idx, 'maxKm', parseInt(e.target.value) || 50)}
                  style={{ ...inpS, width: 60, textAlign: 'right' }} />
                <span style={{ fontSize: 12, color: 'var(--yb-muted)' }}>km</span>
              </div>
            </div>
            <button onClick={() => deleteDepot(idx)}
              style={{ flexShrink: 0, background: 'none', border: `1.5px solid rgba(239,68,68,0.3)`, borderRadius: 7, padding: '5px 11px', cursor: 'pointer', fontSize: 18, color: '#f87171', lineHeight: 1 }}
              title="Remover depósito">×</button>
          </div>
        </div>
      ))}

      {depots.length === 0 && !showAdd && (
        <div style={{ ...cardS, textAlign: 'center', color: 'var(--yb-subtle)', fontSize: 13 }}>
          Nenhum depósito configurado — o suplemento fixo "acima 25km" das tarifas será usado.
        </div>
      )}

      {showAdd ? (
        <div style={{ ...cardS, borderStyle: 'dashed', background: 'rgba(0,188,212,0.04)' }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: NAVY, margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: 0.5 }}>Novo depósito</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 100 }}>
              <span style={{ fontSize: 10, color: 'var(--yb-subtle)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Nome *</span>
              <input value={newDepot.name} placeholder="ex: Alfragide" onChange={(e) => setNewDepot((n) => ({ ...n, name: e.target.value }))} style={inpS} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 3, minWidth: 160 }}>
              <span style={{ fontSize: 10, color: 'var(--yb-subtle)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Morada *</span>
              <input value={newDepot.address} placeholder="Alfragide, Amadora, Portugal" onChange={(e) => setNewDepot((n) => ({ ...n, address: e.target.value }))} style={{ ...inpS, fontFamily: 'monospace', fontSize: 12 }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: 90 }}>
              <span style={{ fontSize: 10, color: 'var(--yb-subtle)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Máx. km</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <input type="number" min={1} max={500} value={newDepot.maxKm}
                  onChange={(e) => setNewDepot((n) => ({ ...n, maxKm: parseInt(e.target.value) || 50 }))}
                  style={{ ...inpS, width: 60, textAlign: 'right' }} />
                <span style={{ fontSize: 12, color: 'var(--yb-muted)' }}>km</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button onClick={addDepot} style={{ padding: '7px 14px', background: CYAN, color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>Adicionar</button>
              <button onClick={() => { setShowAdd(false); setError(''); setNewDepot(EMPTY_DEPOT); }} style={{ padding: '7px 12px', background: 'none', border: `1.5px solid ${BORDER}`, borderRadius: 7, cursor: 'pointer', fontSize: 13, color: 'var(--yb-muted)' }}>Cancelar</button>
            </div>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)} style={{ width: '100%', padding: '10px', border: `1.5px dashed ${BORDER}`, borderRadius: 8, background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--yb-muted)', marginBottom: 10 }}>
          + Adicionar depósito
        </button>
      )}

      {error && <p style={{ fontSize: 12, color: '#f87171', margin: '0 0 8px' }}>{error}</p>}

      <button onClick={save} disabled={saving}
        style={{ width: '100%', padding: '11px 20px', borderRadius: 8, border: 'none', cursor: saving ? 'default' : 'pointer', background: saved ? '#166534' : CYAN, color: '#fff', fontSize: 14, fontWeight: 700, opacity: saving ? 0.7 : 1, transition: 'background 0.2s' }}>
        {saving ? 'A guardar...' : saved ? '✓ Guardado' : 'Guardar depósitos'}
      </button>
      <p style={{ fontSize: 11, color: 'var(--yb-subtle)', marginTop: 6 }}>
        Se a recolha estiver fora do limite de todos os depósitos, o bot escala automaticamente para operador com mensagem de cotação personalizada.
      </p>
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
        <p style={{ fontSize: 11, color: 'var(--yb-muted)', margin: 0 }}>{description}</p>
      </div>
      <button onClick={onChange} style={{ position: 'relative', width: 44, height: 24, background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }} role="switch" aria-checked={checked}>
        <span style={{ position: 'absolute', inset: 0, borderRadius: 12, background: checked ? CYAN : 'rgba(255,255,255,0.15)', transition: 'background 0.2s' }} />
        <span style={{ position: 'absolute', top: 3, borderRadius: '50%', background: '#fff', width: 18, height: 18, left: checked ? 23 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
      </button>
    </div>
  );
}
