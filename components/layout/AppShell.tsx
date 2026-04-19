'use client';

import NavSidebar, { type NavTab } from './NavSidebar';

interface AppShellProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  children: React.ReactNode;
  leadsCount?: number;
  alertsCount?: number;
  inboxBadge?: number;
  aggBlink?: boolean;
}

export default function AppShell({
  activeTab,
  onTabChange,
  children,
  leadsCount,
  alertsCount,
  inboxBadge,
  aggBlink,
}: AppShellProps) {
  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        overflow: 'hidden',
        fontFamily: 'Nunito, system-ui, sans-serif',
        background: '#f5f6fa',
        position: 'relative',
      }}
    >
      <NavSidebar
        activeTab={activeTab}
        onTabChange={onTabChange}
        leadsCount={leadsCount}
        alertsCount={alertsCount}
        inboxBadge={inboxBadge}
        aggBlink={aggBlink}
      />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minWidth: 0 }}>
        {children}
      </div>
    </div>
  );
}
