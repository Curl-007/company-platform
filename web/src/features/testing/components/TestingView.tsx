import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bug, ClipboardCheck } from 'lucide-react';
import { getSessionUser } from '../../../services/auth';
import { canOperate } from '../../../constants/roles';
import { clearTestingFocusFromHash, type TestingTab } from './testingHelpers';
import TestingQualityAiPanel from './TestingQualityAiPanel';
import TestCasesTab from './TestCasesTab';
import DefectsTab from './DefectsTab';

export default function TestingView() {
  const { t } = useTranslation();
  const [routeState, setRouteState] = useState<{ tab: TestingTab; focusId: string | null }>({
    tab: 'cases',
    focusId: null,
  });
  const [tab, setTab] = useState<TestingTab>('cases');
  const sessionUser = getSessionUser();
  const canUseAi = canOperate(sessionUser, 'ai:analyze');

  useEffect(() => {
    const syncRouteState = () => {
      const hash = window.location.hash;
      const query = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
      const params = new URLSearchParams(query);
      const nextTab: TestingTab = params.get('tab') === 'defects' ? 'defects' : 'cases';
      const focusId = params.get('focus');
      setRouteState({ tab: nextTab, focusId });
      setTab(nextTab);
    };

    syncRouteState();
    window.addEventListener('hashchange', syncRouteState);
    return () => window.removeEventListener('hashchange', syncRouteState);
  }, []);

  useEffect(() => {
    setTab(routeState.tab);
  }, [routeState.tab]);

  function handleClearFocus() {
    setRouteState((prev) => ({ ...prev, focusId: null }));
    clearTestingFocusFromHash();
  }

  function switchTab(next: TestingTab) {
    setTab(next);
    const hash = window.location.hash;
    const [pathPart, queryPart] = hash.split('?');
    const params = new URLSearchParams(queryPart || '');
    if (next === 'defects') params.set('tab', 'defects');
    else params.delete('tab');
    // Keep focus only when it belongs to the destination tab route.
    if (routeState.tab !== next) params.delete('focus');
    const nextQuery = params.toString();
    const base = pathPart || '#/testing';
    window.location.hash = nextQuery ? `${base}?${nextQuery}` : base;
  }

  return (
    <div className="qa-workbench">
      {canUseAi ? <TestingQualityAiPanel /> : null}

      <div className="qa-tab-row" role="tablist" aria-label={t('features.testing.testingView.tablistAria')}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'cases'}
          className={`qa-tab-chip ${tab === 'cases' ? 'is-active' : ''}`}
          onClick={() => switchTab('cases')}
        >
          <ClipboardCheck size={14} aria-hidden="true" />
          {t('features.testing.testingView.casesTab')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'defects'}
          className={`qa-tab-chip ${tab === 'defects' ? 'is-active' : ''}`}
          onClick={() => switchTab('defects')}
        >
          <Bug size={14} aria-hidden="true" />
          {t('features.testing.testingView.defectsTab')}
        </button>
      </div>

      {tab === 'cases' ? (
        <TestCasesTab focusId={routeState.focusId} onClearFocus={handleClearFocus} />
      ) : (
        <DefectsTab focusId={routeState.focusId} onClearFocus={handleClearFocus} />
      )}
    </div>
  );
}
