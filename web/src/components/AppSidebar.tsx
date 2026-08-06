import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { PageKey, SessionUser } from '../types';
import { NAV_GROUPS } from '../app/pageRegistry';
import { canAccessPageForUser } from '../constants/roles';
import {
  Sidebar,
  SidebarContent,
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
  const expanded = isMobile ? mobileOpen : open;
  const [expandedGroups, setExpandedGroups] = React.useState<Record<string, boolean>>(() => (
    Object.fromEntries(NAV_GROUPS.map((group) => [group.label, true]))
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
          {expanded ? <span className="kaneo-sidebar-brand-name">公司管理平台</span> : null}
        </div>
      </SidebarHeader>
      <SidebarContent className="sidebar-nav">
        {accessibleGroups.map((group) => {
          const isGroupExpanded = expandedGroups[group.label] ?? true;
          const groupId = `sidebar-group-${group.label}`;
          return (
            <SidebarGroup key={group.label}>
              {expanded ? (
                <SidebarGroupLabel>
                  <button
                    type="button"
                    className="kaneo-sidebar-group-toggle"
                    aria-expanded={isGroupExpanded}
                    aria-controls={groupId}
                    onClick={() => setExpandedGroups((state) => ({ ...state, [group.label]: !isGroupExpanded }))}
                  >
                    <span>{group.label}</span>
                    {isGroupExpanded ? <ChevronDown size={13} aria-hidden="true" /> : <ChevronRight size={13} aria-hidden="true" />}
                  </button>
                </SidebarGroupLabel>
              ) : null}
              <div id={groupId} hidden={expanded && !isGroupExpanded}>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = currentPage === item.key;
                    return (
                      <SidebarMenuItem key={`${group.label}-${item.key}`}>
                        <SidebarMenuButton
                          isActive={isActive}
                          title={item.label}
                          aria-label={item.label}
                          data-page={item.key}
                          onClick={() => navigate(item.key)}
                        >
                          <Icon size={16} aria-hidden="true" />
                          {expanded ? <span>{item.label}</span> : <span className="sr-only">{item.label}</span>}
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
    </Sidebar>
  );
}
