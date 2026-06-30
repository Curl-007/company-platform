import React, { useState, useEffect, useCallback, Suspense } from 'react';
import Layout from './components/Layout';
import Login from './components/Login';
import { getMe, getSessionUser, setSessionUser, logout as doLogout } from './services/auth';
import { getToken } from './services/api';
import { canAccessPageForUser } from './constants/roles';
import { trackPageView } from './services/resources';
import type { PageKey, SessionUser } from './types';
import { KNOWN_PAGES, PAGE_COMPONENTS } from './app/pageRegistry';

function getHashPage(): PageKey {
  const rawHash = window.location.hash.replace(/^#\/?/, '');
  const hash = rawHash.split('?')[0] ?? '';
  if (!hash) return 'dashboard';
  if (KNOWN_PAGES.includes(hash as PageKey)) return hash as PageKey;
  return 'dashboard';
}

function setHashPage(page: PageKey, params: Record<string, string> = {}): void {
  const query = new URLSearchParams(params).toString();
  window.location.hash = `#/${page}${query ? `?${query}` : ''}`;
}

function App() {
  const [user, setUser] = useState<SessionUser | null>(() => getSessionUser());
  const [currentPage, setCurrentPage] = useState<PageKey>(() => getHashPage());

  useEffect(() => {
    function handleHashChange() {
      const page = getHashPage();
      if (page === 'login') {
        setUser(null);
        return;
      }

      const sessionUser = getSessionUser();
      if (sessionUser && !canAccessPageForUser(sessionUser, page)) {
        setHashPage('dashboard');
        setCurrentPage('dashboard');
        return;
      }

      setCurrentPage(page);
    }

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    if (user && getHashPage() === 'login') {
      setHashPage('dashboard');
      setCurrentPage('dashboard');
    }
  }, [user]);

  useEffect(() => {
    if (!user || !getToken()) return;
    getMe()
      .then((freshUser) => {
        setUser(freshUser);
        if (!canAccessPageForUser(freshUser, getHashPage())) {
          setHashPage('dashboard');
          setCurrentPage('dashboard');
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!user || !getToken() || currentPage === 'login') return;
    trackPageView(currentPage, currentPage).catch(() => undefined);
  }, [currentPage, user]);

  const handleLoginSuccess = useCallback((loggedInUser: SessionUser) => {
    setSessionUser(loggedInUser);
    setUser(loggedInUser);
    setHashPage('dashboard');
    setCurrentPage('dashboard');
  }, []);

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
      setHashPage('dashboard');
      setCurrentPage('dashboard');
      return;
    }
    setHashPage(page, focusId ? { focus: focusId } : {});
    setCurrentPage(page);
  }, [user]);

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

export default App;
