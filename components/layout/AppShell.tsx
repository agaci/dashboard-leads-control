'use client';

import NavSidebar, { type NavTab } from './NavSidebar';
import { useIsMobile } from '@/lib/useIsMobile';

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
  const isMobile = useIsMobile();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        height: '100vh',
        overflow: 'hidden',
        fontFamily: 'Nunito, system-ui, sans-serif',
        background: '#f5f6fa',
        position: 'relative',
      }}
    >
      {!isMobile && (
        <NavSidebar
          activeTab={activeTab}
          onTabChange={onTabChange}
          leadsCount={leadsCount}
          alertsCount={alertsCount}
          inboxBadge={inboxBadge}
          aggBlink={aggBlink}
        />
      )}

      <div
        style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden',
          minWidth: 0,
          paddingBottom: isMobile ? 56 : 0,
        }}
      >
        {children}
      </div>

      {isMobile && (
        <NavSidebar
          activeTab={activeTab}
          onTabChange={onTabChange}
          leadsCount={leadsCount}
          alertsCount={alertsCount}
          inboxBadge={inboxBadge}
          aggBlink={aggBlink}
          mobile
        />
      )}
    </div>
  );
}
