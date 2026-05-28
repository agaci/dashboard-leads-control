'use client';

import { useState, useEffect } from 'react';
import { getVolume, setVolume, playLeadSound, playEscalationSound, playAggSound } from '@/lib/soundManager';
import { getVoiceSetting, setVoiceSetting, previewVoice } from '@/lib/ttsManager';

export type NavTab =
  | 'leads' | 'inbox' | 'clientes' | 'servicos'
  | 'precos' | 'baseIA' | 'relatorios' | 'agregacoes'
  | 'routing' | 'widgets' | 'config';

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
  onClick: () => void;
}

function NavItem({ id, label, icon, active, badge, onClick }: NavItemProps) {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
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
      {icon}
      {badge != null && badge > 0 && (
        <span style={{
          position: 'absolute', top: 6, right: 6,
          width: 14, height: 14, borderRadius: '50%',
          background: '#ffc107', color: '#1a2b4a',
          fontSize: 8, fontWeight: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          lineHeight: 1,
        }}>
          {badge > 99 ? '99' : badge}
        </span>
      )}
    </button>
  );
}

// ── Sound Control ────────────────────────────────────────────────────────────

const VOL_STEPS = [0, 0.3, 0.65, 1];

function SoundButton() {
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
    <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
      <button
        onClick={cycleVolume}
        onContextMenu={(e) => { e.preventDefault(); setShowSlider((s) => !s); }}
        title={`Som: ${volPct}% — clique para ciclar, clique-direito para controlo fino`}
        style={{
          width: 44, height: 32, borderRadius: 8, border: 'none',
          background: 'transparent', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
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

function VoiceButton() {
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
    <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
      <button
        onClick={toggleEnabled}
        onContextMenu={(e) => { e.preventDefault(); setShowPanel((s) => !s); }}
        title={`Voz: ${enabled ? 'ON' : 'OFF'} — clique para ligar/desligar, clique-direito para opções`}
        style={{
          width: 44, height: 32, borderRadius: 8, border: 'none',
          background: 'transparent', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
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

function Divider() {
  return (
    <div style={{ width: 38, height: 1, background: 'var(--yb-border)', margin: '6px auto' }} />
  );
}

// ── NavSidebar ────────────────────────────────────────────────────────────────

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
      { id: 'inbox',      label: 'Inbox',      icon: <IcoInbox />,      badge: inboxBadge },
      { id: 'leads',      label: 'Leads',      icon: <IcoLeads />,      badge: leadsBadge },
      { id: 'clientes',   label: 'Clientes',   icon: <IcoClientes /> },
      { id: 'agregacoes', label: 'Agreg.',     icon: <IcoAgregacoes />, blink: aggBlink },
      { id: 'servicos',   label: 'Serviços',   icon: <IcoServicos /> },
      { id: 'precos',     label: 'Preços',     icon: <IcoPrecos /> },
      { id: 'baseIA',     label: 'Base IA',    icon: <IcoBaseIA /> },
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
  return (
    <nav
      style={{
        width: 60, flexShrink: 0,
        background: 'var(--yb-bg)',
        borderRight: '1px solid var(--yb-border)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '10px 0 10px',
        height: '100vh', overflowY: 'auto', overflowX: 'hidden',
        userSelect: 'none',
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

      {/* Logo */}
      <div style={{ marginBottom: 16, width: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-64x64.png" alt="YourBox" style={{ width: 36, height: 36, display: 'block', borderRadius: 8 }} />
      </div>

      <Divider />

      {/* Main nav */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, width: '100%', padding: '4px 0' }}>
        <NavItem id="inbox"      label="Inbox"     icon={<IcoInbox />}      active={activeTab === 'inbox'}      onClick={() => onTabChange('inbox')}      badge={inboxBadge} />
        <NavItem id="leads"      label="Leads"     icon={<IcoLeads />}      active={activeTab === 'leads'}      onClick={() => onTabChange('leads')}      badge={leadsBadge} />
        <NavItem id="clientes"   label="Clientes"  icon={<IcoClientes />}   active={activeTab === 'clientes'}   onClick={() => onTabChange('clientes')} />
        <NavItem id="agregacoes" label="Agregações" icon={<IcoAgregacoes />} active={activeTab === 'agregacoes'} onClick={() => onTabChange('agregacoes')} badge={aggBlink ? 1 : 0} />
      </div>

      <Divider />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, width: '100%', padding: '4px 0' }}>
        <NavItem id="servicos"   label="Serviços"   icon={<IcoServicos />}   active={activeTab === 'servicos'}   onClick={() => onTabChange('servicos')} />
        <NavItem id="precos"     label="Preços"     icon={<IcoPrecos />}     active={activeTab === 'precos'}     onClick={() => onTabChange('precos')} />
        <NavItem id="baseIA"     label="Base IA"    icon={<IcoBaseIA />}     active={activeTab === 'baseIA'}     onClick={() => onTabChange('baseIA')} />
        <NavItem id="relatorios" label="Relatórios" icon={<IcoRelatorios />} active={activeTab === 'relatorios'} onClick={() => onTabChange('relatorios')} />
        <NavItem id="widgets"    label="Widgets"    icon={<IcoWidgets />}    active={activeTab === 'widgets'}    onClick={() => onTabChange('widgets')} />
      </div>

      <div style={{ flex: 1 }} />

      {/* Counters */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', marginBottom: 8 }}>
        {leadsCount > 0 && (
          <span style={{ background: 'rgba(0,188,212,0.15)', color: '#00bcd4', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 10, border: '1px solid rgba(0,188,212,0.25)' }}>
            {leadsCount}
          </span>
        )}
        {alertsCount > 0 && (
          <span style={{ background: 'rgba(255,193,7,0.15)', color: '#ffc107', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 10, border: '1px solid rgba(255,193,7,0.25)' }}>
            {alertsCount}
          </span>
        )}
      </div>

      <SoundButton />
      <VoiceButton />

      <Divider />

      <NavItem id="config" label="Perfil & Config" icon={<IcoPerfil />} active={activeTab === 'config'} onClick={() => onTabChange('config')} />

      {/* Links utilitários */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 8, alignItems: 'center' }}>
        <a
          href="/manual.html" target="_blank" rel="noopener noreferrer"
          title="Manual de Utilizador"
          style={{
            width: 36, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 7, textDecoration: 'none',
            color: 'var(--yb-subtle)',
            transition: 'color 0.15s',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--yb-muted)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--yb-subtle)'; }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
          </svg>
        </a>
      </div>
    </nav>
  );
}
