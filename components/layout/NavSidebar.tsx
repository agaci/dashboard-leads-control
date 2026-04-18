'use client';

export type NavTab =
  | 'leads' | 'inbox' | 'clientes' | 'servicos'
  | 'precos' | 'baseIA' | 'relatorios'
  | 'routing';

interface NavSidebarProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  leadsCount?: number;
  alertsCount?: number;
  inboxBadge?: number;
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
        width: 72, display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 4, padding: '8px 4px', borderRadius: 8, border: 'none', cursor: 'pointer',
        position: 'relative',
        background: active ? '#00bcd4' : 'transparent',
        color: active ? '#fff' : 'rgba(255,255,255,0.4)',
        transition: 'background 0.15s, color 0.15s',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)';
          (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.75)';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.4)';
        }
      }}
    >
      {icon}
      <span style={{ fontSize: 10, fontWeight: 600, lineHeight: 1, letterSpacing: '0.01em' }}>
        {label}
      </span>
      {badge != null && badge > 0 && (
        <span style={{
          position: 'absolute', top: 5, right: 8,
          width: 15, height: 15, borderRadius: '50%',
          background: '#ffc107', color: '#1a2332',
          fontSize: 9, fontWeight: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          lineHeight: 1,
        }}>
          {badge > 99 ? '99' : badge}
        </span>
      )}
    </button>
  );
}

// ── Divider ───────────────────────────────────────────────────────────────────

function Divider() {
  return (
    <div style={{ width: 38, height: 1, background: 'rgba(255,255,255,0.08)', margin: '6px auto' }} />
  );
}

// ── NavSidebar ────────────────────────────────────────────────────────────────

export default function NavSidebar({
  activeTab,
  onTabChange,
  leadsCount = 41,
  alertsCount = 53,
  inboxBadge = 7,
}: NavSidebarProps) {
  return (
    <nav
      style={{
        width: 82, flexShrink: 0,
        background: '#1a2332',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '12px 5px 12px',
        height: '100vh', overflowY: 'auto', overflowX: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* Logo */}
      <div style={{ marginBottom: 16, width: 52, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="YourBox" style={{ width: 48, height: 'auto', display: 'block' }} />
      </div>

      {/* Main nav */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, width: '100%' }}>
        <NavItem id="leads"      label="Leads"     icon={<IcoLeads />}     active={activeTab === 'leads'}      onClick={() => onTabChange('leads')} />
        <NavItem id="inbox"      label="Inbox"     icon={<IcoInbox />}     active={activeTab === 'inbox'}      onClick={() => onTabChange('inbox')}  badge={inboxBadge} />
        <NavItem id="clientes"   label="Clientes"  icon={<IcoClientes />}  active={activeTab === 'clientes'}   onClick={() => onTabChange('clientes')} />
        <NavItem id="servicos"   label="Serviços"  icon={<IcoServicos />}  active={activeTab === 'servicos'}   onClick={() => onTabChange('servicos')} />
        <NavItem id="precos"     label="Preços"    icon={<IcoPrecos />}    active={activeTab === 'precos'}     onClick={() => onTabChange('precos')} />
        <NavItem id="baseIA"     label="Base IA"   icon={<IcoBaseIA />}    active={activeTab === 'baseIA'}     onClick={() => onTabChange('baseIA')} />
      </div>

      <Divider />

      <NavItem id="relatorios" label="Relatórios" icon={<IcoRelatorios />} active={activeTab === 'relatorios'} onClick={() => onTabChange('relatorios')} />

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Counters */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        <span style={{
          background: '#00bcd4', color: '#fff',
          fontSize: 10, fontWeight: 700,
          padding: '3px 7px', borderRadius: 20,
        }}>
          {leadsCount}
        </span>
        <span style={{
          background: '#ffc107', color: '#1a2332',
          fontSize: 10, fontWeight: 700,
          padding: '3px 7px', borderRadius: 20,
        }}>
          {alertsCount}
        </span>
      </div>

      <Divider />

      {/* Bottom: Perfil + Config */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, width: '100%' }}>
        <NavItem id="routing" label="Perfil"  icon={<IcoPerfil />}  active={false} onClick={() => {}} />
        <NavItem id="routing" label="Config"  icon={<IcoConfig />}  active={activeTab === 'routing'} onClick={() => onTabChange('routing')} />
      </div>
    </nav>
  );
}
