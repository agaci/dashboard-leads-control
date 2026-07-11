'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { MiniMap } from '../MiniMap';
import { DeleteDialog } from '../DeleteDialog';

const CYAN   = '#00bcd4';
const NAVY   = '#1a2332';
const YB_BG  = '#f5f6fa';
const BORDER = '#dde1e8';

type ConvStep =
  | 'INIT' | 'COLLECTING_ORIGEM' | 'COLLECTING_DESTINO' | 'COLLECTING_VIATURA'
  | 'COLLECTING_URGENCIA' | 'COLLECTING_WEIGHT' | 'CALCULATING_PRICE'
  | 'PRESENTING_PRICE' | 'PRESENTING_PARTNER_PRICE' | 'HANDLING_OBJECTION'
  | 'COLLECTING_NOME' | 'COLLECTING_EMAIL'
  | 'COLLECTING_ORIGEM_COMPLETA' | 'CONFIRMING_ORIGEM_COMPLETA'
  | 'COLLECTING_DESTINO_COMPLETA' | 'CONFIRMING_DESTINO_COMPLETA'
  | 'COLLECTING_DETALHES_RECOLHA' | 'COLLECTING_DETALHES_ENTREGA'
  | 'AWAITING_PAYMENT'
  | 'LIVE_CHAT'
  | 'QUIZ_IN_PROGRESS'
  | 'LEAD_REGISTERED' | 'ESCALATED_TO_HUMAN' | 'CLOSED';

type Message = {
  role: 'lead' | 'bot' | 'bo' | 'step';
  text: string;
  timestamp: string;
  situacaoId?: string;
  step?: string;
  stepIndex?: number | null;
  total?: number | null;
  value?: string | null;
};

type AggHintItem = {
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
};

type ConvSummary = {
  _id: string;
  telemovel: string;
  canal: string;
  step: ConvStep;
  data: Record<string, any>;
  updatedAt: string;
  createdAt: string;
  escalatedAt?: string;
  history: Message[];
  aggHints?: AggHintItem[];
  aggHintsSeen?: boolean;
  aggHintsAt?: string;
  contactRequestOpen?: boolean;
  contactRequestChannel?: string | null;
  quizVariante?: string | null;
  leadId?: string;
  clientMatch?: { serviceNr?: number | null; score?: number; matchedOn?: string[]; serviceRoute?: string | null; serviceAt?: string | null } | null;
};

type ConvFull = ConvSummary & { history: Message[] };

const STEP_LABEL: Record<ConvStep, string> = {
  INIT: 'Início',
  COLLECTING_ORIGEM: 'Recolha',
  COLLECTING_DESTINO: 'Entrega',
  COLLECTING_VIATURA: 'Viatura',
  COLLECTING_URGENCIA: 'Urgência',
  COLLECTING_WEIGHT: 'Peso',
  CALCULATING_PRICE: 'A calcular...',
  PRESENTING_PRICE: 'Preço apresentado',
  PRESENTING_PARTNER_PRICE: 'Preço parceiro',
  HANDLING_OBJECTION: 'Objecção',
  COLLECTING_NOME: 'Nome',
  COLLECTING_EMAIL: 'Email',
  COLLECTING_ORIGEM_COMPLETA: 'Morada recolha',
  CONFIRMING_ORIGEM_COMPLETA: 'Confirmar recolha',
  COLLECTING_DESTINO_COMPLETA: 'Morada entrega',
  CONFIRMING_DESTINO_COMPLETA: 'Confirmar entrega',
  COLLECTING_DETALHES_RECOLHA: 'Contacto recolha',
  COLLECTING_DETALHES_ENTREGA: 'Contacto entrega',
  AWAITING_PAYMENT: 'A aguardar pagamento',
  LIVE_CHAT: 'Chat ao vivo',
  QUIZ_IN_PROGRESS: 'Quiz em curso',
  LEAD_REGISTERED: 'Lead registada',
  ESCALATED_TO_HUMAN: 'Escalada',
  CLOSED: 'Fechada',
};

type BadgeStyle = { background: string; color: string };

const STEP_STYLE: Partial<Record<ConvStep, BadgeStyle>> = {
  AWAITING_PAYMENT:   { background: 'hsl(var(--warning-soft))',        color: 'hsl(var(--warning))' },
  LIVE_CHAT:          { background: 'hsl(var(--purple-soft))',          color: 'hsl(var(--purple))' },
  ESCALATED_TO_HUMAN: { background: 'hsl(var(--destructive) / 0.12)',   color: 'hsl(var(--destructive))' },
  LEAD_REGISTERED:    { background: 'hsl(var(--success-soft))',         color: 'hsl(var(--success))' },
  CLOSED:             { background: 'hsl(var(--secondary))',            color: 'hsl(var(--muted-foreground))' },
};

const DEFAULT_STEP_STYLE: BadgeStyle = { background: 'hsl(var(--cyan-soft))', color: 'hsl(var(--cyan))' };

function stepStyle(step: ConvStep): BadgeStyle {
  return STEP_STYLE[step] ?? DEFAULT_STEP_STYLE;
}

function isRealPhone(tel?: string) {
  return tel && !tel.startsWith('web_');
}

// Melhor telefone disponível: o quiz guarda em data.telefone; outros canais em
// data.telemovel ou no telemovel de topo. Ignora placeholders "web_quiz_...".
function bestPhone(c: { telemovel?: string; data?: Record<string, any> }): string | null {
  for (const t of [c.data?.telefone, c.data?.telemovel, c.telemovel]) {
    if (isRealPhone(t)) return t as string;
  }
  return null;
}

export default function ConversasPage({ initialConvId, onGoToAgg, isMobile = false }: { initialConvId?: string; onGoToAgg?: (convId: string) => void; isMobile?: boolean }) {
  const { data: session } = useSession();
  const isAdmin = (session?.user as any)?.role === 'administrator';
  const [conversations, setConversations] = useState<ConvSummary[]>([]);
  const [selected, setSelected] = useState<ConvFull | null>(null);
  const [confirmDelConv, setConfirmDelConv] = useState(false);
  const [deletingConv, setDeletingConv] = useState(false);
  const [delConvError, setDelConvError] = useState<string | null>(null);
  const [clientBusy, setClientBusy] = useState(false);
  const [filter, setFilter] = useState<'active' | 'escalated' | 'contact' | 'clientmatch' | 'closed' | 'all'>('active');
  const [dateFilter, setDateFilter] = useState<'all' | 'hoje' | 'ontem' | 'semana' | 'custom'>('hoje');
  const [customDate, setCustomDate] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [counts, setCounts] = useState<{ active: number; escalated: number; contact: number; clientmatch: number; closed: number; all: number }>({ active: 0, escalated: 0, contact: 0, clientmatch: 0, closed: 0, all: 0 });
  const chatEndRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoSelectedRef = useRef(false);
  const [showDatePopover, setShowDatePopover] = useState(false);
  const datePopoverRef = useRef<HTMLDivElement>(null);

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
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);
    return `&dateFrom=${dayStr(monday)}T00:00:00.000Z`;
  }

  const fetchCounts = useCallback(async () => {
    const dp = buildDateParams(dateFilter);
    const qs = dp ? `?${dp.slice(1)}` : '';
    const res = await fetch(`/api/conversations/counts${qs}`);
    const data = await res.json();
    if (data.success) setCounts(data.counts);
  }, [dateFilter, customDate]);

  const fetchList = useCallback(async () => {
    const dateParams = buildDateParams(dateFilter);
    const res = await fetch(`/api/conversations?status=${filter}&limit=60${dateParams}`);
    const data = await res.json();
    if (data.success) setConversations(data.conversations);
    setLoading(false);
    fetchCounts();
  }, [filter, dateFilter, fetchCounts]);

  const fetchSelected = useCallback(async (id: string) => {
    const res = await fetch(`/api/conversations/${id}`);
    const data = await res.json();
    if (data.success) {
      setSelected(data.conversation);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  }, []);

  // "Atendido" — desliga o alarme do pedido de contacto neste cartão.
  const ackContact = useCallback(async (id: string) => {
    setConversations((prev) => prev.map((c) => (c._id === id ? { ...c, contactRequestOpen: false } : c)));
    try {
      await fetch('/api/contact-request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ convId: id }),
      });
    } catch { /* silencioso */ }
    fetchList();
  }, [fetchList]);

  // Apagar conversa (só administrador, com código) — hard delete, sai das estatísticas.
  // alsoDeleteLead: apaga também a lead associada (apagar a conversa não a apaga sozinha).
  const deleteConv = useCallback(async (code: string, alsoDeleteLead: boolean) => {
    if (!selected?._id) return;
    setDeletingConv(true);
    setDelConvError(null);
    try {
      const res = await fetch(`/api/conversations/${selected._id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, alsoDeleteLead }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        const id = selected._id;
        setConversations((prev) => prev.filter((c) => c._id !== id));
        setSelected(null);
        setConfirmDelConv(false);
        fetchList();
      } else {
        setDelConvError(j.error || 'Falha ao apagar.');
      }
    } catch { setDelConvError('Falha ao apagar.'); }
    setDeletingConv(false);
  }, [selected?._id, fetchList]);

  // Sugestão "provável cliente": confirmar (inbox -> lead + cliente) ou dispensar.
  const clientSuggestion = useCallback(async (id: string, action: 'confirm' | 'dismiss') => {
    setClientBusy(true);
    try {
      const res = await fetch(`/api/conversations/${id}/confirm-client`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        setConversations((prev) => prev.map((c) => (c._id === id ? { ...c, clientMatch: null } : c)));
        if (selected?._id === id) fetchSelected(id);
        fetchList();
      } else {
        alert('Falha ao processar a sugestão.');
      }
    } catch { alert('Falha ao processar a sugestão.'); }
    setClientBusy(false);
  }, [fetchList, fetchSelected, selected?._id]);

  // Polling lista
  useEffect(() => {
    fetchList();
    const interval = setInterval(fetchList, 10000);
    return () => clearInterval(interval);
  }, [fetchList]);

  // Polling conversa aberta
  useEffect(() => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    if (!selected?._id) return;
    const isActive = !['LEAD_REGISTERED', 'CLOSED', 'ESCALATED_TO_HUMAN'].includes(selected.step);
    if (!isActive) return;
    pollingRef.current = setInterval(() => fetchSelected(selected._id), 5000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [selected?._id, selected?.step, fetchSelected]);

  useEffect(() => { setLoading(true); }, [filter, dateFilter]);

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

  // Abrir conversa específica quando vindo do toast de agregação
  useEffect(() => {
    if (!initialConvId) return;
    setFilter('all');
    fetchSelected(initialConvId);
  }, [initialConvId, fetchSelected]);

  // Auto-seleccionar a conversa mais recente na primeira carga
  useEffect(() => {
    if (autoSelectedRef.current) return;
    if (initialConvId) return;
    if (conversations.length === 0) return;
    autoSelectedRef.current = true;
    fetchSelected(conversations[0]._id);
  }, [conversations, initialConvId, fetchSelected]);

  async function openConv(id: string) {
    setPendingStep(null);
    await fetchSelected(id);
  }

  async function sendReply() {
    if (!reply.trim() || !selected?._id) return;
    setSending(true);
    await fetch(`/api/conversations/${selected._id}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: reply.trim() }),
    });
    setReply('');
    setSending(false);
    await fetchSelected(selected._id);
    fetchList();
  }

  function refCode(id: string) {
    return '#' + id.slice(-5).toUpperCase();
  }

  function formatTime(ts: string) {
    return new Date(ts).toLocaleString('pt-PT', {
      timeZone: 'Europe/Lisbon',
      day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  }

  function formatTimeShort(ts: string) {
    return new Date(ts).toLocaleTimeString('pt-PT', {
      timeZone: 'Europe/Lisbon',
      hour: '2-digit', minute: '2-digit',
    });
  }

  const canReply = selected && selected.canal !== 'web-quiz' && !['LEAD_REGISTERED', 'CLOSED'].includes(selected.step);

  const [pendingStep, setPendingStep] = useState<'LEAD_REGISTERED' | 'CLOSED' | null>(null);

  const CLOSE_REASONS: Record<'LEAD_REGISTERED' | 'CLOSED', string[]> = {
    LEAD_REGISTERED: ['Confirmou e pagou', 'Confirmou sem pagamento', 'Retomou mais tarde', 'Outro'],
    CLOSED:          ['Preço alto', 'Não disponível', 'Desistiu', 'Lead duplicada', 'Outro'],
  };

  async function confirmClose(step: 'LEAD_REGISTERED' | 'CLOSED', reason?: string) {
    if (!selected?._id) return;
    setPendingStep(null);
    await fetch(`/api/conversations/${selected._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step, closeReason: reason ?? null }),
    });
    await fetchSelected(selected._id);
    fetchList();
  }

  return (
    <div className="flex h-full bg-background">
      {/* ── Lista de conversas ──────────────────────────────── */}
      <div className={`${isMobile ? 'w-full' : 'w-[460px]'} shrink-0 flex flex-col border-r border-border bg-card${isMobile && selected ? ' hidden' : ''}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h1 className="text-xl font-bold tracking-tight text-foreground">Inbox</h1>
          <button onClick={fetchList} className="text-muted-foreground hover:text-foreground" title="Actualizar">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
          </button>
        </div>

        {/* Pesquisa */}
        <div className="px-5 pb-3">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              type="text"
              placeholder="Nome, telefone, rota..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-secondary/60 pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:bg-background"
            />
          </div>
        </div>

        {/* Filtros de estado — grid p/ linhas equilibradas (nunca 1 botao sozinho) */}
        <div className="grid grid-cols-3 gap-1 px-5 pb-2">
          {(['active', 'escalated', 'contact', 'clientmatch', 'all', 'closed'] as const).map((f) => {
            const label = f === 'active' ? 'Activas' : f === 'escalated' ? 'Escaladas' : f === 'contact' ? 'Contacto' : f === 'clientmatch' ? 'Prov. cliente' : f === 'closed' ? 'Fechadas' : 'Todas';
            const count = counts[f];
            const active = filter === f;
            const isEscalated = f === 'escalated';
            const isContact = f === 'contact';
            const isClientMatch = f === 'clientmatch';
            const contactAlarm = isContact && count > 0; // pedidos por atender -> destacar
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`flex w-full items-center justify-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold whitespace-nowrap transition-colors ${
                  active
                    ? (isContact ? 'border-red-400 bg-red-500/15 text-red-600'
                       : isClientMatch ? 'border-emerald-400 bg-emerald-500/15 text-emerald-700'
                       : 'border-cyan bg-cyan-soft text-cyan')
                    : contactAlarm
                      ? 'border-red-300 bg-red-500/10 text-red-600 animate-pulse'
                      : isClientMatch && count > 0
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-border bg-secondary/50 text-muted-foreground hover:bg-muted'
                }`}
              >
                {label}
                {count > 0 && (
                  <span className={`inline-flex h-4 min-w-4 items-center justify-center rounded px-1 text-[9px] font-bold text-white ${
                    isContact ? 'bg-red-500' : isClientMatch ? 'bg-emerald-500' : isEscalated ? 'bg-destructive' : f === 'active' ? 'bg-cyan' : 'bg-orange'
                  }`}>
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Filtros de data */}
        <div className="flex flex-wrap gap-1 px-5 pb-4">
          {(['all', 'hoje', 'ontem', 'semana'] as const).map((df) => {
            const label = df === 'all' ? 'Sempre' : df === 'hoje' ? 'Hoje' : df === 'ontem' ? 'Ontem' : 'Semana';
            const active = dateFilter === df;
            return (
              <button
                key={df}
                onClick={() => setDateFilter(df)}
                className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  active ? 'border-brand-purple bg-brand-purple-soft text-brand-purple' : 'border-border bg-secondary/50 text-muted-foreground hover:bg-muted'
                }`}
              >
                {label}
              </button>
            );
          })}
          {/* Date picker popover */}
          <div className="relative">
            <button
              onClick={() => setShowDatePopover((v) => !v)}
              className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                dateFilter === 'custom' ? 'border-brand-purple bg-brand-purple-soft text-brand-purple' : 'border-border bg-secondary/50 text-muted-foreground hover:bg-muted'
              }`}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              {dateFilter === 'custom' && customDate ? customDate.slice(5).replace('-', '/') : 'Data'}
            </button>
            {showDatePopover && (
              <div
                ref={datePopoverRef}
                className="absolute right-0 top-full mt-1.5 z-50 w-64 max-w-[calc(100vw-24px)] rounded-xl border border-border bg-card shadow-elevated p-4"
              >
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Escolher data</p>
                <input
                  type="date"
                  value={customDate}
                  max={new Date().toISOString().slice(0, 10)}
                  autoFocus
                  onChange={(e) => {
                    setCustomDate(e.target.value);
                    setDateFilter('custom');
                    setFilter('all');
                    setShowDatePopover(false);
                  }}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
                />
                {customDate && (
                  <p className="mt-2 text-center text-xs text-muted-foreground">
                    {new Date(customDate + 'T12:00:00').toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1.5">
          {loading && <p className="py-8 text-center text-sm text-muted-foreground">A carregar...</p>}
          {!loading && conversations.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">Sem conversas</p>
          )}
          {(() => {
            const q = search.trim().toLowerCase();
            const visible = q
              ? conversations.filter((c) => {
                  const nome  = (c.data?.nome ?? '').toLowerCase();
                  const tel   = (c.telemovel ?? '').toLowerCase();
                  const orig  = (c.data?.origem ?? '').toLowerCase();
                  const dest  = (c.data?.destino ?? '').toLowerCase();
                  return nome.includes(q) || tel.includes(q) || orig.includes(q) || dest.includes(q);
                })
              : conversations;
            if (!loading && q && visible.length === 0)
              return <p className="py-10 text-center text-sm text-muted-foreground">Sem resultados para &ldquo;{search}&rdquo;</p>;
            return visible.map((conv) => {
              const lastMsg = conv.history?.[0];
              const isSelected = selected?._id === conv._id;
              const phone = bestPhone(conv);
              return (
                <button
                  key={conv._id}
                  onClick={() => openConv(conv._id)}
                  className={`w-full rounded-xl p-4 text-left transition-all shadow-card ${
                    conv.contactRequestOpen
                      ? 'bg-red-50 border-l-[3px] border-red-500 ring-1 ring-red-400/60'
                      : isSelected
                        ? 'bg-cyan-soft border-l-[3px] border-cyan'
                        : 'bg-card hover:shadow-elevated border-l-[3px] border-transparent'
                  }`}
                >
                  {conv.contactRequestOpen && (
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white animate-pulse">
                        <span className="w-1.5 h-1.5 rounded-full bg-white" />
                        Pede contacto{conv.contactRequestChannel ? ` · ${conv.contactRequestChannel === 'whatsapp' ? 'WhatsApp' : 'Email'}` : ''}
                      </span>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); ackContact(conv._id); }}
                        className="cursor-pointer rounded-md bg-[#1a2332] px-2.5 py-1 text-[10px] font-bold text-white hover:opacity-80"
                      >
                        Atendido
                      </span>
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-[15px] font-semibold text-foreground truncate">
                      {conv.data?.nome ?? refCode(conv._id)}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">{formatTime(conv.updatedAt)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={stepStyle(conv.step)}>
                      {STEP_LABEL[conv.step]}
                    </span>
                    <span className="text-[11px] text-muted-foreground">{conv.canal}</span>
                    {conv.quizVariante && (
                      <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-200">
                        {conv.quizVariante}
                      </span>
                    )}
                  </div>
                  {lastMsg && (
                    <p className="text-xs text-muted-foreground truncate">
                      <span className={`inline-block w-2.5 h-2.5 rounded-full mr-1 align-middle ${lastMsg.role === 'lead' ? 'bg-secondary-foreground/40' : lastMsg.role === 'bo' ? 'bg-cyan' : lastMsg.role === 'step' ? 'bg-cyan' : 'bg-orange'}`} />
                      {lastMsg.text.replace(/\*/g, '').replace(/\n/g, ' ').slice(0, 55)}
                    </p>
                  )}
                  {conv.data?.origem && (
                    <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">
                      {conv.data.origem.split(',')[0]} → {(conv.data.destino ?? '...').split(',')[0]}
                    </p>
                  )}
                  {(phone || conv.data?.email || conv.data?.viatura) && (
                    <p className="text-[10px] text-muted-foreground/75 mt-0.5 truncate">
                      {phone && <span className="mr-2 font-medium">{phone}</span>}
                      {conv.data?.viatura && <span className="mr-2">{conv.data.viatura}</span>}
                      {conv.data?.email && <span>{conv.data.email}</span>}
                    </p>
                  )}
                  {conv.data?.notas && (
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5 truncate italic">{conv.data.notas}</p>
                  )}
                  {conv.aggHints && conv.aggHints.length > 0 && (
                    <div className="flex items-center gap-1 mt-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border ${conv.aggHintsSeen ? 'bg-secondary text-muted-foreground border-border' : 'bg-warning-soft text-warning border-warning/30'}`}>
                        ◈ {conv.aggHints.length} agreg.
                      </span>
                    </div>
                  )}
                  {conv.clientMatch && (
                    <div className="flex items-center gap-1 mt-1.5">
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200">
                        Provável cliente{conv.clientMatch.serviceNr ? ` · nr ${conv.clientMatch.serviceNr}` : ''}
                      </span>
                    </div>
                  )}
                </button>
              );
            });
          })()}
        </div>
      </div>

      {/* ── Painel de chat ──────────────────────────────────── */}
      {(!isMobile || selected) && (
      <div className="flex-1 flex flex-col bg-background overflow-hidden" style={{ display: isMobile && !selected ? 'none' : 'flex' }}>
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            Seleccione uma conversa
          </div>
        ) : (
          <>
            {/* Header da conversa */}
            <div className="bg-card px-5 py-3 flex-shrink-0 border-b border-border">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  {isMobile && (
                    <button onClick={() => setSelected(null)} className="text-muted-foreground text-lg leading-none pt-0.5 pr-1 shrink-0 bg-transparent border-none cursor-pointer">
                      ←
                    </button>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-foreground">
                        {selected.data?.nome ?? refCode(selected._id)}
                      </span>
                      {selected.data?.nome && (
                        <span className="text-xs text-muted-foreground font-mono">{refCode(selected._id)}</span>
                      )}
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={stepStyle(selected.step)}>
                        {STEP_LABEL[selected.step]}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
                      {bestPhone(selected) && (
                        isMobile
                          ? <a href={`tel:+351${String(bestPhone(selected)).replace(/\D/g, '')}`} className="font-semibold text-foreground hover:underline">{bestPhone(selected)}</a>
                          : <span className="font-semibold text-foreground select-all">{bestPhone(selected)}</span>
                      )}
                      {selected.data?.email && (
                        isMobile
                          ? <a href={`mailto:${selected.data.email}`} className="truncate max-w-[220px] hover:underline">{selected.data.email}</a>
                          : <span className="truncate max-w-[220px] select-all">{selected.data.email}</span>
                      )}
                      {selected.data?.origem && (
                        <span className="truncate max-w-[200px] md:max-w-none">
                          {selected.data.origem.split(',')[0]} → {(selected.data.destino ?? '').split(',')[0]}
                        </span>
                      )}
                      {selected.data?.urgencia && <span>{selected.data.urgencia}</span>}
                      {selected.data?.weightKg && <span>{selected.data.weightKg} kg</span>}
                      {(selected.data?.partnerFinalPrice ?? selected.data?.priceWithDiscount) != null && (
                        <span className="text-success font-semibold">
                          €{(selected.data.serviceType === 'arrasto'
                            ? (selected.data.partnerFinalPrice ?? selected.data.priceWithDiscount)
                            : (selected.data.priceWithDiscount ?? selected.data.partnerFinalPrice)
                          )!.toFixed(2)}
                        </span>
                      )}
                      {selected.data?.geo && (() => {
                        const g: any = selected.data.geo;
                        const isGps = g.source === 'gps';
                        const txt = isGps
                          ? (g.address ? String(g.address).split(',').slice(0, 2).join(',').trim() : (g.lat != null ? `${Number(g.lat).toFixed(4)}, ${Number(g.lng).toFixed(4)}` : ''))
                          : [g.city, g.region].filter(Boolean).join(', ');
                        if (!txt) return null;
                        const maps = (g.lat != null && g.lng != null) ? `https://www.google.com/maps?q=${g.lat},${g.lng}` : null;
                        const body = (
                          <span className={`inline-flex items-center gap-0.5 ${isGps ? 'text-cyan font-medium' : ''}`}>
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                            {txt} {isGps ? '(GPS)' : '(aprox.)'}
                          </span>
                        );
                        return maps ? <a href={maps} target="_blank" rel="noopener" className="hover:underline">{body}</a> : body;
                      })()}
                    </div>
                  </div>
                </div>
                <div className="hidden md:flex items-center gap-2 shrink-0">
                  {!['LEAD_REGISTERED', 'CLOSED'].includes(selected.step) && (
                    <>
                      <button onClick={() => setPendingStep(pendingStep === 'LEAD_REGISTERED' ? null : 'LEAD_REGISTERED')} className="px-3 py-1 text-xs rounded-lg font-semibold bg-success-soft text-success hover:bg-success/20 transition-colors">
                        Resolvida
                      </button>
                      <button onClick={() => setPendingStep(pendingStep === 'CLOSED' ? null : 'CLOSED')} className="px-3 py-1 text-xs rounded-lg font-semibold bg-secondary text-muted-foreground hover:bg-muted transition-colors">
                        Fechar
                      </button>
                    </>
                  )}
                  {isAdmin && (
                    <button onClick={() => setConfirmDelConv(true)} title="Apagar conversa (administrador)" className="p-1.5 rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {selected.history?.length ?? 0} msgs · {formatTime(selected.createdAt)}
                  </span>
                </div>
              </div>
              <div className="flex md:hidden items-center gap-2 mt-2">
                {!['LEAD_REGISTERED', 'CLOSED'].includes(selected.step) && (
                  <>
                    <button onClick={() => setPendingStep(pendingStep === 'LEAD_REGISTERED' ? null : 'LEAD_REGISTERED')} className="px-3 py-1 text-xs rounded-lg font-semibold bg-success-soft text-success hover:bg-success/20 transition-colors">
                      Resolvida
                    </button>
                    <button onClick={() => setPendingStep(pendingStep === 'CLOSED' ? null : 'CLOSED')} className="px-3 py-1 text-xs rounded-lg font-semibold bg-secondary text-muted-foreground hover:bg-muted transition-colors">
                      Fechar
                    </button>
                  </>
                )}
                {isAdmin && (
                  <button onClick={() => setConfirmDelConv(true)} title="Apagar conversa" className="p-1.5 rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-600">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                )}
                <span className="text-xs text-muted-foreground ml-auto">
                  {selected.history?.length ?? 0} msgs · {formatTime(selected.createdAt)}
                </span>
              </div>
            </div>

            <DeleteDialog
              open={confirmDelConv}
              kind="conversation"
              linkedLabel={selected.leadId ? `lead${selected.data?.nome ? ` de ${selected.data.nome}` : ''}` : null}
              busy={deletingConv}
              error={delConvError}
              onConfirm={(code, also) => deleteConv(code, also)}
              onCancel={() => { setConfirmDelConv(false); setDelConvError(null); }}
            />

            {/* Picker de motivo inline */}
            {pendingStep && (
              <div className={`flex items-center gap-2 flex-wrap px-5 py-2 shrink-0 border-b ${pendingStep === 'LEAD_REGISTERED' ? 'bg-success-soft border-success/20' : 'bg-secondary border-border'}`}>
                <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap">Motivo:</span>
                {CLOSE_REASONS[pendingStep].map(reason => (
                  <button key={reason} onClick={() => confirmClose(pendingStep, reason)}
                    className="text-xs px-2.5 py-1 rounded-lg border border-border bg-card text-foreground hover:bg-muted cursor-pointer transition-colors">
                    {reason}
                  </button>
                ))}
                <button onClick={() => confirmClose(pendingStep)}
                  className="text-xs px-2.5 py-1 text-muted-foreground cursor-pointer bg-transparent border-none hover:text-foreground">
                  Sem motivo →
                </button>
                <button onClick={() => setPendingStep(null)}
                  className="ml-auto text-muted-foreground bg-transparent border-none cursor-pointer text-base leading-none hover:text-foreground">
                  ×
                </button>
              </div>
            )}

            {/* Banner "provável cliente" — sugestão de reconciliação */}
            {selected.clientMatch && (
              <div className="flex items-center gap-3 flex-wrap px-5 py-2.5 shrink-0 bg-emerald-50 border-b border-emerald-200">
                <span className="text-[9px] font-extrabold tracking-[0.1em] uppercase bg-emerald-600 text-white px-1.5 py-0.5 rounded shrink-0">Provável cliente</span>
                <span className="text-xs text-foreground">
                  Provavelmente passou a cliente na YourBox
                  {selected.clientMatch.serviceNr ? ` — serviço nr ${selected.clientMatch.serviceNr}` : ''}
                  {typeof selected.clientMatch.score === 'number' ? ` (${selected.clientMatch.score}%)` : ''}
                  {selected.clientMatch.matchedOn?.length ? ` · ${selected.clientMatch.matchedOn.join(', ')}` : ''}
                </span>
                <div className="ml-auto flex items-center gap-2">
                  <button disabled={clientBusy} onClick={() => clientSuggestion(selected._id, 'confirm')}
                    className="px-3 py-1 rounded-lg bg-emerald-600 text-white text-xs font-bold cursor-pointer border-none hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                    {clientBusy ? '...' : 'Confirmar cliente'}
                  </button>
                  <button disabled={clientBusy} onClick={() => clientSuggestion(selected._id, 'dismiss')}
                    className="px-3 py-1 rounded-lg bg-secondary text-muted-foreground text-xs font-semibold cursor-pointer border-none hover:bg-muted disabled:opacity-50 transition-colors">
                    Ignorar
                  </button>
                </div>
              </div>
            )}

            {/* Banner de agregação */}
            {selected.aggHints && selected.aggHints.length > 0 && (
              <div className="flex items-center gap-3 flex-wrap px-5 py-2 shrink-0 bg-warning-soft border-b border-warning/30">
                <span className="text-[9px] font-extrabold tracking-[0.1em] uppercase bg-warning text-foreground px-1.5 py-0.5 rounded shrink-0">AGREGAÇÃO</span>
                <span className="text-xs font-bold text-warning">
                  {selected.aggHints.length} hipótese{selected.aggHints.length > 1 ? 's' : ''} · melhor {selected.aggHints[0].score}%
                </span>
                <span className="text-xs text-muted-foreground">
                  {selected.aggHints[0].pickup?.split(',')[0]} → {selected.aggHints[0].delivery?.split(',')[0]}
                  {selected.aggHints[0].driver && (
                    <span className="ml-2 font-semibold text-foreground">· {selected.aggHints[0].driver.name}</span>
                  )}
                </span>
                {onGoToAgg && (
                  <button
                    onClick={() => onGoToAgg(selected._id)}
                    className="ml-auto px-3 py-1 rounded-lg bg-warning text-foreground text-xs font-bold cursor-pointer border-none whitespace-nowrap hover:bg-warning/80 transition-colors"
                  >
                    Ver agregações →
                  </button>
                )}
              </div>
            )}

            {/* Mini-mapa da localização do visitante */}
            {selected.data?.geo && (() => {
              const g: any = selected.data.geo;
              if (g.lat == null || g.lng == null) return null;
              const isGps = g.source === 'gps';
              return (
                <div className="px-4 pt-2 shrink-0">
                  <MiniMap lat={Number(g.lat)} lng={Number(g.lng)} zoom={isGps ? 16 : 11} exact={isGps} height={220} />
                </div>
              );
            })()}

            {/* Bolhas de chat */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
              {(selected.history ?? []).map((msg, i) =>
                msg.role === 'step'
                  ? <StepEntry key={i} msg={msg} timeStr={formatTimeShort(msg.timestamp)} />
                  : <ChatBubble key={i} msg={msg} timeStr={formatTimeShort(msg.timestamp)} />
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Campo de resposta */}
            {canReply ? (
              <div className="bg-card px-4 pt-2 pb-3 shrink-0 border-t border-border">
                {selected.canal === 'whatsapp' && (
                  <div className="flex items-center gap-1 mb-1.5">
                    <svg viewBox="0 0 24 24" width={13} height={13} fill="#25d366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.117 1.528 5.845L.057 23.571a.75.75 0 00.919.919l5.726-1.471A11.943 11.943 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.714 9.714 0 01-4.962-1.362l-.355-.212-3.683.945.963-3.585-.232-.369A9.714 9.714 0 012.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/></svg>
                    <span className="text-[10px] font-semibold" style={{ color: '#25d366' }}>Enviará via WhatsApp</span>
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendReply()}
                    placeholder={selected.canal === 'whatsapp' ? 'Responder via WhatsApp (Enter para enviar)...' : 'Responder manualmente (Enter para enviar)...'}
                    className="flex-1 h-10 rounded-lg border border-border bg-background px-4 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
                  />
                  <button
                    onClick={sendReply}
                    disabled={sending || !reply.trim()}
                    className="px-4 py-2 bg-cyan text-white text-sm font-semibold rounded-lg disabled:opacity-40 hover:bg-cyan/90 transition-colors cursor-pointer"
                  >
                    {sending ? '...' : 'Enviar'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-card px-4 py-2.5 text-xs text-center text-muted-foreground shrink-0 border-t border-border">
                {selected.canal === 'web-quiz' && selected.step === 'QUIZ_IN_PROGRESS'
                  ? 'Quiz em curso — a acompanhar em tempo real'
                  : selected.step === 'LEAD_REGISTERED' ? 'Lead registada — conversa concluída' : 'Conversa fechada'}
              </div>
            )}
          </>
        )}
      </div>
      )}
    </div>
  );
}

function StepEntry({ msg, timeStr }: { msg: Message; timeStr: string }) {
  const pos = (typeof msg.stepIndex === 'number' && typeof msg.total === 'number' && msg.total > 0)
    ? `${Math.min(msg.stepIndex + 1, msg.total)}/${msg.total}`
    : null;
  return (
    <div className="flex items-center gap-2.5 py-0.5">
      <div className="w-7 h-7 rounded-full bg-cyan-soft flex items-center justify-center shrink-0">
        <svg className="w-4 h-4 text-cyan" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
          <path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm text-foreground font-medium">{msg.text}</span>
        {msg.value && <span className="ml-2 text-sm text-muted-foreground">— {msg.value}</span>}
        {pos && <span className="ml-2 text-[11px] font-semibold text-cyan">passo {pos}</span>}
      </div>
      <span className="text-xs text-muted-foreground shrink-0">{timeStr}</span>
    </div>
  );
}

function ChatBubble({ msg, timeStr }: { msg: Message; timeStr: string }) {
  const isLead = msg.role === 'lead';
  const isBO = msg.role === 'bo';

  const formatted = msg.text
    .replace(/\*([^*]+)\*/g, '<strong>$1</strong>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/\n/g, '<br/>');

  if (isLead) {
    return (
      <div className="flex items-end gap-2">
        <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center shrink-0">
          <svg className="w-4 h-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        </div>
        <div className="max-w-[70%]">
          <div
            className="bg-card shadow-card rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm text-foreground"
            dangerouslySetInnerHTML={{ __html: formatted }}
          />
          <p className="text-xs text-muted-foreground mt-1 ml-1">{timeStr}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-end gap-2 justify-end">
      <div className="max-w-[70%]">
        <div
          className={`rounded-2xl rounded-br-sm px-4 py-2.5 text-sm text-white shadow-card ${isBO ? 'bg-cyan' : 'bg-orange'}`}
          dangerouslySetInnerHTML={{ __html: formatted }}
        />
        <p className="text-xs text-muted-foreground mt-1 mr-1 text-right">
          {isBO ? 'BO' : 'Bot'} · {timeStr}
        </p>
      </div>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${isBO ? 'bg-cyan-soft' : 'bg-orange-soft'}`}>
        {isBO ? (
          <svg className="w-4 h-4 text-cyan" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        ) : (
          <svg className="w-4 h-4 text-orange" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>
            <circle cx="9" cy="14" r="1" fill="currentColor" stroke="none"/>
            <circle cx="15" cy="14" r="1" fill="currentColor" stroke="none"/>
          </svg>
        )}
      </div>
    </div>
  );
}
