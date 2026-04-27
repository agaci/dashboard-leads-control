'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

type ConvStep =
  | 'INIT' | 'COLLECTING_ORIGEM' | 'COLLECTING_DESTINO' | 'COLLECTING_VIATURA'
  | 'COLLECTING_URGENCIA' | 'COLLECTING_WEIGHT' | 'CALCULATING_PRICE'
  | 'PRESENTING_PRICE' | 'PRESENTING_PARTNER_PRICE' | 'HANDLING_OBJECTION'
  | 'COLLECTING_NOME' | 'COLLECTING_EMAIL'
  | 'COLLECTING_ORIGEM_COMPLETA' | 'CONFIRMING_ORIGEM_COMPLETA'
  | 'COLLECTING_DESTINO_COMPLETA' | 'CONFIRMING_DESTINO_COMPLETA'
  | 'COLLECTING_DETALHES_RECOLHA' | 'COLLECTING_DETALHES_ENTREGA'
  | 'AWAITING_PAYMENT'
  | 'LEAD_REGISTERED' | 'ESCALATED_TO_HUMAN' | 'CLOSED';

type Message = {
  role: 'lead' | 'bot' | 'bo';
  text: string;
  timestamp: string;
  situacaoId?: string;
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
  LEAD_REGISTERED: 'Lead registada',
  ESCALATED_TO_HUMAN: 'Escalada',
  CLOSED: 'Fechada',
};

const STEP_COLOR: Partial<Record<ConvStep, string>> = {
  AWAITING_PAYMENT: 'bg-yellow-100 text-yellow-700',
  ESCALATED_TO_HUMAN: 'bg-red-100 text-red-700',
  LEAD_REGISTERED: 'bg-green-100 text-green-700',
  CLOSED: 'bg-gray-100 text-gray-500',
};

function stepColor(step: ConvStep) {
  return STEP_COLOR[step] ?? 'bg-blue-100 text-blue-700';
}

export default function ConversasPage({ initialConvId, onGoToAgg, isMobile = false }: { initialConvId?: string; onGoToAgg?: (convId: string) => void; isMobile?: boolean }) {
  const [conversations, setConversations] = useState<ConvSummary[]>([]);
  const [selected, setSelected] = useState<ConvFull | null>(null);
  const [filter, setFilter] = useState<'active' | 'escalated' | 'closed' | 'all'>('active');
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchList = useCallback(async () => {
    const res = await fetch(`/api/conversations?status=${filter}&limit=60`);
    const data = await res.json();
    if (data.success) setConversations(data.conversations);
    setLoading(false);
  }, [filter]);

  const fetchSelected = useCallback(async (id: string) => {
    const res = await fetch(`/api/conversations/${id}`);
    const data = await res.json();
    if (data.success) {
      setSelected(data.conversation);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  }, []);

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

  useEffect(() => { setLoading(true); }, [filter]);

  // Abrir conversa específica quando vindo do toast de agregação
  useEffect(() => {
    if (!initialConvId) return;
    setFilter('all');
    fetchSelected(initialConvId);
  }, [initialConvId, fetchSelected]);

  async function openConv(id: string) {
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

  const canReply = selected && !['LEAD_REGISTERED', 'CLOSED'].includes(selected.step);

  async function setStep(step: ConvStep) {
    if (!selected?._id) return;
    await fetch(`/api/conversations/${selected._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step }),
    });
    await fetchSelected(selected._id);
    fetchList();
  }

  return (
    <div className="flex h-full neu-bg">
      {/* ── Lista de conversas ──────────────────────────────── */}
      <div className="flex flex-col flex-shrink-0 neu-bg" style={{ width: isMobile ? '100%' : 320, borderRight: '1px solid hsl(240 10% 88%)', display: isMobile && selected ? 'none' : 'flex' }}>
        {/* Filtros */}
        <div className="px-3 py-2 flex gap-1 flex-wrap" style={{ borderBottom: '1px solid hsl(240 10% 88%)' }}>
          {(['active', 'escalated', 'all', 'closed'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                filter === f ? 'neu-pill-active' : 'neu-pill text-[--neu-muted] hover:text-[--neu-fg]'
              }`}
            >
              {f === 'active' ? 'Activas' : f === 'escalated' ? 'Escaladas' : f === 'closed' ? 'Fechadas' : 'Todas'}
            </button>
          ))}
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {loading && <p className="p-4 text-sm text-[--neu-muted]">A carregar...</p>}
          {!loading && conversations.length === 0 && (
            <p className="p-6 text-center text-sm text-[--neu-muted]">Sem conversas</p>
          )}
          {conversations.map((conv) => {
            const lastMsg = conv.history?.[0];
            const isSelected = selected?._id === conv._id;
            return (
              <button
                key={conv._id}
                onClick={() => openConv(conv._id)}
                className={`w-full text-left px-4 py-3 transition-all ${
                  isSelected ? 'neu-pressed border-l-3 border-l-orange-500' : 'hover:neu-raised-sm'
                }`}
                style={{ borderBottom: '1px solid hsl(240 10% 88%)' }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold" style={{ color: 'var(--neu-fg)' }}>
                    {conv.data?.nome ?? refCode(conv._id)}
                  </span>
                  <span className="text-xs text-[--neu-muted]">{formatTime(conv.updatedAt)}</span>
                </div>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${stepColor(conv.step)}`}>
                    {STEP_LABEL[conv.step]}
                  </span>
                  <span className="text-xs text-[--neu-muted]">{conv.canal}</span>
                </div>
                {lastMsg && (
                  <p className="text-xs text-gray-500 truncate">
                    <span className={`inline-block w-3 h-3 rounded-full mr-1 ${lastMsg.role === 'lead' ? 'bg-gray-400' : lastMsg.role === 'bo' ? 'bg-blue-400' : 'bg-orange-400'}`} />
                    {lastMsg.text.replace(/\*/g, '').replace(/\n/g, ' ').slice(0, 55)}
                  </p>
                )}
                {conv.data?.origem && (
                  <p className="text-xs text-gray-400 mt-0.5 truncate">
                    {conv.data.origem} → {conv.data.destino ?? '...'}
                  </p>
                )}
                {conv.aggHints && conv.aggHints.length > 0 && (
                  <div className="flex items-center gap-1 mt-1">
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                      background: conv.aggHintsSeen ? '#f5f5f5' : '#fff8e1',
                      color: conv.aggHintsSeen ? '#aaa' : '#e65100',
                      border: `1px solid ${conv.aggHintsSeen ? '#e0e0e0' : '#ffe082'}`,
                    }}>
                      ◈ {conv.aggHints.length} agreg.
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Painel de chat ──────────────────────────────────── */}
      {(!isMobile || selected) && (
      <div className="flex-1 flex flex-col neu-bg overflow-hidden" style={{ display: isMobile && !selected ? 'none' : 'flex' }}>
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-[--neu-muted] text-sm">
            Seleccione uma conversa
          </div>
        ) : (
          <>
            {/* Header da conversa */}
            <div className="neu-bg px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid hsl(240 10% 88%)' }}>
              {/* Linha 1: voltar + nome/ref + badge + (botões e meta em desktop) */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  {isMobile && (
                    <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#888', padding: '2px 4px 0 0', lineHeight: 1, flexShrink: 0 }}>
                      ←
                    </button>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold" style={{ color: 'var(--neu-fg)' }}>
                        {selected.data?.nome ?? refCode(selected._id)}
                      </span>
                      {selected.data?.nome && (
                        <span className="text-xs text-[--neu-muted] font-mono">{refCode(selected._id)}</span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${stepColor(selected.step)}`}>
                        {STEP_LABEL[selected.step]}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[--neu-muted] mt-0.5">
                      {selected.data?.origem && (
                        <span className="truncate max-w-[200px] md:max-w-none">
                          {selected.data.origem.split(',')[0]} → {(selected.data.destino ?? '').split(',')[0]}
                        </span>
                      )}
                      {selected.data?.urgencia && <span>{selected.data.urgencia}</span>}
                      {selected.data?.weightKg && <span>{selected.data.weightKg} kg</span>}
                      {(selected.data?.priceWithDiscount ?? selected.data?.partnerFinalPrice) && (
                        <span className="text-green-600 font-medium">
                          €{(selected.data.priceWithDiscount ?? selected.data.partnerFinalPrice).toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {/* Botões + meta — em desktop ficam aqui; em mobile passam para linha 2 */}
                <div className="hidden md:flex items-center gap-2 flex-shrink-0">
                  {!['LEAD_REGISTERED', 'CLOSED'].includes(selected.step) && (
                    <>
                      <button onClick={() => setStep('LEAD_REGISTERED')} className="px-3 py-1 text-xs rounded-lg font-medium bg-green-100 text-green-700 hover:bg-green-200 transition-all">
                        ✓ Resolvida
                      </button>
                      <button onClick={() => setStep('CLOSED')} className="px-3 py-1 text-xs rounded-lg font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-all">
                        ✕ Fechar
                      </button>
                    </>
                  )}
                  <span className="text-xs text-[--neu-muted]">
                    {selected.history?.length ?? 0} msgs · {formatTime(selected.createdAt)}
                  </span>
                </div>
              </div>
              {/* Linha 2 (só mobile): botões de acção + meta */}
              <div className="flex md:hidden items-center gap-2 mt-2">
                {!['LEAD_REGISTERED', 'CLOSED'].includes(selected.step) && (
                  <>
                    <button onClick={() => setStep('LEAD_REGISTERED')} className="px-3 py-1 text-xs rounded-lg font-medium bg-green-100 text-green-700 hover:bg-green-200 transition-all">
                      ✓ Resolvida
                    </button>
                    <button onClick={() => setStep('CLOSED')} className="px-3 py-1 text-xs rounded-lg font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-all">
                      ✕ Fechar
                    </button>
                  </>
                )}
                <span className="text-xs text-[--neu-muted] ml-auto">
                  {selected.history?.length ?? 0} msgs · {formatTime(selected.createdAt)}
                </span>
              </div>
            </div>

            {/* Banner de agregação */}
            {selected.aggHints && selected.aggHints.length > 0 && (
              <div style={{
                background: '#fffde7', borderBottom: '1.5px solid #ffe082',
                padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 12,
                flexShrink: 0,
              }}>
                <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', background: '#ffc107', color: '#1a2332', padding: '2px 6px', borderRadius: 4 }}>AGREGAÇÃO</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#e65100' }}>
                  {selected.aggHints.length} hipótese{selected.aggHints.length > 1 ? 's' : ''} · melhor {selected.aggHints[0].score}%
                </span>
                <span style={{ fontSize: 11, color: '#888' }}>
                  {selected.aggHints[0].pickup?.split(',')[0]} → {selected.aggHints[0].delivery?.split(',')[0]}
                  {selected.aggHints[0].driver && (
                    <span style={{ marginLeft: 8, color: '#555', fontWeight: 600 }}>· {selected.aggHints[0].driver.name}</span>
                  )}
                </span>
                {onGoToAgg && (
                  <button
                    onClick={() => onGoToAgg(selected._id)}
                    style={{
                      marginLeft: 'auto', padding: '4px 12px', borderRadius: 6,
                      background: '#ffc107', color: '#1a2332',
                      border: 'none', fontSize: 11, fontWeight: 800, cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Ver agregações →
                  </button>
                )}
              </div>
            )}

            {/* Bolhas de chat */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
              {(selected.history ?? []).map((msg, i) => (
                <ChatBubble key={i} msg={msg} timeStr={formatTimeShort(msg.timestamp)} />
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* Campo de resposta */}
            {canReply ? (
              <div className="neu-bg px-4 py-3 flex gap-2 flex-shrink-0" style={{ borderTop: '1px solid hsl(240 10% 88%)' }}>
                <input
                  type="text"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendReply()}
                  placeholder="Responder manualmente (Enter para enviar)..."
                  className="flex-1 neu-input rounded-xl px-4 py-2 text-sm"
                />
                <button
                  onClick={sendReply}
                  disabled={sending || !reply.trim()}
                  className="px-4 py-2 neu-btn-primary text-sm rounded-xl disabled:opacity-40"
                >
                  {sending ? '...' : 'Enviar'}
                </button>
              </div>
            ) : (
              <div className="neu-bg px-4 py-2 text-xs text-center text-[--neu-muted] flex-shrink-0" style={{ borderTop: '1px solid hsl(240 10% 88%)' }}>
                {selected.step === 'LEAD_REGISTERED' ? 'Lead registada — conversa concluída' : 'Conversa fechada'}
              </div>
            )}
          </>
        )}
      </div>
      )}
    </div>
  );
}

function ChatBubble({ msg, timeStr }: { msg: Message; timeStr: string }) {
  const isLead = msg.role === 'lead';
  const isBO = msg.role === 'bo';

  // Converter markdown simples para display
  const formatted = msg.text
    .replace(/\*([^*]+)\*/g, '<strong>$1</strong>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/\n/g, '<br/>');

  if (isLead) {
    return (
      <div className="flex items-end gap-2">
        <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-gray-500" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
          </svg>
        </div>
        <div className="max-w-[70%]">
          <div
            className="neu-raised rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm"
            style={{ color: 'var(--neu-fg)' }}
            dangerouslySetInnerHTML={{ __html: formatted }}
          />
          <p className="text-xs text-[--neu-muted] mt-1 ml-1">{timeStr}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-end gap-2 justify-end">
      <div className="max-w-[70%]">
        <div
          className={`rounded-2xl rounded-br-sm px-4 py-2.5 text-sm shadow-sm ${
            isBO ? 'bg-blue-500 text-white' : 'bg-orange-500 text-white'
          }`}
          dangerouslySetInnerHTML={{ __html: formatted }}
        />
        <p className="text-xs text-[--neu-muted] mt-1 mr-1 text-right">
          {isBO ? 'BO' : 'Bot'} · {timeStr}
        </p>
      </div>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${isBO ? 'bg-blue-100' : 'bg-orange-100'}`}>
        {isBO ? (
          <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
          </svg>
        ) : (
          <svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <rect x="3" y="8" width="18" height="12" rx="2"/>
            <path d="M8 8V6a4 4 0 018 0v2"/>
            <circle cx="9" cy="14" r="1" fill="currentColor"/>
            <circle cx="15" cy="14" r="1" fill="currentColor"/>
          </svg>
        )}
      </div>
    </div>
  );
}
