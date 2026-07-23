import { useEffect, useMemo, useState } from 'react';
import { fetchPersonalDashboard } from '../../dashboard/api';
import { fetchMyCapacity } from '../../capacity/api';
import { deleteTimeEntry, fetchTimeEntries } from '../../timeEntries/api';
import { fetchTaskStatusHistory } from '../../workflow/api';
import { fetchWeeklyWorkSummary } from '../../workLogs/api';
import TimeEntryForm from '../../timeEntries/components/TimeEntryForm';
import DailyLogForm from '../../workLogs/components/DailyLogForm';
import { useAsync } from '../../../hooks/useAsync';
import PageHeader from '../../../components/common/PageHeader';
import PageState from '../../../components/common/PageState';
import MetricStrip from '../../../components/common/MetricStrip';
import { useToast } from '../../../components/common/Toast';
import { useConfirm } from '../../../components/common/ConfirmDialog';
import { ApiError } from '../../../services/api';
import type { DashboardData, SessionUser, TimeEntry, WeeklyWorkSummary } from '../../../types';
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

export default function MyWorkView({ user }: { user?: SessionUser | null }) {
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
  const { data, loading, error, reload } = useAsync<DashboardData>(fetchPersonalDashboard, []);
  const weeklySummaryAsync = useAsync<WeeklyWorkSummary>(() => fetchWeeklyWorkSummary(), []);
  const personalCapacityAsync = useAsync(() => fetchMyCapacity(), [], { cacheKey: 'mywork:capacity' });
  const timeEntriesAsync = useAsync<TimeEntry[]>(() => fetchTimeEntries(), []);

  async function removeTimeEntry(entry: TimeEntry) {
    const confirmed = await confirm({
      title: '删除实际工时记录？',
      description: `${entry.workDate} 的 ${entry.hours} 小时记录将被删除，并重新计算个人容量。`,
      confirmText: '删除记录',
      tone: 'warning',
    });
    if (!confirmed) return;
    try {
      await deleteTimeEntry(entry.id);
      await Promise.all([timeEntriesAsync.reload(), personalCapacityAsync.reload()]);
      toast.success('实际工时记录已删除，个人容量已更新');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : '删除工时记录失败');
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
    { cacheKey: 'mywork:task-history' },
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
    return (
      <div>
        <PageHeader title="我的工作" description={`${user?.name ?? ''} 的工作台与任务队列`} />
        <PageState loading={loading} error={error} isEmpty={!loading && !error && !data} onRetry={reload} />
      </div>
    );
  }

  const metricCards = [
    { label: '任务总数', value: data.metrics.tasks.total ?? 0 },
    { label: '待修复缺陷', value: data.myDefects?.filter((item) => item.status !== 'closed').length ?? 0 },
    { label: '需求跟进', value: data.requirementProgress.length },
  ];

  return (
    <div className="mywork-page">
      <PageHeader
        title="我的工作"
        description={`${user?.name ?? ''} 的任务、缺陷、需求与日报入口`}
      />

      <MetricStrip variant="bar" className="mywork-metric-bar" items={metricCards} />

      <MyWorkCapacityPanel
        loading={personalCapacityAsync.loading}
        error={personalCapacityAsync.error}
        data={personalCapacityAsync.data}
      />

      <div className="tab-bar mywork-tab-bar">
        <button className={`tab-item ${tab === 'tasks' ? 'active' : ''}`} onClick={() => setTab('tasks')}>我的任务</button>
        <button className={`tab-item ${tab === 'bugs' ? 'active' : ''}`} onClick={() => setTab('bugs')}>我的缺陷</button>
        <button className={`tab-item ${tab === 'requirements' ? 'active' : ''}`} onClick={() => setTab('requirements')}>我的需求</button>
        <button className={`tab-item ${tab === 'logs' ? 'active' : ''}`} onClick={() => setTab('logs')}>日报周报</button>
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
            toast.success('日报已提交');
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
            toast.success(isEditing ? '实际工时已更新' : '实际工时已记录');
          }}
        />
      ) : null}
    </div>
  );
}
