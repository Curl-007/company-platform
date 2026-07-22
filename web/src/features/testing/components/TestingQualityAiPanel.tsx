import { useState } from 'react';
import { fetchDefects, fetchTestCases } from '../api';
import { sendAiChat } from '../../ai/api';
import { fetchProjects } from '../../projects/api';
import { useAsync } from '../../../hooks/useAsync';
import { ApiError } from '../../../services/api';
import type { Defect, Project, TestCase } from '../../../types';
import { buildTestingQualityAiPrompt } from './testingHelpers';

export default function TestingQualityAiPanel() {
  const { data, loading, error, reload } = useAsync<{ testCases: TestCase[]; defects: Defect[]; projects: Project[] }>(
    () => Promise.all([fetchTestCases(), fetchDefects(), fetchProjects()]).then(([testCases, defects, projects]) => ({
      testCases,
      defects,
      projects,
    })),
    [],
  );
  const [aiAdvice, setAiAdvice] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

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

  const testCases = data?.testCases ?? [];
  const defects = data?.defects ?? [];
  const openDefects = defects.filter((item) => item.status !== 'closed').length;
  const blockedCases = testCases.reduce((sum, item) => sum + item.blockedCases, 0);

  return (
    <section className="testing-ai-panel">
      <div className="testing-ai-main">
        <div>
          <div className="section-title">AI 质量驾驶舱</div>
          <div className="body-text">汇总测试用例、执行结果和缺陷闭环，生成回归重点与风险建议。</div>
        </div>
        <div className="testing-ai-stats">
          <span>用例 {testCases.length}</span>
          <span>未关闭缺陷 {openDefects}</span>
          <span>阻塞执行 {blockedCases}</span>
        </div>
      </div>
      <div className="testing-ai-actions">
        {loading || error ? (
          <button className="btn btn-secondary btn-sm" onClick={reload} disabled={loading}>
            {loading ? '加载质量数据...' : '重新加载质量数据'}
          </button>
        ) : null}
        <button className="btn btn-primary btn-sm" onClick={handleAnalyze} disabled={loading || aiLoading || Boolean(error)}>
          {aiLoading ? 'AI 分析中...' : aiAdvice ? '重新分析质量' : 'AI 质量建议'}
        </button>
      </div>
      {error ? <div className="form-error">质量数据加载失败，暂时无法生成 AI 建议。</div> : null}
      {(aiAdvice || aiLoading || aiError) ? (
        <div className="testing-ai-result">
          {aiLoading ? <div className="body-text">AI 正在分析测试通过率、阻塞用例和缺陷闭环，请稍候...</div> : null}
          {aiError ? <div className="form-error">{aiError}</div> : null}
          {aiAdvice ? <div className="testing-ai-content">{aiAdvice}</div> : null}
        </div>
      ) : null}
    </section>
  );
}
