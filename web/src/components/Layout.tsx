import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PageKey, SessionUser } from '../types';
import { NAV_ITEMS } from '../app/pageRegistry';
import { ApiError } from '../services/api';
import { updateMyProfile, changeMyPassword, type UpdateProfileInput } from '../services/auth';
import AgentSidebar from '../features/ai/components/agent/AgentSidebar';
import { usePendingInteractions } from '../features/ai/hooks/usePendingInteractions';
import { canOperate } from '../constants/roles';
import Overlay from './common/Overlay';
import Panel from './common/Panel';
import { Button, FormField, TextArea, TextInput } from './ui';
import { SidebarInset, SidebarProvider } from './ui/Sidebar';
import AppSidebar from './AppSidebar';
import AppHeader from './AppHeader';
import { useToast } from './common/Toast';
import { subscribeToUiCommands } from '../features/ai/uiCommandBus';

interface LayoutProps {
  currentPage: PageKey;
  onNavigate: (page: PageKey, focusId?: string) => void;
  user: SessionUser;
  onUserUpdate?: (user: SessionUser) => void;
  onLogout: () => void;
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ currentPage, onNavigate, user, onUserUpdate, onLogout, children }) => {
  const { t } = useTranslation();
  const [aiSidebarOpen, setAiSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const currentNavLabel = NAV_ITEMS.find((item) => item.key === currentPage)?.label ?? t('nav.item.dashboard');
  // All AI endpoints require ai:* capabilities — the sidebar and its entry
  // stay hidden for roles that would only see 403s.
  const canUseAi = canOperate(user, 'ai:analyze');
  const { pendingCount } = usePendingInteractions();

  const handleNavigate = useCallback((page: PageKey, focusId?: string) => {
    onNavigate(page, focusId);
  }, [onNavigate]);

  // AI ui_control openAiSidebar directives arrive through the window event bus
  // (dispatched by the socket executor mounted in App); Layout owns the state.
  useEffect(() => subscribeToUiCommands(({ detail }) => {
    if (detail.directive.kind === 'openAiSidebar' && canUseAi) {
      setAiSidebarOpen(Boolean(detail.directive.open));
    }
  }), [canUseAi]);

  return (
    <div className={['kaneo-app-shell', aiSidebarOpen ? 'ai-sidebar-open' : ''].filter(Boolean).join(' ')}>
      <a className="skip-link" href="#main-content">{t('common.skipToContent')}</a>
      <SidebarProvider>
        <AppSidebar currentPage={currentPage} user={user} onNavigate={handleNavigate} />
        <SidebarInset>
          <AppHeader
            currentPage={currentPage}
            user={user}
            aiSidebarOpen={aiSidebarOpen}
            aiPendingCount={pendingCount}
            canUseAi={canUseAi}
            onAiToggle={() => setAiSidebarOpen((value) => !value)}
            onProfileOpen={() => setProfileOpen(true)}
            onLogout={onLogout}
          />
          <div id="main-content" className="kaneo-main-content" tabIndex={-1}>
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>

      {aiSidebarOpen && canUseAi ? (
        <AgentSidebar currentPage={currentPage} contextLabel={currentNavLabel} onClose={() => setAiSidebarOpen(false)} />
      ) : null}

      {profileOpen ? (
        <ProfileDialog
          user={user}
          onClose={() => setProfileOpen(false)}
          onSaved={(updatedUser) => {
            onUserUpdate?.(updatedUser);
            setProfileOpen(false);
          }}
        />
      ) : null}
    </div>
  );
};

function ProfileDialog({ user, onClose, onSaved }: { user: SessionUser; onClose: () => void; onSaved: (user: SessionUser) => void }) {
  const { t } = useTranslation();
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
    setDraft({ name: user.name, email: user.email, phone: user.phone ?? '', position: user.position ?? '', department: user.department ?? '', bio: user.bio ?? '' });
  }, [user]);

  function setField<K extends keyof UpdateProfileInput>(key: K, value: UpdateProfileInput[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setFormError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.name.trim()) { setFormError(t('common.nameRequired')); return; }
    if (!draft.email.trim()) { setFormError(t('common.emailRequired')); return; }
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
      toast.success(t('common.profileSaved'));
      onSaved(updated);
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : t('common.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Overlay onClose={onClose} maxWidth={680} ariaLabel={t('common.profile')}>
      <Panel title={t('common.profile')} subtitle={t('common.profileSubtitle')}>
        <form className="profile-form" onSubmit={handleSubmit}>
          <div className="profile-dialog-head">
            <div className="profile-dialog-avatar">{draft.name.split(/\s+/).map((word) => word[0]).join('').toUpperCase().slice(0, 2) || 'U'}</div>
            <div>
              <div className="profile-dialog-name">{draft.name || user.name}</div>
              <div className="profile-dialog-meta">{draft.position || user.role} · {draft.department || t('common.noDepartment')}</div>
            </div>
          </div>
          {formError ? <div className="form-error">{formError}</div> : null}
          <div className="form-row">
            <FormField label={t('common.profileName')} htmlFor="profile-name" required><TextInput id="profile-name" value={draft.name} invalid={Boolean(formError && !draft.name.trim())} onChange={(event) => setField('name', event.target.value)} /></FormField>
            <FormField label={t('common.profileEmail')} htmlFor="profile-email" required><TextInput id="profile-email" type="email" value={draft.email} invalid={Boolean(formError && !draft.email.trim())} onChange={(event) => setField('email', event.target.value)} /></FormField>
          </div>
          <div className="form-row">
            <FormField label={t('common.profilePhone')} htmlFor="profile-phone"><TextInput id="profile-phone" value={draft.phone ?? ''} onChange={(event) => setField('phone', event.target.value)} placeholder={t('common.phonePlaceholder')} /></FormField>
            <FormField label={t('common.profilePosition')} htmlFor="profile-position"><TextInput id="profile-position" value={draft.position ?? ''} onChange={(event) => setField('position', event.target.value)} placeholder={t('common.positionPlaceholder')} /></FormField>
          </div>
          <FormField label={t('common.profileDepartment')} htmlFor="profile-department"><TextInput id="profile-department" value={draft.department ?? ''} onChange={(event) => setField('department', event.target.value)} placeholder={t('common.departmentPlaceholder')} /></FormField>
          <FormField label={t('common.profileBio')} htmlFor="profile-bio"><TextArea id="profile-bio" value={draft.bio ?? ''} onChange={(event) => setField('bio', event.target.value)} rows={3} placeholder={t('common.bioPlaceholder')} /></FormField>
          <div className="profile-form-actions">
            <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
            <Button type="submit" variant="primary" size="sm" disabled={saving}>{saving ? t('common.saving') : t('common.saveProfile')}</Button>
          </div>
        </form>
        <ProfileSecuritySection onPasswordChanged={onSaved} />
      </Panel>
    </Overlay>
  );
}

function ProfileSecuritySection({ onPasswordChanged }: { onPasswordChanged: (user: SessionUser) => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
  }

  async function handleChangePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword.length < 8) { setError(t('common.passwordTooShort')); return; }
    if (newPassword !== confirmPassword) { setError(t('common.passwordMismatch')); return; }
    if (newPassword === currentPassword) { setError(t('common.passwordSameAsCurrent')); return; }
    setSaving(true);
    setError(null);
    try {
      const updated = await changeMyPassword({ currentPassword, newPassword });
      toast.success(t('common.passwordChanged'));
      reset();
      setOpen(false);
      onPasswordChanged(updated);
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : t('common.passwordChangeFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="profile-security" aria-label={t('common.changePassword')}>
      <button
        type="button"
        className="profile-security-toggle"
        aria-expanded={open}
        onClick={() => { setOpen((value) => !value); if (open) reset(); }}
      >
        <span>{t('common.changePassword')}</span>
        <span className="profile-security-hint">{open ? t('common.collapse') : t('common.expand')}</span>
      </button>
      {open ? (
        <form className="profile-security-form" onSubmit={handleChangePassword}>
          <p className="profile-security-note">{t('common.changePasswordNote')}</p>
          {error ? <div className="form-error">{error}</div> : null}
          <FormField label={t('common.currentPassword')} htmlFor="profile-current-password" required>
            <TextInput id="profile-current-password" type="password" value={currentPassword} autoComplete="current-password" onChange={(event) => { setCurrentPassword(event.target.value); setError(null); }} />
          </FormField>
          <div className="form-row">
            <FormField label={t('common.newPassword')} htmlFor="profile-new-password" required>
              <TextInput id="profile-new-password" type="password" value={newPassword} autoComplete="new-password" onChange={(event) => { setNewPassword(event.target.value); setError(null); }} />
            </FormField>
            <FormField label={t('common.confirmNewPassword')} htmlFor="profile-confirm-password" required>
              <TextInput id="profile-confirm-password" type="password" value={confirmPassword} autoComplete="new-password" invalid={Boolean(confirmPassword && confirmPassword !== newPassword)} onChange={(event) => { setConfirmPassword(event.target.value); setError(null); }} />
            </FormField>
          </div>
          <div className="profile-form-actions">
            <Button type="submit" variant="primary" size="sm" disabled={saving || !currentPassword || !newPassword || !confirmPassword}>
              {saving ? t('common.saving') : t('common.changePasswordSubmit')}
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

export default Layout;
