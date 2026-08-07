import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { sendAiChat } from '../../ai/api';
import { ApiError } from '../../../services/api';
import Panel from '../../../components/common/Panel';
import { Button } from '../../../components/ui';
import i18n from '../../../i18n';
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
    .map((task) => i18n.t('features.dashboard.dashboardAiAdvisor.prompt.taskItem', {
      id: task.id,
      title: task.title,
      status: labelOf(TASK_STATUS_LABELS, task.status),
      owner: task.owner || i18n.t('features.dashboard.dashboardView.unassigned'),
      dueDate: task.dueDate || i18n.t('features.dashboard.dashboardAiAdvisor.prompt.unsetDueDate'),
      progress: task.progress ?? 0,
    }));
  const riskyProjects = data.riskyProjects
    .slice(0, 8)
    .map((project) => i18n.t('features.dashboard.dashboardAiAdvisor.prompt.riskyProjectItem', {
      id: project.id,
      name: project.name,
      status: labelOf(PROJECT_STATUS_LABELS, project.status),
      health: project.healthScore,
      riskCount: project.riskCount,
      progress: project.progress,
    }));
  const requirements = data.requirementProgress
    .slice(0, 8)
    .map((item) => i18n.t('features.dashboard.dashboardAiAdvisor.prompt.requirementItem', {
      id: item.id,
      title: item.title,
      projectName: item.projectName,
      completion: item.completion,
    }));

  return [
    i18n.t('features.dashboard.dashboardAiAdvisor.prompt.role'),
    i18n.t('features.dashboard.dashboardAiAdvisor.prompt.scope'),
    i18n.t('features.dashboard.dashboardAiAdvisor.prompt.specificity'),
    '',
    i18n.t('features.dashboard.dashboardAiAdvisor.prompt.totalTasks', { count: data.metrics.tasks.total, distribution: taskCounts || i18n.t('features.dashboard.dashboardAiAdvisor.prompt.none') }),
    i18n.t('features.dashboard.dashboardAiAdvisor.prompt.avgHealth', { value: data.metrics.projectHealthAverage }),
    i18n.t('features.dashboard.dashboardAiAdvisor.prompt.avgRequirementCompletion', { value: data.metrics.requirementCompletionAverage }),
    i18n.t('features.dashboard.dashboardAiAdvisor.prompt.testPassRate', { value: data.metrics.testPassRate }),
    i18n.t('features.dashboard.dashboardAiAdvisor.prompt.openRisks', { count: data.metrics.openRisks }),
    i18n.t('features.dashboard.dashboardAiAdvisor.prompt.documentCount', { count: data.metrics.documentCount }),
    '',
    i18n.t('features.dashboard.dashboardAiAdvisor.prompt.priorityActionsHeading'),
    actionTasks.length ? actionTasks.join('\n') : i18n.t('features.dashboard.dashboardAiAdvisor.prompt.noPendingTasks'),
    '',
    i18n.t('features.dashboard.dashboardAiAdvisor.prompt.riskyProjectsHeading'),
    riskyProjects.length ? riskyProjects.join('\n') : i18n.t('features.dashboard.dashboardAiAdvisor.prompt.noRiskyProjects'),
    '',
    i18n.t('features.dashboard.dashboardAiAdvisor.prompt.requirementsHeading'),
    requirements.length ? requirements.join('\n') : i18n.t('features.dashboard.dashboardAiAdvisor.prompt.noRequirementProgress'),
  ].join('\n');
}

export default function DashboardAiAdvisor({ data }: { data: DashboardData }) {
  const { t } = useTranslation();
  const [aiAdvice, setAiAdvice] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const ai = data.ai;
  // The pre-generated AI summary (data.ai) is shown as the initial/fallback
  // content until the user generates a fresh analysis. This consolidates the
  // old AiSummaryPanel into this single AI panel.
  const hasSummary = Boolean(ai?.summary || ai?.risks?.length || ai?.recommendations?.length);
  const showGenerated = aiAdvice || aiLoading || aiError;

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
      setAiError(err instanceof ApiError ? err.message : t('features.dashboard.dashboardAiAdvisor.generateFailed'));
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <Panel
      title={t('features.dashboard.dashboardAiAdvisor.title')}
      subtitle={t('features.dashboard.dashboardAiAdvisor.subtitle')}
      toolbar={(
        <Button size="sm" variant="primary" onClick={handleAnalyze} disabled={aiLoading}>
          {aiLoading ? t('common.aiAnalyzing') : aiAdvice ? t('common.reanalyze') : t('features.dashboard.dashboardAiAdvisor.generateAdvice')}
        </Button>
      )}
    >
      {showGenerated ? (
        <div className="dashboard-ai-result">
          {aiLoading ? <div className="body-text">{t('features.dashboard.dashboardAiAdvisor.analyzing')}</div> : null}
          {aiError ? <div className="form-error">{aiError}</div> : null}
          {aiAdvice ? <div className="dashboard-ai-content">{aiAdvice}</div> : null}
        </div>
      ) : hasSummary ? (
        <div className="dashboard-ai-summary">
          <div className="dashboard-ai-summary-title">{ai?.title || t('features.dashboard.dashboardAiAdvisor.aiSummary')}</div>
          {ai?.summary ? <p className="body-text">{ai.summary}</p> : null}
          {ai?.risks?.length ? (
            <div className="dashboard-ai-summary-section">
              <div className="dashboard-ai-summary-heading">{t('features.dashboard.dashboardAiAdvisor.riskReminder')}</div>
              <ul className="dashboard-ai-summary-list">
                {ai.risks.map((risk, index) => <li key={index}>{risk}</li>)}
              </ul>
            </div>
          ) : null}
          {ai?.recommendations?.length ? (
            <div className="dashboard-ai-summary-section">
              <div className="dashboard-ai-summary-heading">{t('features.dashboard.dashboardAiAdvisor.suggestedActions')}</div>
              <ul className="dashboard-ai-summary-list">
                {ai.recommendations.map((rec, index) => <li key={index}>{rec}</li>)}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="body-text dashboard-ai-empty">{t('features.dashboard.dashboardAiAdvisor.emptyHint')}</p>
      )}
    </Panel>
  );
}
