'use client';

import { useState, useEffect } from 'react';
import { getVolume, setVolume, playLeadSound, playInboxSound, playVisitSound, playEscalationSound, playAggSound } from '@/lib/soundManager';
import { getVoiceSetting, setVoiceSetting, previewVoice } from '@/lib/ttsManager';

export type NavTab =
  | 'visitas' | 'leads' | 'inbox' | 'clientes' | 'servicos'
  | 'precos' | 'baseIA' | 'relatorios' | 'agregacoes'
  | 'crm' | 'routing' | 'widgets' | 'atribuicao' | 'config';

/** Os separadores validos, para filtrar o que vem do endereco. */
export const SEPARADORES: NavTab[] = [
  'visitas', 'leads', 'inbox', 'clientes', 'servicos', 'precos', 'baseIA',
  'relatorios', 'agregacoes', 'crm', 'routing', 'widgets', 'atribuicao', 'config',
];

interface NavSidebarProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  leadsCount?: number;
  alertsCount?: number;
  inboxBadge?: number;
  leadsBadge?: number;
  aggBlink?: boolean;
  mobile?: boolean;
}

// ── SVG icons (17×17, stroke currentColor) ───────────────────────────────────

function IcoLeads() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2"/>
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
      <line x1="12" y1="12" x2="12" y2="17"/>
      <line x1="9" y1="14.5" x2="15" y2="14.5"/>
    </svg>
  );
}

function IcoVisitas() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9"/>
      <circle cx="12" cy="12" r="4.5"/>
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/>
    </svg>
  );
}

function IcoInbox() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>
      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
    </svg>
  );
}

function IcoClientes() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
}

function IcoServicos() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="15" height="13"/>
      <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/>
      <circle cx="5.5" cy="18.5" r="2.5"/>
      <circle cx="18.5" cy="18.5" r="2.5"/>
    </svg>
  );
}

function IcoPrecos() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23"/>
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
    </svg>
  );
}

function IcoBaseIA() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>
      <circle cx="9" cy="14" r="1" fill="currentColor" stroke="none"/>
      <circle cx="15" cy="14" r="1" fill="currentColor" stroke="none"/>
    </svg>
  );
}

function IcoAgregacoes() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 8 22 16 12 22 2 16 2 8 12 2 22 8"/>
      <polyline points="22 8 12 14 2 8"/>
      <line x1="12" y1="14" x2="12" y2="22"/>
      <line x1="7" y1="11" x2="12" y2="14"/>
      <line x1="17" y1="11" x2="12" y2="14"/>
    </svg>
  );
}

function IcoRelatorios() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  );
}

function IcoPerfil() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  );
}

function IcoAtribuicao() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>
      <line x1="12" y1="3" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="21"/>
      <line x1="3" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="21" y2="12"/>
    </svg>
  );
}

function IcoCrm() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 12l2.5 2.5a1.8 1.8 0 0 0 2.5 0L15 12"/>
      <path d="M3 7h4l3 3"/>
      <path d="M21 7h-4l-3 3"/>
      <rect x="2" y="5" width="4" height="10" rx="1"/>
      <rect x="18" y="5" width="4" height="10" rx="1"/>
      <path d="M10 17l1.5 1.5a1.5 1.5 0 0 0 2 0L15 17"/>
    </svg>
  );
}

function IcoWidgets() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/>
      <rect x="14" y="3" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/>
      <rect x="3" y="14" width="7" height="7"/>
    </svg>
  );
}

function IcoConfig() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}

// ── Nav item ─────────────────────────────────────────────────────────────────

interface NavItemProps {
  id: NavTab;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  badge?: number;
  /** Menu aberto: o icone vem acompanhado da designacao. */
  expandido?: boolean;
  onClick: () => void;
}

function NavItem({ id, label, icon, active, badge, expandido = false, onClick }: NavItemProps) {
  return (
    <button
      onClick={onClick}
      // Com a designacao a vista o tooltip so repetiria o que ja la esta escrito.
      title={expandido ? undefined : label}
      style={{
        width: expandido ? '100%' : 44, height: 42,
        display: 'flex', alignItems: 'center',
        justifyContent: expandido ? 'flex-start' : 'center',
        gap: 11, padding: expandido ? '0 11px' : 0,
        borderRadius: 10, border: 'none', cursor: 'pointer',
        position: 'relative',
        background: active ? 'rgba(0,188,212,0.18)' : 'transparent',
        color: active ? 'var(--yb-cyan)' : 'var(--yb-subtle)',
        transition: 'background 0.15s, color 0.15s',
        boxShadow: active ? 'inset 0 0 0 1px rgba(0,188,212,0.3)' : 'none',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          (e.currentTarget as HTMLButtonElement).style.background = 'var(--yb-input)';
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--yb-muted)';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--yb-subtle)';
        }
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, flexShrink: 0 }}>
        {icon}
      </span>
      {expandido && (
        <span style={{
          fontSize: 12.5, fontWeight: active ? 700 : 600, whiteSpace: 'nowrap',
          overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '0.01em',
        }}>
          {label}
        </span>
      )}
      {badge != null && badge > 0 && (
        <span style={{
          // Fechado o contador sobrepoe-se ao icone; aberto encosta ao fim da linha,
          // que e onde a leitura o procura depois de ler a designacao.
          ...(expandido
            ? { marginLeft: 'auto', minWidth: 16, padding: '0 4px' }
            : { position: 'absolute', top: 5, right: 5, width: 14 }),
          height: 14, borderRadius: 8,
          background: '#ffc107', color: '#1a2b4a',
          fontSize: 8, fontWeight: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          lineHeight: 1, flexShrink: 0,
        }}>
          {badge > 99 ? '99' : badge}
        </span>
      )}
    </button>
  );
}

// ── Sound Control ────────────────────────────────────────────────────────────

const VOL_STEPS = [0, 0.3, 0.65, 1];

function SoundButton({ expandido = false }: { expandido?: boolean }) {
  const [vol, setVol] = useState(0.5);
  const [showSlider, setShowSlider] = useState(false);

  useEffect(() => {
    setVol(getVolume());
    const handler = (e: Event) => setVol((e as CustomEvent).detail);
    window.addEventListener('ybvolumechange', handler);
    return () => window.removeEventListener('ybvolumechange', handler);
  }, []);

  function cycleVolume() {
    const idx = VOL_STEPS.findIndex((v) => v >= vol - 0.01);
    const next = VOL_STEPS[(idx + 1) % VOL_STEPS.length];
    setVolume(next);
    setVol(next);
    if (next > 0) {
      // tocar preview do som actual para confirmar nível
      setTimeout(() => playLeadSound(), 50);
    }
  }

  const volPct = Math.round(vol * 100);

  return (
    <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center', padding: expandido ? '0 8px' : 0 }}>
      <button
        onClick={cycleVolume}
        onContextMenu={(e) => { e.preventDefault(); setShowSlider((s) => !s); }}
        title={`Som: ${volPct}% — clique para ciclar, clique-direito para controlo fino`}
        style={{
          width: expandido ? '100%' : 44, height: 32, borderRadius: 8, border: 'none',
          background: 'transparent', cursor: 'pointer',
          gap: 11, padding: expandido ? '0 11px' : 0,
          display: 'flex', alignItems: 'center',
          justifyContent: expandido ? 'flex-start' : 'center',
          color: vol === 0 ? 'var(--yb-subtle)' : 'var(--yb-cyan)',
          transition: 'color 0.2s',
        }}
      >
        {vol === 0 ? (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
            <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
          </svg>
        ) : vol <= 0.3 ? (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
          </svg>
        ) : vol <= 0.65 ? (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
          </svg>
        ) : (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
          </svg>
        )}
        {expandido && (
          <span style={{ fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>{`Som — ${volPct}%`}</span>
        )}
      </button>

      {showSlider && (
        <div style={{
          position: 'absolute', bottom: 40, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--yb-card)', border: '1px solid var(--yb-border)',
          borderRadius: 10, padding: '10px 12px', width: 140, zIndex: 200,
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        }}>
          <p style={{ fontSize: 10, color: 'var(--yb-subtle)', margin: '0 0 6px', textAlign: 'center' }}>
            Volume — {volPct}%
          </p>
          <input
            type="range" min={0} max={100} step={5}
            value={volPct}
            onChange={(e) => { const v = parseInt(e.target.value) / 100; setVolume(v); setVol(v); }}
            onMouseUp={() => { if (vol > 0) playLeadSound(); }}
            style={{ width: '100%', accentColor: '#00bcd4' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, gap: 4 }}>
            {[
              { label: 'Visita', fn: playVisitSound },
              { label: 'Inbox', fn: playInboxSound },
              { label: 'Lead', fn: playLeadSound },
              { label: 'Urgente', fn: playEscalationSound },
              { label: 'Agreg.', fn: playAggSound },
            ].map(({ label, fn }) => (
              <button key={label} onClick={fn}
                style={{
                  flex: 1, fontSize: 9, padding: '4px 2px', borderRadius: 5,
                  border: '1px solid var(--yb-border)',
                  background: 'var(--yb-input)', color: 'var(--yb-muted)',
                  cursor: 'pointer',
                }}>
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowSlider(false)}
            style={{
              marginTop: 8, width: '100%', fontSize: 10, padding: '4px',
              borderRadius: 5, border: '1px solid var(--yb-border)',
              background: 'var(--yb-input)', color: 'var(--yb-subtle)',
              cursor: 'pointer',
            }}>fechar</button>
        </div>
      )}
    </div>
  );
}

// ── Voice Control ─────────────────────────────────────────────────────────────

const VOICE_ITEMS: { key: 'escalation' | 'lead' | 'agg' | 'live_chat'; label: string }[] = [
  { key: 'escalation', label: 'Escalamento' },
  { key: 'lead',       label: 'Nova lead' },
  { key: 'agg',        label: 'Agregação' },
  { key: 'live_chat',  label: 'Chat ao vivo' },
];

function VoiceButton({ expandido = false }: { expandido?: boolean }) {
  const [enabled, setEnabled] = useState(false);
  const [perType, setPerType] = useState({ escalation: true, lead: true, agg: false, live_chat: true });
  const [showPanel, setShowPanel] = useState(false);

  useEffect(() => {
    setEnabled(getVoiceSetting('enabled'));
    setPerType({
      escalation: getVoiceSetting('escalation'),
      lead:       getVoiceSetting('lead'),
      agg:        getVoiceSetting('agg'),
      live_chat:  getVoiceSetting('live_chat'),
    });
    const handler = () => {
      setEnabled(getVoiceSetting('enabled'));
      setPerType({
        escalation: getVoiceSetting('escalation'),
        lead:       getVoiceSetting('lead'),
        agg:        getVoiceSetting('agg'),
        live_chat:  getVoiceSetting('live_chat'),
      });
    };
    window.addEventListener('ybvoicechange', handler);
    return () => window.removeEventListener('ybvoicechange', handler);
  }, []);

  function toggleEnabled() {
    const next = !enabled;
    setVoiceSetting('enabled', next);
    setEnabled(next);
    if (next) setTimeout(previewVoice, 80);
  }

  function toggleType(key: 'escalation' | 'lead' | 'agg' | 'live_chat') {
    const next = !perType[key];
    setVoiceSetting(key, next);
    setPerType((p) => ({ ...p, [key]: next }));
  }

  return (
    <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center', padding: expandido ? '0 8px' : 0 }}>
      <button
        onClick={toggleEnabled}
        onContextMenu={(e) => { e.preventDefault(); setShowPanel((s) => !s); }}
        title={`Voz: ${enabled ? 'ON' : 'OFF'} — clique para ligar/desligar, clique-direito para opções`}
        style={{
          width: expandido ? '100%' : 44, height: 32, borderRadius: 8, border: 'none',
          background: 'transparent', cursor: 'pointer',
          gap: 11, padding: expandido ? '0 11px' : 0,
          display: 'flex', alignItems: 'center',
          justifyContent: expandido ? 'flex-start' : 'center',
          color: enabled ? 'var(--yb-cyan)' : 'var(--yb-subtle)',
          transition: 'color 0.2s',
        }}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          <line x1="12" y1="19" x2="12" y2="23"/>
          <line x1="8" y1="23" x2="16" y2="23"/>
        </svg>
        {expandido && (
          <span style={{ fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>{`Voz — ${enabled ? 'ligada' : 'desligada'}`}</span>
        )}
      </button>

      {showPanel && (
        <div style={{
          position: 'absolute', bottom: 40, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--yb-card)', border: '1px solid var(--yb-border)',
          borderRadius: 10, padding: '10px 12px', width: 150, zIndex: 200,
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <p style={{ fontSize: 10, color: 'var(--yb-subtle)', margin: 0 }}>Voz — {enabled ? 'ON' : 'OFF'}</p>
            <button
              onClick={toggleEnabled}
              style={{
                fontSize: 9, padding: '3px 8px', borderRadius: 5, cursor: 'pointer',
                border: `1px solid ${enabled ? 'var(--yb-cyan)' : 'var(--yb-border)'}`,
                background: enabled ? 'rgba(0,188,212,0.15)' : 'var(--yb-input)',
                color: enabled ? 'var(--yb-cyan)' : 'var(--yb-subtle)',
                fontWeight: 700,
              }}
            >{enabled ? 'Desligar' : 'Ligar'}</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 8 }}>
            {VOICE_ITEMS.map(({ key, label }) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', opacity: enabled ? 1 : 0.35 }}>
                <input
                  type="checkbox"
                  checked={perType[key]}
                  disabled={!enabled}
                  onChange={() => toggleType(key)}
                  style={{ accentColor: '#00bcd4', width: 13, height: 13 }}
                />
                <span style={{ fontSize: 10, color: 'var(--yb-muted)' }}>{label}</span>
              </label>
            ))}
          </div>
          <button
            onClick={() => { if (enabled) previewVoice(); }}
            disabled={!enabled}
            style={{
              width: '100%', fontSize: 9, padding: '4px', borderRadius: 5,
              border: '1px solid var(--yb-border)',
              background: 'var(--yb-input)', color: 'var(--yb-muted)',
              cursor: enabled ? 'pointer' : 'default', opacity: enabled ? 1 : 0.3,
              marginBottom: 6,
            }}>▶ Testar voz</button>
          <button
            onClick={() => setShowPanel(false)}
            style={{
              width: '100%', fontSize: 10, padding: '4px', borderRadius: 5,
              border: '1px solid var(--yb-border)',
              background: 'var(--yb-input)', color: 'var(--yb-subtle)',
              cursor: 'pointer',
            }}>fechar</button>
        </div>
      )}
    </div>
  );
}

// ── Divider ───────────────────────────────────────────────────────────────────

function Divider({ expandido = false }: { expandido?: boolean }) {
  return (
    <div style={{
      width: expandido ? 'calc(100% - 22px)' : 38,
      height: 1, background: 'var(--yb-border)', margin: '6px auto',
    }} />
  );
}

// ── NavSidebar ────────────────────────────────────────────────────────────────

/**
 * Largura do menu.
 *
 * Aberto, cada icone vem com a sua designacao: um icone sozinho obriga a passar o rato
 * por cima para descobrir o que faz, e isso repete-se todos os dias. Fechado sobra
 * largura para o conteudo — por isso a escolha fica gravada e nao se perde na sessao
 * seguinte.
 */
const LARGURA_ABERTA = 186;
const LARGURA_FECHADA = 60;
const CHAVE_LARGURA = 'yb-nav-expandido';


export default function NavSidebar({
  activeTab,
  onTabChange,
  leadsCount = 0,
  alertsCount = 0,
  inboxBadge = 0,
  leadsBadge = 0,
  aggBlink = false,
  mobile = false,
}: NavSidebarProps) {
  // Comeca aberto para o que o servidor pinta ser igual ao primeiro fotograma do
  // browser; a preferencia gravada so se le depois de montar.
  const [expandido, setExpandido] = useState(true);
  useEffect(() => {
    try { if (localStorage.getItem(CHAVE_LARGURA) === '0') setExpandido(false); } catch { /* sem localStorage */ }
  }, []);

  function alternarLargura() {
    setExpandido((v) => {
      const novo = !v;
      try { localStorage.setItem(CHAVE_LARGURA, novo ? '1' : '0'); } catch { /* sem localStorage */ }
      return novo;
    });
  }

  const animations = `
    @keyframes aggPulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(1.35); }
    }
    @keyframes aggRing {
      0% { box-shadow: 0 0 0 0 rgba(255,193,7,0.7); }
      70% { box-shadow: 0 0 0 8px rgba(255,193,7,0); }
      100% { box-shadow: 0 0 0 0 rgba(255,193,7,0); }
    }
  `;

  // ── Mobile: bottom nav bar ────────────────────────────────────────────────
  if (mobile) {
    const mobileItems: { id: NavTab; label: string; icon: React.ReactNode; badge?: number; blink?: boolean }[] = [
      { id: 'visitas',    label: 'Visitas',    icon: <IcoVisitas /> },
      { id: 'inbox',      label: 'Inbox',      icon: <IcoInbox />,      badge: inboxBadge },
      { id: 'leads',      label: 'Leads',      icon: <IcoLeads />,      badge: leadsBadge },
      { id: 'clientes',   label: 'Clientes',   icon: <IcoClientes /> },
      { id: 'agregacoes', label: 'Agreg.',     icon: <IcoAgregacoes />, blink: aggBlink },
      { id: 'servicos',   label: 'Serviços',   icon: <IcoServicos /> },
      { id: 'atribuicao', label: 'Atribuição', icon: <IcoAtribuicao /> },
      { id: 'precos',     label: 'Preços',     icon: <IcoPrecos /> },
      { id: 'baseIA',     label: 'Base IA',    icon: <IcoBaseIA /> },
      { id: 'crm',        label: 'CRM',        icon: <IcoCrm /> },
      { id: 'relatorios', label: 'Relatórios', icon: <IcoRelatorios /> },
      { id: 'widgets',    label: 'Widgets',    icon: <IcoWidgets /> },
      { id: 'config',     label: 'Perfil',     icon: <IcoPerfil /> },
    ];

    return (
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        height: 56, background: 'var(--yb-card)',
        display: 'flex', alignItems: 'stretch',
        borderTop: '1px solid var(--yb-border)',
        zIndex: 100, userSelect: 'none',
        paddingBottom: 'env(safe-area-inset-bottom)',
        overflowX: 'auto',
        scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch',
      } as React.CSSProperties}>
        <style>{animations}{`nav::-webkit-scrollbar{display:none}`}</style>
        {mobileItems.map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              style={{
                minWidth: 64, flexShrink: 0,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 3,
                background: 'none', border: 'none', cursor: 'pointer',
                color: active ? 'var(--yb-cyan)' : 'var(--yb-subtle)',
                position: 'relative',
                transition: 'color 0.15s',
                padding: '0 4px',
              }}
            >
              {item.icon}
              <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.01em', whiteSpace: 'nowrap' }}>{item.label}</span>
              {(item.badge ?? 0) > 0 && (
                <span style={{
                  position: 'absolute', top: 6, right: '50%', transform: 'translateX(8px)',
                  width: 14, height: 14, borderRadius: '50%',
                  background: '#ffc107', color: '#1a2332',
                  fontSize: 8, fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {(item.badge ?? 0) > 9 ? '9+' : item.badge}
                </span>
              )}
              {item.blink && (
                <span style={{
                  position: 'absolute', top: 6, right: '50%', transform: 'translateX(8px)',
                  width: 8, height: 8, borderRadius: '50%',
                  background: '#ffc107',
                  animation: 'aggPulse 1s ease-in-out infinite',
                }} />
              )}
              {active && (
                <span style={{
                  position: 'absolute', top: 0, left: '15%', right: '15%',
                  height: 2, background: '#00bcd4', borderRadius: '0 0 2px 2px',
                }} />
              )}
            </button>
          );
        })}
      </nav>
    );
  }

  // ── Desktop: sidebar vertical ─────────────────────────────────────────────
  const grupo: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
    width: '100%', padding: expandido ? '4px 8px' : '4px 0',
  };

  return (
    <nav
      style={{
        width: expandido ? LARGURA_ABERTA : LARGURA_FECHADA, flexShrink: 0,
        background: 'var(--yb-bg)',
        borderRight: '1px solid var(--yb-border)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '10px 0 10px',
        height: '100vh', overflowY: 'auto', overflowX: 'hidden',
        userSelect: 'none',
        transition: 'width 0.16s ease',
      }}
    >
      <style>{animations}</style>
      {aggBlink && (
        <div style={{
          position: 'absolute', top: 8, left: 8,
          width: 10, height: 10, borderRadius: '50%',
          background: '#ffc107',
          animation: 'aggPulse 1s ease-in-out infinite, aggRing 1.5s ease-out infinite',
          zIndex: 10,
        }} />
      )}

      {/* Logo e o interruptor da largura */}
      <div style={{
        display: 'flex', flexDirection: expandido ? 'row' : 'column',
        alignItems: 'center', gap: expandido ? 9 : 6, width: '100%',
        padding: expandido ? '0 11px' : 0, marginBottom: 14,
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-64x64.png" alt="YourBox" style={{ width: 34, height: 34, display: 'block', borderRadius: 8, flexShrink: 0 }} />
        {expandido && (
          <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--yb-fg)', letterSpacing: '-0.01em' }}>
            YourBox
          </span>
        )}
        <button
          onClick={alternarLargura}
          title={expandido ? 'Encolher o menu' : 'Mostrar as designações'}
          style={{
            marginLeft: expandido ? 'auto' : 0,
            width: 26, height: 26, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 7, border: 'none', background: 'transparent',
            color: 'var(--yb-subtle)', cursor: 'pointer', transition: 'color 0.15s',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--yb-muted)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--yb-subtle)'; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points={expandido ? '15 18 9 12 15 6' : '9 18 15 12 9 6'} />
          </svg>
        </button>
      </div>

      <Divider expandido={expandido} />

      {/* Main nav */}
      <div style={grupo}>
        <NavItem id="visitas"    label="Visitas"    icon={<IcoVisitas />}    active={activeTab === 'visitas'}    expandido={expandido} onClick={() => onTabChange('visitas')} />
        <NavItem id="inbox"      label="Inbox"      icon={<IcoInbox />}      active={activeTab === 'inbox'}      expandido={expandido} onClick={() => onTabChange('inbox')}      badge={inboxBadge} />
        <NavItem id="leads"      label="Leads"      icon={<IcoLeads />}      active={activeTab === 'leads'}      expandido={expandido} onClick={() => onTabChange('leads')}      badge={leadsBadge} />
        <NavItem id="clientes"   label="Clientes"   icon={<IcoClientes />}   active={activeTab === 'clientes'}   expandido={expandido} onClick={() => onTabChange('clientes')} />
        <NavItem id="agregacoes" label="Agregações" icon={<IcoAgregacoes />} active={activeTab === 'agregacoes'} expandido={expandido} onClick={() => onTabChange('agregacoes')} badge={aggBlink ? 1 : 0} />
      </div>

      <Divider expandido={expandido} />

      <div style={grupo}>
        <NavItem id="servicos"   label="Serviços"      icon={<IcoServicos />}   active={activeTab === 'servicos'}   expandido={expandido} onClick={() => onTabChange('servicos')} />
        <NavItem id="precos"     label="Preços"        icon={<IcoPrecos />}     active={activeTab === 'precos'}     expandido={expandido} onClick={() => onTabChange('precos')} />
        <NavItem id="baseIA"     label="Base IA"       icon={<IcoBaseIA />}     active={activeTab === 'baseIA'}     expandido={expandido} onClick={() => onTabChange('baseIA')} />
        <NavItem id="crm"        label="CRM Parceiros" icon={<IcoCrm />}        active={activeTab === 'crm'}        expandido={expandido} onClick={() => onTabChange('crm')} />
        <NavItem id="relatorios" label="Relatórios"    icon={<IcoRelatorios />} active={activeTab === 'relatorios'} expandido={expandido} onClick={() => onTabChange('relatorios')} />
        <NavItem id="atribuicao" label="Atribuição"    icon={<IcoAtribuicao />} active={activeTab === 'atribuicao'} expandido={expandido} onClick={() => onTabChange('atribuicao')} />
        <NavItem id="widgets"    label="Widgets"       icon={<IcoWidgets />}    active={activeTab === 'widgets'}    expandido={expandido} onClick={() => onTabChange('widgets')} />
      </div>

      <div style={{ flex: 1, minHeight: 12 }} />

      {/* Counters */}
      <div style={{ display: 'flex', flexDirection: expandido ? 'row' : 'column', gap: 4, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
        {leadsCount > 0 && (
          <span title="Leads" style={{ background: 'rgba(0,188,212,0.15)', color: '#00bcd4', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 10, border: '1px solid rgba(0,188,212,0.25)' }}>
            {expandido ? `${leadsCount} leads` : leadsCount}
          </span>
        )}
        {alertsCount > 0 && (
          <span title="Alertas" style={{ background: 'rgba(255,193,7,0.15)', color: '#ffc107', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 10, border: '1px solid rgba(255,193,7,0.25)' }}>
            {expandido ? `${alertsCount} alertas` : alertsCount}
          </span>
        )}
      </div>

      <SoundButton expandido={expandido} />
      <VoiceButton expandido={expandido} />

      <Divider expandido={expandido} />

      <div style={grupo}>
        <NavItem id="config" label="Perfil & Config" icon={<IcoPerfil />} active={activeTab === 'config'} expandido={expandido} onClick={() => onTabChange('config')} />
      </div>

      {/* Links utilitários */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6, alignItems: 'center', width: '100%', padding: expandido ? '0 8px' : 0 }}>
        {([
          {
            href: '/manual.html', alvo: '_blank', label: 'Manual',
            title: 'Manual de Utilizador',
            path: <><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></>,
          },
          {
            // Ficheiro estatico, gerado do proprio manual por scripts/gerar-manual-pdf.mjs.
            // Serve para levar para uma reuniao ou dar a quem entra de novo.
            href: '/manual.pdf', alvo: '_blank', label: 'Manual em PDF',
            title: 'Descarregar o manual completo em PDF',
            path: <>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </>,
          },
        ] as const).map((l) => (
          <a
            key={l.href}
            href={l.href} target={l.alvo} rel={l.alvo ? 'noopener noreferrer' : undefined}
            title={l.title}
            style={{
              width: expandido ? '100%' : 36, height: 32,
              display: 'flex', alignItems: 'center',
              justifyContent: expandido ? 'flex-start' : 'center',
              gap: 11, padding: expandido ? '0 11px' : 0,
              borderRadius: 7, textDecoration: 'none',
              color: 'var(--yb-subtle)',
              transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--yb-muted)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--yb-subtle)'; }}
          >
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, flexShrink: 0 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {l.path}
              </svg>
            </span>
            {expandido && (
              <span style={{ fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>{l.label}</span>
            )}
          </a>
        ))}
      </div>
    </nav>
  );
}
