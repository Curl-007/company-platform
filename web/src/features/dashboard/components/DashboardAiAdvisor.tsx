import { useState } from 'react';
import { sendAiChat } from '../../ai/api';
import { ApiError } from '../../../services/api';
import Panel from '../../../components/common/Panel';
import type { DashboardData } from '../../../types';
import {
  TASK_STATUS_LABELS,
  PROJECT_STATUS_LABELS,
  labelOf,
} from '../../../constants/enums';

function buildDashboardAiPrompt(data: DashboardData): string {
  const taskCounts = Object.entries(data.metrics.tasks)
    .map(([status, count]) => `${labelOf(TASK_STATUS_LABELS, status)} ${count}`)
    .join('、');
  const actionTasks = data.focusTasks
    .filter((task) => !['done', 'cancelled'].includes(task.status))
    .slice(0, 10)
    .map((task) => `${task.id} ${task.title} / ${labelOf(TASK_STATUS_LABELS, task.status)} / ${task.owner || '未分配'} / ${task.dueDate || '未设截止'} / ${task.progress ?? 0}%`);
  const riskyProjects = data.riskyProjects
    .slice(0, 8)
    .map((project) => `${project.id} ${project.name} / ${labelOf(PROJECT_STATUS_LABELS, project.status)} / 健康 ${project.healthScore} / 风险 ${project.riskCount} / 进度 ${project.progress}%`);
  const requirements = data.requirementProgress
    .slice(0, 8)
    .map((item) => `${item.id} ${item.title} / ${item.projectName} / 完成 ${item.completion}%`);

  return [
    '请作为公司项目管理平台的 AI 管理参谋，基于下面仪表盘快照给出管理层行动建议。',
    '请控制在 800 字以内，输出：1. 当前经营判断 2. 最大风险 3. 本周优先动作 4. 需要项目经理补齐的数据。',
    '建议必须具体到项目、任务、需求或指标，不要泛泛而谈。',
    '',
    `任务总数：${data.metrics.tasks.total}，任务状态分布：${taskCounts || '无'}`,
    `项目平均健康度：${data.metrics.projectHealthAverage}`,
    `需求平均完成率：${data.metrics.requirementCompletionAverage}%`,
    `测试通过率：${data.metrics.testPassRate}%`,
    `开放风险：${data.metrics.openRisks}`,
    `文档总数：${data.metrics.documentCount}`,
    '',
    '优先行动任务：',
    actionTasks.length ? actionTasks.join('\n') : '暂无待处理任务',
    '',
    '风险项目：',
    riskyProjects.length ? riskyProjects.join('\n') : '暂无风险项目',
    '',
    '需求推进：',
    requirements.length ? requirements.join('\n') : '暂无需求推进数据',
  ].join('\n');
}

export default function DashboardAiAdvisor({ data }: { data: DashboardData }) {
  const [aiAdvice, setAiAdvice] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  async function handleAnalyze() {
    setAiError(null);
    setAiLoading(true);
    try {
      const reply = await sendAiChat({
        messages: [
          {
            role: 'user',
            content: buildDashboardAiPrompt(data),
          },
        ],
        scope: 'dashboard-management-advice',
        currentPage: 'dashboard',
      });
      setAiAdvice(reply.content);
    } catch (err: unknown) {
      setAiError(err instanceof ApiError ? err.message : 'AI 管理建议生成失败，请检查模型配置或稍后重试。');
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <Panel
      title="AI 管理参谋"
      subtitle="基于当前 KPI、行动队列、风险项目和需求推进生成"
      toolbar={(
        <button className="btn btn-primary btn-sm" onClick={handleAnalyze} disabled={aiLoading}>
          {aiLoading ? 'AI 分析中...' : aiAdvice ? '重新分析' : '生成建议'}
        </button>
      )}
    >
      <div className="dashboard-ai-signal-grid">
        <span>健康 {data.metrics.projectHealthAverage}</span>
        <span>需求 {data.metrics.requirementCompletionAverage}%</span>
        <span>测试 {data.metrics.testPassRate}%</span>
        <span>风险 {data.metrics.openRisks}</span>
      </div>
      {(aiAdvice || aiLoading || aiError) ? (
        <div className="dashboard-ai-result">
          {aiLoading ? <div className="body-text">AI 正在分析经营指标、任务阻塞和项目风险，请稍候...</div> : null}
          {aiError ? <div className="form-error">{aiError}</div> : null}
          {aiAdvice ? <div className="dashboard-ai-content">{aiAdvice}</div> : null}
        </div>
      ) : (
        <p className="body-text dashboard-ai-empty">点击生成后，会给出本周优先动作、风险处置和需要补齐的数据。</p>
      )}
    </Panel>
  );
}
