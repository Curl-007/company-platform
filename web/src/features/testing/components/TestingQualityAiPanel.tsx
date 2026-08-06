import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bug,
  ClipboardCheck,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { fetchDefects, fetchTestCases } from '../api';
import { sendAiChat } from '../../ai/api';
import { fetchProjects } from '../../projects/api';
import { useAsync } from '../../../hooks/useAsync';
import { ApiError } from '../../../services/api';
import type { Defect, Project, TestCase } from '../../../types';
import { buildTestingQualityAiPrompt, passRate } from './testingHelpers';

export default function TestingQualityAiPanel() {
  const { data, loading, error, reload } = useAsync<{
    testCases: TestCase[];
    defects: Defect[];
    projects: Project[];
  }>(
    () => Promise.all([fetchTestCases(), fetchDefects(), fetchProjects()]).then(([testCases, defects, projects]) => ({
      testCases,
      defects,
      projects,
    })),
    [],
    { cacheKey: 'testing-quality:snapshot' },
  );
  const [aiAdvice, setAiAdvice] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const stats = useMemo(() => {
    const testCases = data?.testCases ?? [];
    const defects = data?.defects ?? [];
    const totalRuns = testCases.reduce((sum, item) => sum + item.totalCases, 0);
    const passedRuns = testCases.reduce((sum, item) => sum + item.passedCases, 0);
    const failedRuns = testCases.reduce((sum, item) => sum + item.failedCases, 0);
    const blockedRuns = testCases.reduce((sum, item) => sum + item.blockedCases, 0);
    const overallPassRate = totalRuns > 0 ? Math.round((passedRuns / totalRuns) * 100) : 0;
    const openDefects = defects.filter((item) => !['closed', 'rejected'].includes(item.status)).length;
    const severeOpen = defects.filter(
      (item) => ['critical', 'high', 'blocker'].includes(item.severity) && !['closed', 'rejected'].includes(item.status),
    ).length;
    const riskyCases = testCases.filter(
      (item) => item.failedCases > 0 || item.blockedCases > 0 || passRate(item) < 80,
    ).length;
    return {
      caseCount: testCases.length,
      overallPassRate,
      failedRuns,
      blockedRuns,
      openDefects,
      severeOpen,
      riskyCases,
    };
  }, [data]);

  async function handleAnalyze() {
    setAiError(null);
    setAiLoading(true);
    try {
      const snapshot = data ?? { testCases: [], defects: [], projects: [] };
      const reply = await sendAiChat({
        messages: [
          {
            role: 'user',
            content: buildTestingQualityAiPrompt(snapshot.testCases, snapshot.defects, snapshot.projects),
          },
        ],
        scope: 'testing-quality-advice',
        currentPage: 'testing',
      });
      setAiAdvice(reply.content);
    } catch (err) {
      setAiError(err instanceof ApiError ? err.message : 'AI 质量分析生成失败，请检查模型配置或稍后重试。');
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <section className="qa-ai-panel testing-ai-panel">
      <div className="qa-ai-head">
        <div className="qa-ai-copy">
          <div className="section-title qa-ai-title">
            <Sparkles size={15} aria-hidden="true" />
            AI 质量驾驶舱
          </div>
          <div className="body-text">汇总用例执行与缺陷闭环，给出回归重点与风险建议。</div>
        </div>
        <div className="qa-ai-actions testing-ai-actions">
          <button className="btn btn-secondary btn-sm btn-with-icon" onClick={reload} disabled={loading}>
            <RefreshCw size={14} aria-hidden="true" />
            {loading ? '加载中' : '刷新快照'}
          </button>
          <button
            className="btn btn-primary btn-sm btn-with-icon"
            onClick={handleAnalyze}
            disabled={loading || aiLoading || Boolean(error)}
          >
            <Sparkles size={14} aria-hidden="true" />
            {aiLoading ? '分析中...' : aiAdvice ? '重新分析' : 'AI 质量建议'}
          </button>
        </div>
      </div>

      <div className="qa-ai-signals" aria-label="质量快照">
        <div className="qa-ai-signal">
          <span><ClipboardCheck size={13} aria-hidden="true" /> 用例</span>
          <strong>{stats.caseCount}</strong>
          <em>整体通过 {stats.overallPassRate}%</em>
        </div>
        <div className={`qa-ai-signal ${stats.riskyCases > 0 ? 'is-warn' : ''}`}>
          <span><AlertTriangle size={13} aria-hidden="true" /> 风险用例</span>
          <strong>{stats.riskyCases}</strong>
          <em>失败 {stats.failedRuns} · 阻塞 {stats.blockedRuns}</em>
        </div>
        <div className={`qa-ai-signal ${stats.openDefects > 0 ? 'is-warn' : ''}`}>
          <span><Bug size={13} aria-hidden="true" /> 未关闭缺陷</span>
          <strong>{stats.openDefects}</strong>
          <em>高严重 {stats.severeOpen}</em>
        </div>
      </div>

      {error ? <div className="form-error">质量数据加载失败，暂时无法生成 AI 建议。</div> : null}

      {(aiAdvice || aiLoading || aiError) ? (
        <div className="testing-ai-result qa-ai-result">
          {aiLoading ? <div className="body-text">AI 正在分析测试通过率、阻塞用例和缺陷闭环…</div> : null}
          {aiError ? <div className="form-error">{aiError}</div> : null}
          {aiAdvice ? <div className="testing-ai-content">{aiAdvice}</div> : null}
        </div>
      ) : null}
    </section>
  );
}
