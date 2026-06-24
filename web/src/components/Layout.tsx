import React, { useState, useCallback } from 'react';
import {
  LayoutDashboard,
  FolderKanban,
  Layers3,
  ClipboardList,
  TestTube2,
  FileText,
  Building2,
  Bot,
  BarChart3,
  GitBranch,
  Settings,
  Search,
  Bell,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Menu,
} from 'lucide-react';
import type { PageKey, SessionUser } from '../types';
import AiSidebar, { type AiSidebarRisk } from './common/AiSidebar';

// ---------------------------------------------------------------------------
// Navigation items
// ---------------------------------------------------------------------------

interface NavEntry {
  key: PageKey;
  label: string;
  icon: React.FC<{ size?: number }>;
}

const navItems: NavEntry[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'projects', label: 'Projects', icon: FolderKanban },
  { key: 'products', label: 'Products', icon: Layers3 },
  { key: 'requirements', label: 'Requirements', icon: ClipboardList },
  { key: 'testing', label: 'Testing', icon: TestTube2 },
  { key: 'documents', label: 'Documents', icon: FileText },
  { key: 'organization', label: 'Organization', icon: Building2 },
  { key: 'ai', label: 'AI Analysis', icon: Bot },
  { key: 'reports', label: 'Reports', icon: BarChart3 },
  { key: 'flow', label: 'Dev Flow', icon: GitBranch },
  { key: 'settings', label: 'Settings', icon: Settings },
];

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

interface LayoutProps {
  /** The currently active page */
  currentPage: PageKey;
  /** Called when a nav item is clicked */
  onNavigate: (page: PageKey) => void;
  /** The authenticated user */
  user: SessionUser;
  /** Called when the user clicks logout */
  onLogout: () => void;
  /** Page content to render in the main area */
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({
  currentPage,
  onNavigate,
  user,
  onLogout,
  children,
}) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [aiSidebarOpen, setAiSidebarOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
  }, []);

  const toggleAiSidebar = useCallback(() => {
    setAiSidebarOpen((prev) => !prev);
  }, []);

  const handleNavClick = useCallback(
    (page: PageKey) => {
      onNavigate(page);
      setMobileNavOpen(false);
    },
    [onNavigate],
  );

  // Generate user initials for avatar
  const userInitials = user.name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  // AI sidebar demo data
  const aiRisks: AiSidebarRisk[] = [
    { text: '2 projects have health score below threshold', level: 'risk' },
    { text: 'Requirement review cycle exceeding 5 days', level: 'warning' },
    { text: 'Test coverage trend is stable this sprint', level: 'info' },
  ];

  const aiRecommendations = [
    'Review blocked items in red-status projects and resolve dependencies.',
    'Schedule requirement review sync to reduce cycle time.',
    'Consider re-allocating resources from completed tasks to at-risk items.',
  ];

  const shellClass = [
    'app-shell',
    sidebarCollapsed ? 'sidebar-collapsed' : '',
    aiSidebarOpen ? 'ai-sidebar-open' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={shellClass}>
      {/* Mobile scrim */}
      <div
        className={`mobile-scrim ${mobileNavOpen ? 'visible' : ''}`}
        onClick={() => setMobileNavOpen(false)}
      />

      {/* Left Sidebar */}
      <aside className={`sidebar ${mobileNavOpen ? 'mobile-open' : ''}`}>
        {/* Brand */}
        <div className="sidebar-brand">
          <div className="sidebar-brand-logo">P</div>
          <div className="sidebar-brand-text">Project Platform</div>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          {navItems.map((item, index) => {
            const Icon = item.icon;
            const isActive = currentPage === item.key;

            // Add a divider before "Settings"
            const showDivider = item.key === 'settings';

            return (
              <React.Fragment key={item.key}>
                {showDivider && <div className="sidebar-nav-divider" />}
                <button
                  className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => handleNavClick(item.key)}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </button>
              </React.Fragment>
            );
          })}
        </nav>

        {/* Footer with collapse toggle */}
        <div className="sidebar-footer">
          <button className="sidebar-toggle" onClick={toggleSidebar}>
            {sidebarCollapsed ? (
              <ChevronRight size={16} />
            ) : (
              <>
                <ChevronLeft size={16} />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Main Area */}
      <div className="main-content">
        {/* Top Bar */}
        <header className="topbar">
          {/* Mobile menu button (shown only on small screens via CSS) */}
          <button
            className="topbar-icon-button mobile-menu-toggle"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation"
          >
            <Menu size={18} />
          </button>

          {/* Search */}
          <div className="topbar-search">
            <Search size={16} className="topbar-search-icon" />
            <input
              className="topbar-search-input"
              type="text"
              placeholder="Search projects, requirements, documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Actions */}
          <div className="topbar-actions">
            {/* AI toggle */}
            <button
              className="topbar-icon-button"
              onClick={toggleAiSidebar}
              title={aiSidebarOpen ? 'Hide AI panel' : 'Show AI panel'}
            >
              <Sparkles size={18} />
            </button>

            {/* Notification bell */}
            <button className="topbar-icon-button" title="Notifications">
              <Bell size={18} />
              <span className="topbar-notification-dot" />
            </button>

            {/* User */}
            <span className="topbar-user-name">{user.name}</span>
            <div className="topbar-avatar">{userInitials}</div>

            {/* Logout */}
            <button
              className="btn btn-text btn-sm"
              onClick={onLogout}
            >
              Sign out
            </button>
          </div>
        </header>

        {/* Page Content */}
        <div className="main-content-body">{children}</div>
      </div>

      {/* AI Sidebar */}
      {aiSidebarOpen && (
        <AiSidebar
          contextSubtitle={`Current view: ${navItems.find((n) => n.key === currentPage)?.label ?? 'Dashboard'}`}
          summary="Based on current project data, overall health is good with a few items requiring attention in the testing phase."
          risks={aiRisks}
          recommendations={aiRecommendations}
          evidence={[
            {
              source: 'Sprint Report #14',
              quote: 'Test pass rate dropped 3% compared to last sprint.',
            },
          ]}
          onConfirm={() => {
            /* Future: confirm AI suggestions */
          }}
          onEdit={() => {
            /* Future: edit AI output */
          }}
          onIgnore={() => setAiSidebarOpen(false)}
          onClose={() => setAiSidebarOpen(false)}
        />
      )}
    </div>
  );
};

export default Layout;
