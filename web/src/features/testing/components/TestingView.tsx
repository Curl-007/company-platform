import { useEffect, useState } from 'react';
import { getSessionUser } from '../../../services/auth';
import PageHeader from '../../../components/common/PageHeader';
import { canOperate } from '../../../constants/roles';
import { clearTestingFocusFromHash, type TestingTab } from './testingHelpers';
import TestingQualityAiPanel from './TestingQualityAiPanel';
import TestCasesTab from './TestCasesTab';
import DefectsTab from './DefectsTab';

export default function TestingView() {
  const [routeState, setRouteState] = useState<{ tab: TestingTab; focusId: string | null }>({ tab: 'cases', focusId: null });
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

  return (
    <div>
      <PageHeader title="测试管理" description="集中管理测试用例、测试执行和缺陷闭环，支撑测试与开发之间的交接流转。" />
      {canUseAi ? <TestingQualityAiPanel /> : null}
      <div className="nav-tabs" style={{ marginBottom: 16 }}>
        <button className={`nav-tab ${tab === 'cases' ? 'active' : ''}`} onClick={() => setTab('cases')}>测试用例</button>
        <button className={`nav-tab ${tab === 'defects' ? 'active' : ''}`} onClick={() => setTab('defects')}>缺陷列表</button>
      </div>
      {tab === 'cases'
        ? <TestCasesTab focusId={tab === 'cases' ? routeState.focusId : null} onClearFocus={handleClearFocus} />
        : <DefectsTab focusId={tab === 'defects' ? routeState.focusId : null} onClearFocus={handleClearFocus} />}
    </div>
  );
}
