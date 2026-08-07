import React from 'react';
import { Bot } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PageKey, SessionUser } from '../types';
import { NAV_ITEMS } from '../app/pageRegistry';
import NotificationBell from './common/NotificationBell';
import ThemeSettings from './common/ThemeSettings';
import { Button, IconButton } from './ui';
import { SidebarTrigger } from './ui/Sidebar';

interface AppHeaderProps {
  currentPage: PageKey;
  user: SessionUser;
  aiSidebarOpen: boolean;
  onAiToggle: () => void;
  onProfileOpen: () => void;
  onLogout: () => void;
}

export default function AppHeader({ currentPage, user, aiSidebarOpen, onAiToggle, onProfileOpen, onLogout }: AppHeaderProps) {
  const { t } = useTranslation();
  const currentNavLabel = NAV_ITEMS.find((item) => item.key === currentPage)?.label ?? t('nav.item.dashboard');
  // Guard against empty / single-word names so we never render "undefined".
  const userInitials = (user.name || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';

  return (
    <header className="kaneo-app-header" data-slot="app-header">
      <div className="kaneo-app-header-leading">
        <SidebarTrigger />
        <span className="kaneo-header-divider" aria-hidden="true" />
        {/* Single source of page identity — content area does not repeat this title. */}
        <h1 className="kaneo-app-header-title">{currentNavLabel}</h1>
      </div>
      <div className="kaneo-app-header-actions">
        <IconButton surface="topbar" icon={<Bot size={16} />} label={aiSidebarOpen ? t('common.hideAiPanel') : t('common.showAiPanel')} onClick={onAiToggle} />
        <ThemeSettings />
        <NotificationBell />
        <button type="button" className="kaneo-user-trigger" onClick={onProfileOpen} aria-label={t('common.openProfile')}>
          <span className="kaneo-user-copy"><strong>{user.name}</strong><small>{user.position || user.role}</small></span>
          <span className="kaneo-user-avatar">{userInitials}</span>
        </button>
        <Button variant="text" size="sm" onClick={onLogout}>{t('auth.signOut')}</Button>
      </div>
    </header>
  );
}
