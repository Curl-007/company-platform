import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchPersonalDashboard } from '../../dashboard/api';
import { fetchMyCapacity } from '../../capacity/api';
import { deleteTimeEntry, fetchTimeEntries } from '../../timeEntries/api';
import { fetchTaskStatusHistory } from '../../workflow/api';
import { fetchWeeklyWorkSummary } from '../../workLogs/api';
import TimeEntryForm from '../../timeEntries/components/TimeEntryForm';
import DailyLogForm from '../../workLogs/components/DailyLogForm';
import { useAsync } from '../../../hooks/useAsync';
import PageState from '../../../components/common/PageState';
import MetricStrip from '../../../components/common/MetricStrip';
import { useToast } from '../../../components/common/Toast';
import { useConfirm } from '../../../components/common/ConfirmDialog';
import { ApiError } from '../../../services/api';
import type { DashboardData, TimeEntry, WeeklyWorkSummary } from '../../../types';
import MyWorkCapacityPanel from './MyWorkCapacityPanel';
import MyWorkTaskWorkspace, { type TaskFilter, type TaskFilterCounts } from './MyWorkTaskWorkspace';
import MyWorkDefectsPanel from './MyWorkDefectsPanel';
import MyWorkRequirementsPanel from './MyWorkRequirementsPanel';
import MyWorkLogsTab from './MyWorkLogsTab';

type Tab = 'tasks' | 'bugs' | 'requirements' | 'logs';

const STORAGE_KEYS = {
  tab: 'mywork-active-tab',
  filter: 'mywork-task-filter',
};

export default function MyWorkView() {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>(() => {
    const saved = window.localStorage.getItem(STORAGE_KEYS.tab);
    return saved === 'bugs' || saved === 'requirements' || saved === 'logs' ? saved : 'tasks';
  });
  const [taskFilter, setTaskFilter] = useState<TaskFilter>(() => {
    const saved = window.localStorage.getItem(STORAGE_KEYS.filter);
    return saved === 'requirement' || saved === 'test_case' || saved === 'defect' || saved === 'general' ? saved : 'all';
  });
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showLogForm, setShowLogForm] = useState(false);
  const [showTimeEntryForm, setShowTimeEntryForm] = useState(false);
  const [editingTimeEntry, setEditingTimeEntry] = useState<TimeEntry | null>(null);
  const { data, loading, error, reload } = useAsync<DashboardData>(fetchPersonalDashboard, [], { cacheKey: 'mywork:dashboard' });
  const weeklySummaryAsync = useAsync<WeeklyWorkSummary>(() => fetchWeeklyWorkSummary(), [], { cacheKey: 'mywork:weekly-summary' });
  const personalCapacityAsync = useAsync(() => fetchMyCapacity(), [], { cacheKey: 'mywork:capacity' });
  const timeEntriesAsync = useAsync<TimeEntry[]>(() => fetchTimeEntries(), [], { cacheKey: 'time-entries:list' });

  async function removeTimeEntry(entry: TimeEntry) {
    const confirmed = await confirm({
      title: t('features.mywork.myWorkView.deleteTimeEntryTitle'),
      description: t('features.mywork.myWorkView.deleteTimeEntryDesc', { date: entry.workDate, hours: entry.hours }),
      confirmText: t('features.mywork.myWorkView.deleteRecord'),
      tone: 'warning',
    });
    if (!confirmed) return;
    try {
      await deleteTimeEntry(entry.id);
      await Promise.all([timeEntriesAsync.reload(), personalCapacityAsync.reload()]);
      toast.success(t('features.mywork.myWorkView.timeEntryDeleted'));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t('features.mywork.myWorkView.deleteTimeEntryFailed'));
    }
  }

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.tab, tab);
  }, [tab]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.filter, taskFilter);
  }, [taskFilter]);

  // sourceType 粒度：
  // - requirement / test_case / defect：业务对象同步出的关联任务
  // - general：PM 手工 WBS/指派任务（无 sourceType），原先只落在「全部」里导致 2+0+2 ≠ 6
  const taskGroups = useMemo(() => {
    const tasks = data?.focusTasks ?? [];
    const requirement = tasks.filter((item) => item.sourceType === 'requirement');
    const test_case = tasks.filter((item) => item.sourceType === 'test_case');
    const defect = tasks.filter((item) => item.sourceType === 'defect');
    const general = tasks.filter(
      (item) => item.sourceType !== 'requirement' && item.sourceType !== 'test_case' && item.sourceType !== 'defect',
    );
    return {
      all: tasks,
      requirement,
      test_case,
      defect,
      general,
    };
  }, [data?.focusTasks]);

  const filterCounts: TaskFilterCounts = useMemo(
    () => ({
      all: taskGroups.all.length,
      requirement: taskGroups.requirement.length,
      test_case: taskGroups.test_case.length,
      defect: taskGroups.defect.length,
      general: taskGroups.general.length,
    }),
    [taskGroups],
  );

  const visibleTasks = taskGroups[taskFilter];
  const selectedTask = visibleTasks.find((item) => item.id === selectedTaskId) ?? visibleTasks[0] ?? null;
  const taskHistoryAsync = useAsync(
    () => selectedTask ? fetchTaskStatusHistory(selectedTask.id) : Promise.resolve([]),
    [selectedTask?.id],
    { cacheKey: 'tasks:status-history' },
  );

  useEffect(() => {
    if (visibleTasks.length === 0) {
      setSelectedTaskId(null);
      return;
    }
    if (!selectedTaskId || !visibleTasks.some((item) => item.id === selectedTaskId)) {
      setSelectedTaskId(visibleTasks[0].id);
    }
  }, [visibleTasks, selectedTaskId]);

  if (loading || error || !data) {
    return <PageState loading={loading} error={error} isEmpty={!loading && !error && !data} onRetry={reload} />;
  }

  const metricCards = [
    { label: t('features.mywork.myWorkView.totalTasks'), value: data.metrics.tasks.total ?? 0 },
    { label: t('features.mywork.myWorkView.openDefects'), value: data.myDefects?.filter((item) => item.status !== 'closed').length ?? 0 },
    { label: t('features.mywork.myWorkView.requirementsFollowed'), value: data.requirementProgress.length },
  ];

  return (
    <div className="mywork-page">
      <MetricStrip variant="bar" className="mywork-metric-bar" items={metricCards} />

      <MyWorkCapacityPanel
        loading={personalCapacityAsync.loading}
        error={personalCapacityAsync.error}
        data={personalCapacityAsync.data}
      />

      <div className="tab-bar mywork-tab-bar">
        <button className={`tab-item ${tab === 'tasks' ? 'active' : ''}`} onClick={() => setTab('tasks')}>{t('features.mywork.myWorkView.tabTasks')}</button>
        <button className={`tab-item ${tab === 'bugs' ? 'active' : ''}`} onClick={() => setTab('bugs')}>{t('features.mywork.myWorkView.tabBugs')}</button>
        <button className={`tab-item ${tab === 'requirements' ? 'active' : ''}`} onClick={() => setTab('requirements')}>{t('features.mywork.myWorkView.tabRequirements')}</button>
        <button className={`tab-item ${tab === 'logs' ? 'active' : ''}`} onClick={() => setTab('logs')}>{t('features.mywork.myWorkView.tabLogs')}</button>
      </div>

      {tab === 'tasks' ? (
        <MyWorkTaskWorkspace
          taskFilter={taskFilter}
          onTaskFilterChange={setTaskFilter}
          filterCounts={filterCounts}
          visibleTasks={visibleTasks}
          selectedTask={selectedTask}
          onSelectTask={setSelectedTaskId}
          historyLoading={taskHistoryAsync.loading}
          historyError={taskHistoryAsync.error}
          history={taskHistoryAsync.data ?? undefined}
          onHandoffDone={() => { void reload(); void taskHistoryAsync.reload(); }}
        />
      ) : null}

      {tab === 'bugs' ? (
        <MyWorkDefectsPanel defects={data.myDefects ?? []} onChanged={() => { void reload(); }} />
      ) : null}

      {tab === 'requirements' ? (
        <MyWorkRequirementsPanel items={data.requirementProgress} />
      ) : null}

      {tab === 'logs' ? (
        <MyWorkLogsTab
          weeklyLoading={weeklySummaryAsync.loading}
          weeklyError={weeklySummaryAsync.error}
          weeklyData={weeklySummaryAsync.data}
          onRefreshWeekly={() => { void weeklySummaryAsync.reload(); }}
          onOpenLogForm={() => setShowLogForm(true)}
          timeEntriesLoading={timeEntriesAsync.loading}
          timeEntriesError={timeEntriesAsync.error}
          timeEntries={timeEntriesAsync.data ?? undefined}
          onOpenTimeEntryForm={() => setShowTimeEntryForm(true)}
          onEditTimeEntry={(entry) => {
            setEditingTimeEntry(entry);
            setShowTimeEntryForm(true);
          }}
          onRemoveTimeEntry={(entry) => { void removeTimeEntry(entry); }}
        />
      ) : null}

      {showLogForm ? (
        <DailyLogForm
          onClose={() => setShowLogForm(false)}
          onSaved={async () => {
            setShowLogForm(false);
            toast.success(t('features.mywork.myWorkView.dailyLogSubmitted'));
            await weeklySummaryAsync.reload();
          }}
        />
      ) : null}
      {showTimeEntryForm ? (
        <TimeEntryForm
          entry={editingTimeEntry ?? undefined}
          onClose={() => { setShowTimeEntryForm(false); setEditingTimeEntry(null); }}
          onSaved={async () => {
            const isEditing = Boolean(editingTimeEntry);
            setShowTimeEntryForm(false);
            setEditingTimeEntry(null);
            await Promise.all([timeEntriesAsync.reload(), personalCapacityAsync.reload()]);
            toast.success(isEditing ? t('features.mywork.myWorkView.timeEntryUpdated') : t('features.mywork.myWorkView.timeEntryRecorded'));
          }}
        />
      ) : null}
    </div>
  );
}
