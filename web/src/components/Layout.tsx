import React, { useCallback, useEffect, useState } from 'react';
import { Menu, Sparkles } from 'lucide-react';
import type { PageKey, SessionUser } from '../types';
import { NAV_GROUPS, NAV_ITEMS } from '../app/pageRegistry';
import { canAccessPageForUser } from '../constants/roles';
import { ApiError } from '../services/api';
import { updateMyProfile, type UpdateProfileInput } from '../services/auth';
import AiSidebar from './common/AiSidebar';
import NotificationBell from './common/NotificationBell';
import Overlay from './common/Overlay';
import Panel from './common/Panel';
import ThemeSettings from './common/ThemeSettings';
import { useToast } from './common/Toast';
import { Button, FormField, IconButton, TextArea, TextInput } from './ui';

interface LayoutProps {
  currentPage: PageKey;
  onNavigate: (page: PageKey, focusId?: string) => void;
  user: SessionUser;
  onUserUpdate?: (user: SessionUser) => void;
  onLogout: () => void;
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({
  currentPage,
  onNavigate,
  user,
  onUserUpdate,
  onLogout,
  children,
}) => {
  const [aiSidebarOpen, setAiSidebarOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const handleNavClick = useCallback(
    (page: PageKey, focusId?: string) => {
      onNavigate(page, focusId);
      setMobileNavOpen(false);
    },
    [onNavigate],
  );

  const userInitials = user.name
    .split(/\s+/)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const currentNavLabel = NAV_ITEMS.find((item) => item.key === currentPage)?.label ?? '工作台';
  const shellClass = [
    'app-shell',
    aiSidebarOpen ? 'ai-sidebar-open' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={shellClass}>
      <div
        className={`mobile-scrim ${mobileNavOpen ? 'visible' : ''}`}
        onClick={() => setMobileNavOpen(false)}
      />

      <aside className={`sidebar ${mobileNavOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-brand">
          <div className="sidebar-brand-logo">P</div>
          <div className="sidebar-brand-text">项目管理平台</div>
        </div>

        <nav className="sidebar-nav">
          {NAV_GROUPS.map((group) => {
            const visibleItems = group.items.filter((item) => canAccessPageForUser(user, item.key));
            if (visibleItems.length === 0) return null;

            return (
              <div className="sidebar-nav-group" key={group.label}>
                <div className="sidebar-nav-group-label">{group.label}</div>
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentPage === item.key;

                  return (
                    <button
                      key={item.key}
                      className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
                      onClick={() => handleNavClick(item.key)}
                    >
                      <Icon size={18} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>

      </aside>

      <div className="main-content">
        <header className="topbar">
          <IconButton
            className="mobile-menu-toggle"
            surface="topbar"
            icon={<Menu size={18} />}
            label="打开导航"
            onClick={() => setMobileNavOpen(true)}
          />

          <div className="topbar-actions">
            <IconButton
              surface="topbar"
              onClick={() => setAiSidebarOpen((prev) => !prev)}
              icon={<Sparkles size={18} />}
              label={aiSidebarOpen ? '隐藏 AI 面板' : '显示 AI 面板'}
            />

            <ThemeSettings />
            <NotificationBell />

            <button
              className="topbar-profile-trigger"
              onClick={() => setProfileOpen(true)}
              aria-label="打开个人资料"
            >
              <span className="topbar-user-name">{user.name}</span>
              <span className="topbar-user-position">{user.position || user.role}</span>
              <span className="topbar-avatar">{userInitials}</span>
            </button>

            <Button variant="text" size="sm" onClick={onLogout}>
              退出
            </Button>
          </div>
        </header>

        <div className="main-content-body">{children}</div>
      </div>

      {aiSidebarOpen && (
        <AiSidebar
          currentPage={currentPage}
          contextLabel={currentNavLabel}
          onClose={() => setAiSidebarOpen(false)}
        />
      )}

      {profileOpen && (
        <ProfileDialog
          user={user}
          onClose={() => setProfileOpen(false)}
          onSaved={(updatedUser) => {
            onUserUpdate?.(updatedUser);
            setProfileOpen(false);
          }}
        />
      )}
    </div>
  );
};

function ProfileDialog({
  user,
  onClose,
  onSaved,
}: {
  user: SessionUser;
  onClose: () => void;
  onSaved: (user: SessionUser) => void;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState<UpdateProfileInput>({
    name: user.name,
    email: user.email,
    phone: user.phone ?? '',
    position: user.position ?? '',
    department: user.department ?? '',
    bio: user.bio ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setDraft({
      name: user.name,
      email: user.email,
      phone: user.phone ?? '',
      position: user.position ?? '',
      department: user.department ?? '',
      bio: user.bio ?? '',
    });
  }, [user]);

  function setField<K extends keyof UpdateProfileInput>(key: K, value: UpdateProfileInput[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setFormError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.name.trim()) {
      setFormError('姓名不能为空');
      return;
    }
    if (!draft.email.trim()) {
      setFormError('邮箱不能为空');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const updated = await updateMyProfile({
        name: draft.name.trim(),
        email: draft.email.trim(),
        phone: draft.phone?.trim(),
        position: draft.position?.trim(),
        department: draft.department?.trim(),
        bio: draft.bio?.trim(),
      });
      toast.success('个人资料已保存');
      onSaved(updated);
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Overlay onClose={onClose} maxWidth={680}>
      <Panel
        title="个人资料"
        subtitle="维护你的基础信息，这些内容会显示在顶部头像和协作资料中。"
      >
        <form className="profile-form" onSubmit={handleSubmit}>
          <div className="profile-dialog-head">
            <div className="profile-dialog-avatar">
              {draft.name
                .split(/\s+/)
                .map((word) => word[0])
                .join('')
                .toUpperCase()
                .slice(0, 2) || 'U'}
            </div>
            <div>
              <div className="profile-dialog-name">{draft.name || user.name}</div>
              <div className="profile-dialog-meta">
                {draft.position || user.role} · {draft.department || '未设置部门'}
              </div>
            </div>
          </div>

          {formError && <div className="form-error">{formError}</div>}

          <div className="form-row">
            <FormField label="姓名" htmlFor="profile-name" required>
              <TextInput
                id="profile-name"
                value={draft.name}
                invalid={Boolean(formError && !draft.name.trim())}
                onChange={(event) => setField('name', event.target.value)}
              />
            </FormField>
            <FormField label="邮箱" htmlFor="profile-email" required>
              <TextInput
                id="profile-email"
                type="email"
                value={draft.email}
                invalid={Boolean(formError && !draft.email.trim())}
                onChange={(event) => setField('email', event.target.value)}
              />
            </FormField>
          </div>

          <div className="form-row">
            <FormField label="手机号" htmlFor="profile-phone">
              <TextInput
                id="profile-phone"
                value={draft.phone ?? ''}
                onChange={(event) => setField('phone', event.target.value)}
                placeholder="例如：13800000000"
              />
            </FormField>
            <FormField label="职位" htmlFor="profile-position">
              <TextInput
                id="profile-position"
                value={draft.position ?? ''}
                onChange={(event) => setField('position', event.target.value)}
                placeholder="例如：项目经理 / 前端工程师"
              />
            </FormField>
          </div>

          <FormField label="部门" htmlFor="profile-department">
            <TextInput
              id="profile-department"
              value={draft.department ?? ''}
              onChange={(event) => setField('department', event.target.value)}
              placeholder="例如：研发部 / 产品部 / 测试部"
            />
          </FormField>

          <FormField label="个人简介" htmlFor="profile-bio">
            <TextArea
              id="profile-bio"
              value={draft.bio ?? ''}
              onChange={(event) => setField('bio', event.target.value)}
              rows={3}
              placeholder="补充职责范围、协作偏好或当前负责的方向"
            />
          </FormField>

          <div className="profile-form-actions">
            <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
              取消
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={saving}>
              {saving ? '保存中...' : '保存资料'}
            </Button>
          </div>
        </form>
      </Panel>
    </Overlay>
  );
}

export default Layout;
