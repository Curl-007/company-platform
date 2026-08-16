import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PageKey, SessionUser } from '../types';
import { NAV_GROUPS } from '../app/pageRegistry';
import { canAccessPageForUser } from '../constants/roles';
import { useLocale } from '../i18n/LanguageProvider';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from './ui/Sidebar';

interface AppSidebarProps {
  currentPage: PageKey;
  user: SessionUser;
  onNavigate: (page: PageKey, focusId?: string) => void;
}

export default function AppSidebar({ currentPage, user, onNavigate }: AppSidebarProps) {
  const { open, isMobile, mobileOpen, setMobileOpen } = useSidebar();
  const { t } = useTranslation();
  const { locale, setLocale } = useLocale();
  const expanded = isMobile ? mobileOpen : open;
  const [expandedGroups, setExpandedGroups] = React.useState<Record<string, boolean>>(() => (
    Object.fromEntries(NAV_GROUPS.map((group) => [group.id, true]))
  ));

  const navigate = (page: PageKey, focusId?: string) => {
    onNavigate(page, focusId);
    if (isMobile) setMobileOpen(false);
  };

  const accessibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => canAccessPageForUser(user, item.key)),
  })).filter((group) => group.items.length > 0);

  return (
    <Sidebar id="primary-sidebar" className="sidebar" collapsible="icon" variant="inset">
      <SidebarHeader>
        <div className="kaneo-sidebar-brand">
          <span className="kaneo-sidebar-brand-mark" aria-hidden="true">P</span>
          {expanded ? <span className="kaneo-sidebar-brand-name">{t('nav.brand')}</span> : null}
        </div>
      </SidebarHeader>
      <SidebarContent className="sidebar-nav">
        {accessibleGroups.map((group) => {
          const isGroupExpanded = expandedGroups[group.id] ?? true;
          const groupId = `sidebar-group-${group.id}`;
          return (
            <SidebarGroup key={group.id}>
              {expanded ? (
                <SidebarGroupLabel>
                  <button
                    type="button"
                    className="kaneo-sidebar-group-toggle"
                    aria-expanded={isGroupExpanded}
                    aria-controls={groupId}
                    onClick={() => setExpandedGroups((state) => ({ ...state, [group.id]: !isGroupExpanded }))}
                  >
                    <span>{t(`nav.group.${group.id}`, { defaultValue: group.label })}</span>
                    {isGroupExpanded ? <ChevronDown size={13} aria-hidden="true" /> : <ChevronRight size={13} aria-hidden="true" />}
                  </button>
                </SidebarGroupLabel>
              ) : null}
              <div id={groupId} hidden={expanded && !isGroupExpanded}>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = currentPage === item.key;
                    const itemLabel = t(`nav.item.${item.key}`, { defaultValue: item.label });
                    return (
                      <SidebarMenuItem key={`${group.id}-${item.key}`}>
                        <SidebarMenuButton
                          isActive={isActive}
                          title={itemLabel}
                          aria-label={itemLabel}
                          data-page={item.key}
                          onClick={() => navigate(item.key)}
                        >
                          <Icon size={16} aria-hidden="true" />
                          {expanded ? <span>{itemLabel}</span> : <span className="sr-only">{itemLabel}</span>}
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </div>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
      {expanded ? (
        <SidebarFooter>
          <div className="kaneo-sidebar-lang-switch" role="group" aria-label={t('common.language')}>
            {(['zh-CN', 'en-US'] as const).map((code) => (
              <button
                key={code}
                type="button"
                className={`kaneo-sidebar-lang-btn ${locale === code ? 'active' : ''}`}
                aria-pressed={locale === code}
                onClick={() => setLocale(code)}
                title={code === 'zh-CN' ? t('settings.language.zhCN') : t('settings.language.enUS')}
              >
                {code === 'zh-CN' ? '中' : 'EN'}
              </button>
            ))}
          </div>
        </SidebarFooter>
      ) : null}
    </Sidebar>
  );
}
