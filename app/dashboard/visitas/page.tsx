'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { playVisitSound } from '@/lib/soundManager';
import { useIsMobile } from '@/lib/useIsMobile';
import { VisitasMap, type VisitPing } from '../VisitasMap';
import { DeleteDialog } from '../DeleteDialog';

const CYAN = '#00bcd4';
const NAVY = '#1a2332';
const YB_BG = '#f5f6fa';
const BORDER = '#dde1e8';
const MUTED = '#5b6472';
const SUBTLE = '#98a1b0';

type Geo = {
  ip?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  lat?: number | null;
  lng?: number | null;
};

type Visit = {
  sessionId: string;
  firstSeen: string;
  lastSeen: string;
  entryPage?: string | null;
  lastPage?: string | null;
  referrer?: string | null;
  variante?: string | null;
  pageViews?: number;
  geo?: Geo | null;
  device?: string | null;
  os?: string | null;
  stage?: Stage;
};

type Stage = { inbox: boolean; lead: boolean; hasPhone?: boolean; hasEmail?: boolean; convId?: string; leadId?: string };

function IcoPhoneSm({ color }: { color: string }) {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-label="Telemóvel">
      <rect x="7" y="2" width="10" height="20" rx="2" /><line x1="11" y1="18" x2="13" y2="18" />
    </svg>
  );
}
function IcoMailSm({ color }: { color: string }) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-label="Email">
      <rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" />
    </svg>
  );
}

// Mini-funil por visita: Visita -> Inbox -> Lead. Nós alcançados ficam a cor; os
// restantes cinza-claro. No nó Inbox, se já há contacto, mostra telemóvel/email.
// Inbox/Lead alcançados são clicáveis -> abrem o detalhe respectivo.
function FunnelSteps({ stage, onOpenConv, onOpenLead }: { stage?: Stage; onOpenConv?: (id: string) => void; onOpenLead?: (id: string) => void }) {
  const steps: { key: string; label: string; on: boolean; color: string; onClick?: () => void }[] = [
    { key: 'visita', label: 'Visita', on: true, color: CYAN },
    { key: 'inbox', label: 'Inbox', on: !!stage?.inbox, color: CYAN, onClick: stage?.inbox && stage?.convId && onOpenConv ? () => onOpenConv(stage.convId!) : undefined },
    { key: 'lead', label: 'Lead', on: !!stage?.lead, color: '#22c55e', onClick: stage?.lead && stage?.leadId && onOpenLead ? () => onOpenLead(stage.leadId!) : undefined },
  ];
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center' }}>
      {steps.map((s, i) => {
        const clickable = !!s.onClick;
        return (
          <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center' }}>
            {i > 0 && <span style={{ width: 16, height: 2, borderRadius: 2, background: s.on ? s.color : '#e3e7ee' }} />}
            <span
              onClick={clickable ? (e) => { e.stopPropagation(); s.onClick!(); } : undefined}
              role={clickable ? 'button' : undefined}
              title={clickable ? (s.key === 'inbox' ? 'Abrir conversa' : 'Abrir lead') : undefined}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: clickable ? 'pointer' : 'default', padding: clickable ? '2px 5px' : 0, borderRadius: 6, background: clickable ? `${s.color}14` : 'transparent' }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: s.on ? s.color : '#fff', border: s.on ? 'none' : '1.5px solid #cfd5de' }} />
              <span style={{ fontSize: 10.5, fontWeight: s.on ? 700 : 500, color: s.on ? s.color : '#aab1bd' }}>{s.label}</span>
              {s.key === 'inbox' && s.on && (stage?.hasPhone || stage?.hasEmail) && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginLeft: 1 }} title="Contacto capturado">
                  {stage?.hasPhone && <IcoPhoneSm color={s.color} />}
                  {stage?.hasEmail && <IcoMailSm color={s.color} />}
                </span>
              )}
              {clickable && (
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={s.color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 1 }}><path d="M9 18l6-6-6-6" /></svg>
              )}
            </span>
          </span>
        );
      })}
    </div>
  );
}

const DEVICE_PT: Record<string, string> = { mobile: 'Telemóvel', tablet: 'Tablet', desktop: 'PC' };

type Range = 'hoje' | 'ontem' | 'semana' | 'tudo';

const RANGES: { key: Range; label: string }[] = [
  { key: 'hoje', label: 'Hoje' },
  { key: 'ontem', label: 'Ontem' },
  { key: 'semana', label: 'Semana' },
  { key: 'tudo', label: 'Tudo' },
];

function timeAgo(iso?: string): string {
  if (!iso) return '';
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `há ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

function placeLabel(g?: Geo | null): string {
  if (!g) return 'Localização indisponível';
  const parts = [g.city, g.region].filter(Boolean);
  if (parts.length) return parts.join(', ');
  if (g.country) return g.country;
  return 'Localização aproximada';
}

function refLabel(ref?: string | null): string {
  if (!ref) return 'Directo';
  try { return new URL(ref).hostname.replace(/^www\./, ''); } catch { return ref.slice(0, 40); }
}

const VAR_META: Record<string, { label: string; bg: string; fg: string }> = {
  QUIZ:  { label: 'Quiz',   bg: 'rgba(99,102,241,0.14)', fg: '#6366f1' },
  QUIZ3: { label: 'Quiz 3', bg: 'rgba(59,130,246,0.14)', fg: '#3b82f6' },
  QUIZ4: { label: 'Quiz 4', bg: 'rgba(234,88,12,0.14)',  fg: '#ea580c' },
  QUIZ5: { label: 'Quiz 5', bg: 'rgba(13,148,136,0.14)', fg: '#0d9488' },
  QUIZ6:  { label: 'Quiz 6',  bg: 'rgba(168,85,247,0.14)', fg: '#a855f7' },
  QUIZ6B: { label: 'Quiz 6b', bg: 'rgba(236,72,153,0.14)', fg: '#ec4899' },
  QUIZ6C: { label: 'Quiz 6c', bg: 'rgba(6,182,212,0.14)',  fg: '#06b6d4' },
  WIDGET: { label: 'Widget',  bg: 'rgba(234,179,8,0.14)',  fg: '#ca8a04' },
  A: { label: 'Site A', bg: 'rgba(139,92,246,0.14)', fg: '#7c3aed' },
  B: { label: 'Site B', bg: 'rgba(245,158,11,0.14)', fg: '#d97706' },
  C: { label: 'Site C', bg: 'rgba(16,185,129,0.14)', fg: '#059669' },
  D: { label: 'Site D', bg: 'rgba(236,72,153,0.14)', fg: '#db2777' },
};
function varMeta(v?: string | null): { label: string; bg: string; fg: string } {
  return VAR_META[(v || '').toUpperCase()] ?? { label: 'Site', bg: 'rgba(90,100,114,0.12)', fg: MUTED };
}

// ── Ícones (SVG, sem emojis) ────────────────────────────────────────────────
function IcoPin({ size = 14, color = SUBTLE }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
    </svg>
  );
}
function IcoGlobe({ size = 14, color = SUBTLE }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}
function IcoDoc({ size = 13, color = SUBTLE }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
    </svg>
  );
}
function IcoDevice({ device, size = 13, color = MUTED }: { device?: string | null; size?: number; color?: string }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (device === 'mobile') return <svg {...p}><rect x="6" y="2" width="12" height="20" rx="2.5" /><line x1="12" y1="18.5" x2="12" y2="18.5" /></svg>;
  if (device === 'tablet') return <svg {...p}><rect x="4" y="2.5" width="16" height="19" rx="2.5" /><line x1="12" y1="18" x2="12" y2="18" /></svg>;
  return <svg {...p}><rect x="2" y="3.5" width="20" height="13" rx="2" /><line x1="8" y1="20.5" x2="16" y2="20.5" /><line x1="12" y1="16.5" x2="12" y2="20.5" /></svg>;
}

export default function VisitasPage({ onOpenConv, onOpenLead }: { onOpenConv?: (id: string) => void; onOpenLead?: (id: string) => void } = {}) {
  const isMobile = useIsMobile();
  const { data: sessionData } = useSession();
  const isAdmin = (sessionData?.user as any)?.role === 'administrator';
  // Abrir o detalhe da conversa/lead. Em tab usa os callbacks do dashboard; em rota
  // autónoma (/dashboard/visitas) recorre ao deep-link por URL.
  const openConv = onOpenConv ?? ((id: string) => { window.location.href = `/dashboard?conv=${id}`; });
  const openLead = onOpenLead ?? ((id: string) => { window.location.href = `/dashboard?lead=${id}`; });
  const [visits, setVisits] = useState<Visit[]>([]);
  const [delVisit, setDelVisit] = useState<Visit | null>(null);
  const [delBusy, setDelBusy] = useState(false);
  const [delError, setDelError] = useState<string | null>(null);
  const [pings, setPings] = useState<VisitPing[]>([]);
  const [range, setRange] = useState<Range>('hoje');
  const [todayCount, setTodayCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0); // refresca os "há X" periodicamente
  const cursorRef = useRef<string>(new Date().toISOString());
  const seenIds = useRef<Set<string>>(new Set());

  const pushPings = useCallback((rows: Visit[]) => {
    const fresh: VisitPing[] = [];
    for (const v of rows) {
      const g = v.geo;
      if (g && typeof g.lat === 'number' && typeof g.lng === 'number') {
        fresh.push({ id: v.sessionId, lat: g.lat, lng: g.lng, city: g.city });
      }
    }
    if (fresh.length) setPings((prev) => [...prev, ...fresh].slice(-60));
  }, []);

  // Apagar visita (só admin, com código). Cascata opcional: conversa + lead associadas.
  const deleteVisit = useCallback(async (code: string, checked: Record<string, boolean>) => {
    if (!delVisit) return;
    setDelBusy(true);
    setDelError(null);
    try {
      const res = await fetch(`/api/visit/${encodeURIComponent(delVisit.sessionId)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, alsoDeleteConversation: !!checked.conversation, alsoDeleteLead: !!checked.lead }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        const sid = delVisit.sessionId;
        setVisits((prev) => prev.filter((v) => v.sessionId !== sid));
        setDelVisit(null);
      } else {
        setDelError(j.error || 'Falha ao apagar.');
      }
    } catch { setDelError('Falha ao apagar.'); }
    setDelBusy(false);
  }, [delVisit]);

  // Carregar a lista da coluna para o intervalo escolhido.
  const loadList = useCallback(async (r: Range) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/visit?range=${r}`, { cache: 'no-store' });
      const data = await res.json();
      const rows: Visit[] = data.visits || [];
      setVisits(rows);
      setTodayCount(data.todayCount ?? 0);
      seenIds.current = new Set(rows.map((v) => v.sessionId));
      // O cursor do "ao vivo" começa em agora — só anima quem chega DEPOIS de abrir.
      cursorRef.current = new Date().toISOString();
      // Semear alguns pins recentes para o mapa não abrir vazio (com stagger suave).
      const seed = rows.filter((v) => v.geo && typeof v.geo.lat === 'number').slice(0, 4);
      seed.forEach((v, i) => window.setTimeout(() => pushPings([v]), 500 + i * 650));
    } catch { /* silencioso */ }
    setLoading(false);
  }, [pushPings]);

  useEffect(() => { loadList(range); }, [range, loadList]);

  // Poll ao vivo: buscar visitas novas e animar os pins.
  useEffect(() => {
    let stop = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/visit?since=${encodeURIComponent(cursorRef.current)}`, { cache: 'no-store' });
        const data = await res.json();
        const rows: Visit[] = data.visits || [];
        if (rows.length && !stop) {
          // avançar cursor para o firstSeen mais recente
          const maxFs = rows.reduce((m, v) => (v.firstSeen > m ? v.firstSeen : m), cursorRef.current);
          cursorRef.current = maxFs;
          const novos = rows.filter((v) => !seenIds.current.has(v.sessionId));
          novos.forEach((v) => seenIds.current.add(v.sessionId));
          if (novos.length) {
            playVisitSound(); // um toque suave por lote de visitas novas
            // só junto à coluna se o intervalo actual inclui "hoje/agora"
            if (range === 'hoje' || range === 'tudo' || range === 'semana') {
              setVisits((prev) => [...novos.reverse(), ...prev]);
            }
            setTodayCount((c) => c + novos.length);
            pushPings(novos);
          }
        }
      } catch { /* silencioso */ }
    };
    const id = window.setInterval(poll, 6000);
    return () => { stop = true; window.clearInterval(id); };
  }, [range, pushPings]);

  // Refresco silencioso da coluna a cada 15s: actualiza o estado do funil (Inbox/Lead)
  // das visitas já listadas, sem flicker nem re-seed de pins.
  useEffect(() => {
    const id = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/visit?range=${range}`, { cache: 'no-store' });
        const data = await res.json();
        const rows: Visit[] = data.visits || [];
        setVisits(rows);
        setTodayCount(data.todayCount ?? 0);
        seenIds.current = new Set(rows.map((v) => v.sessionId));
      } catch { /* silencioso */ }
    }, 15000);
    return () => window.clearInterval(id);
  }, [range]);

  // Refrescar os rótulos "há X" a cada 20s.
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 20000);
    return () => window.clearInterval(id);
  }, []);
  void tick;

  // Clicar num cartão volta a animar o pin no mapa.
  const replay = useCallback((v: Visit) => {
    const g = v.geo;
    if (g && typeof g.lat === 'number' && typeof g.lng === 'number') {
      setPings((prev) => [...prev, { id: `${v.sessionId}@${Date.now()}`, lat: g.lat!, lng: g.lng!, city: g.city }].slice(-60));
    }
  }, []);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: YB_BG, minWidth: 0 }}>
      {/* Cabeçalho */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        padding: '16px 20px 12px', borderBottom: `1px solid ${BORDER}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: NAVY, letterSpacing: '-0.01em' }}>Visitas ao site</h1>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(22,163,74,0.12)', color: '#16a34a',
            fontSize: 10, fontWeight: 800, letterSpacing: '0.08em',
            padding: '3px 9px', borderRadius: 20, textTransform: 'uppercase',
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#16a34a', animation: 'ybLive 1.4s ease-in-out infinite' }} />
            Ao vivo
          </span>
        </div>

        <span style={{ fontSize: 12, color: MUTED }}>
          <strong style={{ color: NAVY, fontSize: 14 }}>{todayCount}</strong> visitas hoje
        </span>

        <div style={{ flex: 1 }} />

        {/* Filtros */}
        <div style={{ display: 'flex', gap: 6 }}>
          {RANGES.map((r) => {
            const active = range === r.key;
            return (
              <button key={r.key} onClick={() => setRange(r.key)}
                style={{
                  fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 20, cursor: 'pointer',
                  border: `1px solid ${active ? CYAN : BORDER}`,
                  background: active ? CYAN : '#fff',
                  color: active ? '#fff' : MUTED,
                  transition: 'all .15s',
                }}>
                {r.label}
              </button>
            );
          })}
        </div>
      </div>

      <style>{`@keyframes ybLive{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.7)}}`}</style>

      {/* Corpo: mapa + coluna */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: isMobile ? 'column' : 'row',
        gap: 14, padding: 14, minHeight: 0,
      }}>
        {/* Mapa */}
        <div style={{
          flex: isMobile ? 'none' : 1.5, height: isMobile ? '42vh' : 'auto', minWidth: 0,
          borderRadius: 14, overflow: 'hidden', border: `1px solid ${BORDER}`,
          boxShadow: '0 1px 3px rgba(16,24,40,0.06)', background: '#e9eef3',
          position: 'relative',
        }}>
          <VisitasMap pings={pings} />
          <div style={{
            position: 'absolute', left: 12, bottom: 12, zIndex: 500,
            background: 'rgba(255,255,255,0.92)', borderRadius: 10, padding: '7px 11px',
            fontSize: 11, color: MUTED, boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            display: 'flex', alignItems: 'center', gap: 7, pointerEvents: 'none',
          }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: CYAN, boxShadow: `0 0 8px ${CYAN}` }} />
            Cada visita acende um ponto por instantes
          </div>
        </div>

        {/* Coluna de visitas */}
        <div style={{
          width: isMobile ? '100%' : 380,
          ...(isMobile ? { flex: 1 } : { flexShrink: 0 }),
          display: 'flex', flexDirection: 'column',
          background: '#fff', borderRadius: 14, border: `1px solid ${BORDER}`,
          boxShadow: '0 1px 3px rgba(16,24,40,0.06)', overflow: 'hidden', minHeight: 0,
        }}>
          <div style={{
            padding: '11px 14px', borderBottom: `1px solid ${BORDER}`,
            fontSize: 12, fontWeight: 800, color: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span>Todas as visitas</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: SUBTLE }}>{visits.length}</span>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: 10 }}>
            {loading && visits.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: SUBTLE, fontSize: 13 }}>A carregar…</div>
            )}
            {!loading && visits.length === 0 && (
              <div style={{ padding: 32, textAlign: 'center', color: SUBTLE, fontSize: 13 }}>
                Sem visitas neste período.
              </div>
            )}

            {visits.map((v) => {
              const vm = varMeta(v.variante);
              const g = v.geo;
              const hasGeo = !!(g && typeof g.lat === 'number' && typeof g.lng === 'number');
              return (
                <div key={v.sessionId} role="button" onClick={hasGeo ? () => replay(v) : undefined}
                  style={{
                    width: '100%', textAlign: 'left', display: 'block',
                    padding: '11px 13px', marginBottom: 8, borderRadius: 12,
                    background: '#fff', border: `1px solid ${BORDER}`,
                    boxShadow: '0 1px 2px rgba(16,24,40,0.05)',
                    cursor: hasGeo ? 'pointer' : 'default', transition: 'background .12s, border-color .12s, box-shadow .12s',
                  }}
                  onMouseEnter={(e) => { const el = e.currentTarget as HTMLDivElement; el.style.background = '#f9fbfe'; if (hasGeo) { el.style.borderColor = 'rgba(0,188,212,0.5)'; el.style.boxShadow = '0 2px 10px rgba(0,188,212,0.12)'; } }}
                  onMouseLeave={(e) => { const el = e.currentTarget as HTMLDivElement; el.style.background = '#fff'; el.style.borderColor = BORDER; el.style.boxShadow = '0 1px 2px rgba(16,24,40,0.05)'; }}
                  title={hasGeo ? 'Clique para acender no mapa' : ''}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <IcoPin color={hasGeo ? CYAN : SUBTLE} />
                      <strong style={{ fontSize: 13.5, color: NAVY, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {placeLabel(g)}
                      </strong>
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <span style={{ fontSize: 11, color: SUBTLE }}>{timeAgo(v.firstSeen)}</span>
                      {isAdmin && (
                        <span
                          role="button"
                          title="Apagar visita"
                          onClick={(e) => { e.stopPropagation(); setDelError(null); setDelVisit(v); }}
                          style={{ display: 'inline-flex', cursor: 'pointer', color: '#c0c6d0', padding: 2, borderRadius: 5 }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLSpanElement).style.color = '#dc2626'; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLSpanElement).style.color = '#c0c6d0'; }}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </span>
                      )}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 5 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 20,
                      background: vm.bg, color: vm.fg,
                    }}>{vm.label}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: MUTED }}>
                      <IcoGlobe /> {refLabel(v.referrer)}
                    </span>
                    <span style={{ fontSize: 11, color: SUBTLE }}>· {v.pageViews ?? 1} {(v.pageViews ?? 1) === 1 ? 'página' : 'páginas'}</span>
                    {v.device && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: MUTED }}>
                        <IcoDevice device={v.device} /> {DEVICE_PT[v.device] ?? v.device}{v.os ? ` · ${v.os}` : ''}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: SUBTLE }}>
                    <IcoDoc />
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.entryPage || '/'}</span>
                    {g?.ip && <span style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums', color: '#b6bdc9' }}>{g.ip}</span>}
                  </div>

                  {/* Zona independente do funil — clicar aqui não acende o mapa */}
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{ marginTop: 9, paddingTop: 8, borderTop: '1px solid #eef1f5' }}
                  >
                    <FunnelSteps stage={v.stage} onOpenConv={openConv} onOpenLead={openLead} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <DeleteDialog
        open={!!delVisit}
        title="Apagar visita?"
        options={[
          { id: 'conversation', label: 'Apagar também a conversa (inbox) associada, se existir.' },
          { id: 'lead', label: 'Apagar também a lead associada, se existir.', hint: 'A ligação visita→conversa só existe em visitas novas (após a unificação do ID).' },
        ]}
        busy={delBusy}
        error={delError}
        onConfirm={(code, checked) => deleteVisit(code, checked)}
        onCancel={() => { setDelVisit(null); setDelError(null); }}
      />
    </div>
  );
}
