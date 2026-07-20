import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { HashRouter, useLocation, useNavigate } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './components/Login';
import { getMe, getSessionUser, setSessionUser, logout as doLogout } from './services/auth';
import { ApiError, getToken } from './services/api';
import { canAccessPageForUser } from './constants/roles';
import { trackPageView } from './features/audit/api';
import { useToast } from './components/common/Toast';
import type { PageKey, SessionUser } from './types';
import { KNOWN_PAGES, PAGE_COMPONENTS } from './app/pageRegistry';

function getRoutePage(pathname: string): PageKey {
  const page = pathname.replace(/^\/+/, '').split('/')[0] ?? '';
  if (!page) return 'dashboard';
  if (KNOWN_PAGES.includes(page as PageKey)) return page as PageKey;
  return 'dashboard';
}

function isSessionInvalidError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.status === 401) return true;
  const body = error.body;
  const errorCode =
    typeof body === 'object' && body !== null && 'errorCode' in body
      ? String((body as { errorCode?: unknown }).errorCode || '')
      : '';
  if (errorCode === 'ACCOUNT_DISABLED') return true;
  if (error.status === 403 && /禁用|disabled/i.test(error.message || errorCode)) return true;
  return false;
}

function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const [user, setUser] = useState<SessionUser | null>(() => getSessionUser());
  const [currentPage, setCurrentPage] = useState<PageKey>(() => getRoutePage(location.pathname));

  const navigateToPage = useCallback((page: PageKey, params: Record<string, string> = {}, replace = false): void => {
  const query = new URLSearchParams(params).toString();
    navigate({ pathname: `/${page}`, search: query ? `?${query}` : '' }, { replace });
  }, [navigate]);

  useEffect(() => {
    const page = getRoutePage(location.pathname);
    if (page === 'login') {
      setUser(null);
      return;
    }

    const sessionUser = getSessionUser();
    if (sessionUser && !canAccessPageForUser(sessionUser, page)) {
      navigateToPage('dashboard', {}, true);
      setCurrentPage('dashboard');
      return;
    }

    setCurrentPage(page);
  }, [location.pathname, navigateToPage]);

  useEffect(() => {
    if (user && getRoutePage(location.pathname) === 'login') {
      navigateToPage('dashboard', {}, true);
      setCurrentPage('dashboard');
    }
  }, [location.pathname, navigateToPage, user]);

  useEffect(() => {
    if (!user || !getToken()) return;
    getMe()
      .then((freshUser) => {
        setUser(freshUser);
        if (!canAccessPageForUser(freshUser, getRoutePage(location.pathname))) {
          navigateToPage('dashboard', {}, true);
          setCurrentPage('dashboard');
        }
      })
      .catch((error: unknown) => {
        if (isSessionInvalidError(error)) {
          doLogout();
          setUser(null);
          return;
        }
        toast.info('无法刷新会话，已保留本地登录状态。请检查网络后重试。');
      });
    // Intentionally depends on route changes, not `user`, to avoid re-fetch loops after setUser.
  }, [location.pathname, navigateToPage, toast]);

  useEffect(() => {
    if (!user || !getToken() || currentPage === 'login') return;
    trackPageView(currentPage, currentPage).catch(() => undefined);
  }, [currentPage, user]);

  const handleLoginSuccess = useCallback((loggedInUser: SessionUser) => {
    setSessionUser(loggedInUser);
    setUser(loggedInUser);
    navigateToPage('dashboard', {}, true);
    setCurrentPage('dashboard');
  }, [navigateToPage]);

  const handleLogout = useCallback(() => {
    doLogout();
    setUser(null);
  }, []);

  const handleUserUpdate = useCallback((updatedUser: SessionUser) => {
    setSessionUser(updatedUser);
    setUser(updatedUser);
  }, []);

  const handleNavigate = useCallback((page: PageKey, focusId?: string) => {
    if (user && !canAccessPageForUser(user, page)) {
      navigateToPage('dashboard', {}, true);
      setCurrentPage('dashboard');
      return;
    }
    navigateToPage(page, focusId ? { focus: focusId } : {});
    setCurrentPage(page);
  }, [navigateToPage, user]);

  if (!user || !getToken()) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  const PageComponent = PAGE_COMPONENTS[currentPage] ?? PAGE_COMPONENTS.dashboard;

  return (
    <Layout
      currentPage={currentPage}
      onNavigate={handleNavigate}
      user={user}
      onUserUpdate={handleUserUpdate}
      onLogout={handleLogout}
    >
      <Suspense fallback={<div className="page-suspense-fallback">加载中...</div>}>
        <PageComponent user={user} />
      </Suspense>
    </Layout>
  );
}

function App() {
  return <HashRouter><AppContent /></HashRouter>;
}

export default App;
