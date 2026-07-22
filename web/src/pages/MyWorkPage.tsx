import { useEffect, useMemo, useState } from 'react';
import { fetchPersonalDashboard } from '../features/dashboard/api';
import { fetchMyCapacity } from '../features/capacity/api';
import { deleteTimeEntry, fetchTimeEntries } from '../features/timeEntries/api';
import { fetchTaskStatusHistory } from '../features/workflow/api';
import { fetchWeeklyWorkSummary } from '../features/workLogs/api';
import { useAsync } from '../hooks/useAsync';
import PageHeader from '../components/common/PageHeader';
import Panel from '../components/common/Panel';
import PageState from '../components/common/PageState';
import MetricStrip from '../components/common/MetricStrip';
import StatusBadge from '../components/common/StatusBadge';
import ProgressBar from '../components/common/ProgressBar';
import { useToast } from '../components/common/Toast';
import { useConfirm } from '../components/common/ConfirmDialog';
import {
  DEFECT_SEVERITY_LABELS,
  DEFECT_STATUS_LABELS,
  TASK_STATUS_LABELS,
  TASK_TYPE_LABELS,
  USER_ROLE_LABELS,
  labelOf,
} from '../constants/enums';
import { ApiError } from '../services/api';
import type { DashboardData, SessionUser, TimeEntry, WeeklyWorkSummary } from '../types';
import TimeEntryForm from '../features/timeEntries/components/TimeEntryForm';
import DailyLogForm from '../features/workLogs/components/DailyLogForm';

type Tab = 'tasks' | 'bugs' | 'requirements' | 'logs';
type TaskFilter = 'all' | 'requirement' | 'test_case' | 'defect';

const STORAGE_KEYS = {
  tab: 'mywork-active-tab',
  filter: 'mywork-task-filter',
};

function MyWorkPage({ user }: { user?: SessionUser | null }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>(() => {
    const saved = window.localStorage.getItem(STORAGE_KEYS.tab);
    return saved === 'bugs' || saved === 'requirements' || saved === 'logs' ? saved : 'tasks';
  });
  const [taskFilter, setTaskFilter] = useState<TaskFilter>(() => {
    const saved = window.localStorage.getItem(STORAGE_KEYS.filter);
    return saved === 'requirement' || saved === 'test_case' || saved === 'defect' ? saved : 'all';
  });
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showLogForm, setShowLogForm] = useState(false);
  const [showTimeEntryForm, setShowTimeEntryForm] = useState(false);
  const [editingTimeEntry, setEditingTimeEntry] = useState<TimeEntry | null>(null);
  const { data, loading, error, reload } = useAsync<DashboardData>(fetchPersonalDashboard, []);
  const weeklySummaryAsync = useAsync<WeeklyWorkSummary>(() => fetchWeeklyWorkSummary(), []);
  const personalCapacityAsync = useAsync(() => fetchMyCapacity(), []);
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

  const taskGroups = useMemo(() => {
    const tasks = data?.focusTasks ?? [];
    return {
      all: tasks,
      requirement: tasks.filter((item) => item.sourceType === 'requirement'),
      test_case: tasks.filter((item) => item.sourceType === 'test_case'),
      defect: tasks.filter((item) => item.sourceType === 'defect'),
    };
  }, [data?.focusTasks]);

  const visibleTasks = taskGroups[taskFilter];
  const selectedTask = visibleTasks.find((item) => item.id === selectedTaskId) ?? visibleTasks[0] ?? null;
  const taskHistoryAsync = useAsync(
    () => selectedTask ? fetchTaskStatusHistory(selectedTask.id) : Promise.resolve([]),
    [selectedTask?.id],
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

      <Panel title="我的本期容量" subtitle="用于协调任务安排，不作为个人绩效评分。" className="mywork-capacity-panel">
        {personalCapacityAsync.loading ? (
          <div className="body-text">正在加载本期容量…</div>
        ) : personalCapacityAsync.error ? (
          <div className="form-error">容量信息加载失败，请稍后刷新页面重试。</div>
        ) : personalCapacityAsync.data ? (
          <div className="detail-grid mywork-capacity-grid">
            <div className="detail-field">
              <span className="detail-label">有效可投入工时</span>
              <span className="detail-value">{personalCapacityAsync.data.effectiveHours} 小时</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">已计划工时</span>
              <span className="detail-value">{personalCapacityAsync.data.plannedHours} 小时</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">已记录实际工时</span>
              <span className="detail-value">{personalCapacityAsync.data.actualHours} 小时</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">临时工作</span>
              <span className="detail-value">{personalCapacityAsync.data.unplannedActualHours} 小时{personalCapacityAsync.data.unplannedRatio === null ? '（待分类）' : `（${Math.round(personalCapacityAsync.data.unplannedRatio * 100)}%）`}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">负荷比例</span>
              <span className="detail-value">
                {personalCapacityAsync.data.loadRatio === null ? '待配置' : `${Math.round(personalCapacityAsync.data.loadRatio * 100)}%`}
              </span>
            </div>
            <div className="detail-field">
              <span className="detail-label">安排提示</span>
              <span className="detail-value">{personalCapacityAsync.data.risk.label}</span>
            </div>
          </div>
        ) : (
          <div className="body-text">本期尚未配置容量计划，请与项目经理确认可投入时间和任务安排。</div>
        )}
      </Panel>

      <div className="tab-bar mywork-tab-bar">
        <button className={`tab-item ${tab === 'tasks' ? 'active' : ''}`} onClick={() => setTab('tasks')}>我的任务</button>
        <button className={`tab-item ${tab === 'bugs' ? 'active' : ''}`} onClick={() => setTab('bugs')}>我的缺陷</button>
        <button className={`tab-item ${tab === 'requirements' ? 'active' : ''}`} onClick={() => setTab('requirements')}>我的需求</button>
        <button className={`tab-item ${tab === 'logs' ? 'active' : ''}`} onClick={() => setTab('logs')}>日报周报</button>
      </div>

      {tab === 'tasks' ? (
        <div className="mywork-tasks">
          <div className="mywork-task-filters">
            <button className={`btn btn-sm ${taskFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTaskFilter('all')}>全部</button>
            <button className={`btn btn-sm ${taskFilter === 'requirement' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTaskFilter('requirement')}>需求任务</button>
            <button className={`btn btn-sm ${taskFilter === 'test_case' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTaskFilter('test_case')}>测试任务</button>
            <button className={`btn btn-sm ${taskFilter === 'defect' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTaskFilter('defect')}>缺陷修复</button>
          </div>

          <div className="mywork-panels">
          <Panel title="任务队列" subtitle={`当前共 ${visibleTasks.length} 条任务`} className="mywork-panel-left">
            <div className="mywork-queue">
              {visibleTasks.map((task) => (
                <div
                  key={task.id}
                  className={`mywork-queue-item ${selectedTask?.id === task.id ? 'selected' : ''}`}
                  onClick={() => setSelectedTaskId(task.id)}
                >
                  <div className="mywork-queue-item-main">
                    <span className="mywork-queue-item-title">{task.title}</span>
                    <StatusBadge status={task.status} label={labelOf(TASK_STATUS_LABELS, task.status)} showDot={false} />
                  </div>
                  <div className="mywork-queue-item-meta">
                    <span>{task.sourceType ? labelOf({ requirement: '需求', test_case: '测试', defect: '缺陷' }, task.sourceType) : labelOf(TASK_TYPE_LABELS, task.type)}</span>
                    <span>{task.assigneeRole ? labelOf(USER_ROLE_LABELS, task.assigneeRole) : '未设角色'}</span>
                  </div>
                </div>
              ))}
              {visibleTasks.length === 0 ? <div className="empty-state-desc">当前筛选下暂无任务。</div> : null}
            </div>
          </Panel>

          <Panel title="任务详情" className="mywork-panel-center">
            {selectedTask ? (
              <div className="mywork-detail">
                <div className="mywork-detail-header">
                  <div>
                    <h3>{selectedTask.title}</h3>
                    <div className="text-secondary" style={{ fontSize: 13, marginTop: 4 }}>
                      来源：{selectedTask.sourceType ? labelOf({ requirement: '需求', test_case: '测试', defect: '缺陷' }, selectedTask.sourceType) : labelOf(TASK_TYPE_LABELS, selectedTask.type)}
                    </div>
                  </div>
                  <StatusBadge status={selectedTask.status} label={labelOf(TASK_STATUS_LABELS, selectedTask.status)} />
                </div>
                <div className="mywork-detail-meta">
                  <div className="detail-field">
                    <span className="detail-label">负责人</span>
                    <span className="detail-value">{selectedTask.owner || '-'}</span>
                  </div>
                  <div className="detail-field">
                    <span className="detail-label">角色</span>
                    <span className="detail-value">{selectedTask.assigneeRole ? labelOf(USER_ROLE_LABELS, selectedTask.assigneeRole) : '未设置'}</span>
                  </div>
                  <div className="detail-field">
                    <span className="detail-label">关联编号</span>
                    <span className="detail-value text-mono">{selectedTask.sourceId || selectedTask.requirementId || '-'}</span>
                  </div>
                  <div className="detail-field">
                    <span className="detail-label">WBS</span>
                    <span className="detail-value text-mono">{selectedTask.wbsCode}</span>
                  </div>
                </div>
                <div className="detail-field mywork-detail-progress">
                  <span className="detail-label">当前进度</span>
                  <ProgressBar percent={selectedTask.progress} />
                </div>
                {selectedTask.description ? (
                  <div className="detail-field" style={{ marginTop: 8 }}>
                    <span className="detail-label">任务说明</span>
                    <div className="detail-value">{selectedTask.description}</div>
                  </div>
                ) : null}
                <div className="detail-field" style={{ marginTop: 16 }}>
                  <span className="detail-label">状态流转</span>
                  {taskHistoryAsync.loading ? (
                    <div className="body-text">正在加载状态历史…</div>
                  ) : taskHistoryAsync.error ? (
                    <div className="form-error">状态历史加载失败，请稍后重试。</div>
                  ) : taskHistoryAsync.data?.length ? (
                    <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
                      {taskHistoryAsync.data.slice(0, 6).map((entry) => (
                        <div key={entry.id} className="text-secondary" style={{ fontSize: 13 }}>
                          {entry.fromStatus ? `${labelOf(TASK_STATUS_LABELS, entry.fromStatus)} → ` : ''}
                          {labelOf(TASK_STATUS_LABELS, entry.toStatus)}
                          {entry.actorName ? ` · ${entry.actorName}` : ''}
                          {entry.reason ? ` · ${entry.reason}` : ''}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="body-text">暂无状态流转记录。</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="empty-state-desc">请选择左侧任务查看详情。</div>
            )}
          </Panel>
          </div>
        </div>
      ) : null}

      {tab === 'bugs' ? (
        <Panel title="我的缺陷" subtitle={`共 ${data.myDefects?.length ?? 0} 条`}>
          <div style={{ display: 'grid', gap: 12 }}>
            {(data.myDefects ?? []).map((item) => (
              <div key={item.id} className="panel" style={{ margin: 0 }}>
                <div className="panel-body">
                  <div className="flex items-center justify-between" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <div>
                      <div className="font-medium">{item.title}</div>
                      <div className="text-secondary" style={{ marginTop: 4 }}>{item.id} · {item.projectId}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={item.severity} label={labelOf(DEFECT_SEVERITY_LABELS, item.severity)} showDot={false} />
                      <StatusBadge status={item.status} label={labelOf(DEFECT_STATUS_LABELS, item.status)} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {(data.myDefects ?? []).length === 0 ? <div className="empty-state-desc">当前没有指派给你的缺陷。</div> : null}
          </div>
        </Panel>
      ) : null}

      {tab === 'requirements' ? (
        <Panel title="我的需求" subtitle={`共 ${data.requirementProgress.length} 条`}>
          <div style={{ display: 'grid', gap: 12 }}>
            {data.requirementProgress.map((item) => (
              <div key={item.id} className="panel" style={{ margin: 0 }}>
                <div className="panel-body">
                  <div className="flex items-center justify-between" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <div>
                      <div className="font-medium">{item.title}</div>
                      <div className="text-secondary" style={{ marginTop: 4 }}>{item.projectName}</div>
                    </div>
                    <div style={{ minWidth: 180 }}>
                      <ProgressBar percent={item.completion} height={6} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      {tab === 'logs' ? (
        <div className="grid-2">
          <Panel
            title="每日日报"
            subtitle="除管理员外，所有角色都需要上传日报；支持 .md .txt .doc .docx 自动识别。"
            toolbar={<button className="btn btn-primary btn-sm" onClick={() => setShowLogForm(true)}>上传今日日报</button>}
          >
            <div className="body-text">
              建议每天提交一篇日报，方便动态页留痕，并为 AI 周报生成提供完整素材。
            </div>
          </Panel>

          <Panel
            title="AI 周报"
            subtitle="基于本周日报自动汇总"
            toolbar={<button className="btn btn-secondary btn-sm" onClick={() => weeklySummaryAsync.reload()}>刷新周报</button>}
          >
            {weeklySummaryAsync.loading ? (
              <div className="body-text">周报生成中...</div>
            ) : weeklySummaryAsync.error ? (
              <div className="form-error">{String(weeklySummaryAsync.error)}</div>
            ) : weeklySummaryAsync.data ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="detail-grid">
                  <div className="detail-field">
                    <span className="detail-label">周起始</span>
                    <span>{weeklySummaryAsync.data.weekKey}</span>
                  </div>
                  <div className="detail-field">
                    <span className="detail-label">日报数量</span>
                    <span>{weeklySummaryAsync.data.count}</span>
                  </div>
                </div>
                <div className="section-title">AI 摘要</div>
                <div className="body-text" style={{ whiteSpace: 'pre-wrap' }}>{weeklySummaryAsync.data.summary.summary}</div>
                <div className="section-title">周报 Markdown</div>
                <pre className="body-text" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{weeklySummaryAsync.data.markdown}</pre>
              </div>
            ) : (
              <div className="body-text">本周还没有日报记录。</div>
            )}
          </Panel>
          <Panel
            title="实际工时"
            subtitle="用于核对计划与实际投入，不用于个人绩效评分。"
            toolbar={<button className="btn btn-secondary btn-sm" onClick={() => setShowTimeEntryForm(true)}>记录工时</button>}
          >
            {timeEntriesAsync.loading ? (
              <div className="body-text">正在加载工时记录…</div>
            ) : timeEntriesAsync.error ? (
              <div className="form-error">工时记录加载失败，请稍后重试。</div>
            ) : timeEntriesAsync.data?.length ? (
              <div style={{ display: 'grid', gap: 8 }}>
                {timeEntriesAsync.data.slice(0, 6).map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between" style={{ gap: 8 }}>
                    <span>{entry.workDate} · {entry.projectName} · {entry.category}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-secondary">{entry.hours}h · {entry.workNature === 'unplanned' ? '临时工作' : entry.workNature === 'planned' ? '计划内' : '待分类'}</span>
                      <button className="btn btn-text btn-sm" onClick={() => { setEditingTimeEntry(entry); setShowTimeEntryForm(true); }}>编辑</button>
                      <button className="btn btn-text btn-sm" onClick={() => void removeTimeEntry(entry)}>删除</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="body-text">本周期尚无实际工时记录。</div>
            )}
          </Panel>
        </div>
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

export default MyWorkPage;
