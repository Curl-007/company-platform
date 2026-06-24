import React, { useState, useEffect, useCallback } from 'react';
import Layout from './components/Layout';
import Login from './components/Login';
import DashboardPage from './pages/DashboardPage';
import ProjectsPage from './pages/ProjectsPage';
import ProductsPage from './pages/ProductsPage';
import RequirementsPage from './pages/RequirementsPage';
import TestingPage from './pages/TestingPage';
import DocumentsPage from './pages/DocumentsPage';
import OrganizationPage from './pages/OrganizationPage';
import AiPage from './pages/AiPage';
import ReportsPage from './pages/ReportsPage';
import FlowPage from './pages/FlowPage';
import SettingsPage from './pages/SettingsPage';
import { getSessionUser, setSessionUser, logout as doLogout } from './services/auth';
import { getToken } from './services/api';
import type { PageKey, SessionUser } from './types';

// ---------------------------------------------------------------------------
// Hash-based routing helpers
// ---------------------------------------------------------------------------

function getHashPage(): PageKey {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const known: PageKey[] = [
    'dashboard',
    'projects',
    'products',
    'requirements',
    'testing',
    'documents',
    'organization',
    'ai',
    'reports',
    'flow',
    'settings',
    'login',
  ];
  if (!hash || hash === '') return 'dashboard';
  if (known.includes(hash as PageKey)) return hash as PageKey;
  return 'dashboard';
}

function setHashPage(page: PageKey): void {
  window.location.hash = `#/${page}`;
}

// ---------------------------------------------------------------------------
// Page registry
// ---------------------------------------------------------------------------

const pageComponents: Record<PageKey, React.FC> = {
  dashboard: DashboardPage,
  projects: ProjectsPage,
  products: ProductsPage,
  requirements: RequirementsPage,
  testing: TestingPage,
  documents: DocumentsPage,
  organization: OrganizationPage,
  ai: AiPage,
  reports: ReportsPage,
  flow: FlowPage,
  settings: SettingsPage,
  login: () => null, // handled separately
};

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

function App() {
  const [user, setUser] = useState<SessionUser | null>(() => getSessionUser());
  const [currentPage, setCurrentPage] = useState<PageKey>(() => getHashPage());

  // Listen for hash changes (back/forward navigation)
  useEffect(() => {
    function handleHashChange() {
      const page = getHashPage();
      if (page === 'login') {
        setUser(null);
        return;
      }
      setCurrentPage(page);
    }

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // If user is set but hash is #/login, redirect to dashboard
  useEffect(() => {
    if (user && getHashPage() === 'login') {
      setHashPage('dashboard');
      setCurrentPage('dashboard');
    }
  }, [user]);

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

  const handleNavigate = useCallback((page: PageKey) => {
    setHashPage(page);
    setCurrentPage(page);
  }, []);

  // Not authenticated -- show login
  if (!user || !getToken()) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  // Authenticated -- render layout with current page
  const PageComponent = pageComponents[currentPage] ?? pageComponents.dashboard;

  return (
    <Layout
      currentPage={currentPage}
      onNavigate={handleNavigate}
      user={user}
      onLogout={handleLogout}
    >
      <PageComponent />
    </Layout>
  );
}

export default App;
