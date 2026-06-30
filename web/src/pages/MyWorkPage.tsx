import { useEffect, useMemo, useState } from 'react';
import { createWorkLog, fetchPersonalDashboard, fetchProjects, fetchWeeklyWorkSummary, type CreateRequirementInput } from '../services/resources';
import { useAsync } from '../hooks/useAsync';
import PageHeader from '../components/common/PageHeader';
import Panel from '../components/common/Panel';
import PageState from '../components/common/PageState';
import Overlay from '../components/common/Overlay';
import StatusBadge from '../components/common/StatusBadge';
import ProgressBar from '../components/common/ProgressBar';
import { useToast } from '../components/common/Toast';
import {
  DEFECT_SEVERITY_LABELS,
  DEFECT_STATUS_LABELS,
  TASK_STATUS_LABELS,
  TASK_TYPE_LABELS,
  USER_ROLE_LABELS,
  labelOf,
} from '../constants/enums';
import { ApiError } from '../services/api';
import type { DashboardData, Project, SessionUser, WeeklyWorkSummary } from '../types';

type Tab = 'tasks' | 'bugs' | 'requirements' | 'logs';
type TaskFilter = 'all' | 'requirement' | 'test_case' | 'defect';

const STORAGE_KEYS = {
  tab: 'mywork-active-tab',
  filter: 'mywork-task-filter',
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function MyWorkPage({ user }: { user?: SessionUser | null }) {
  const toast = useToast();
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
  const { data, loading, error, reload } = useAsync<DashboardData>(fetchPersonalDashboard, []);
  const weeklySummaryAsync = useAsync<WeeklyWorkSummary>(() => fetchWeeklyWorkSummary(), []);

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
    <div>
      <PageHeader
        title="我的工作"
        description={`${user?.name ?? ''} 的任务队列、缺陷处理、需求跟进与日报周报入口`}
        actions={(
          <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
            <button className={`btn btn-sm ${taskFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTaskFilter('all')}>全部</button>
            <button className={`btn btn-sm ${taskFilter === 'requirement' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTaskFilter('requirement')}>需求任务</button>
            <button className={`btn btn-sm ${taskFilter === 'test_case' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTaskFilter('test_case')}>测试任务</button>
            <button className={`btn btn-sm ${taskFilter === 'defect' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTaskFilter('defect')}>缺陷修复</button>
          </div>
        )}
      />

      <div className="metric-bar" style={{ marginBottom: 16 }}>
        {metricCards.map((item) => (
          <div key={item.label} className="metric-card">
            <div className="metric-value">{item.value}</div>
            <div className="metric-label">{item.label}</div>
          </div>
        ))}
      </div>

      <div className="tab-bar" style={{ marginBottom: 16 }}>
        <button className={`tab-item ${tab === 'tasks' ? 'active' : ''}`} onClick={() => setTab('tasks')}>我的任务</button>
        <button className={`tab-item ${tab === 'bugs' ? 'active' : ''}`} onClick={() => setTab('bugs')}>我的缺陷</button>
        <button className={`tab-item ${tab === 'requirements' ? 'active' : ''}`} onClick={() => setTab('requirements')}>我的需求</button>
        <button className={`tab-item ${tab === 'logs' ? 'active' : ''}`} onClick={() => setTab('logs')}>日报周报</button>
      </div>

      {tab === 'tasks' ? (
        <div className="mywork-panels">
          <Panel title="任务队列" subtitle={`当前共 ${visibleTasks.length} 条任务`} className="mywork-panel-left">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {visibleTasks.map((task) => (
                <div
                  key={task.id}
                  className={`mywork-queue-item ${selectedTask?.id === task.id ? 'selected' : ''}`}
                  onClick={() => setSelectedTaskId(task.id)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span className="mywork-queue-item-title">{task.title}</span>
                    <StatusBadge status={task.status} label={labelOf(TASK_STATUS_LABELS, task.status)} showDot={false} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
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
                <div className="detail-field" style={{ marginTop: 8 }}>
                  <span className="detail-label">当前进度</span>
                  <ProgressBar percent={selectedTask.progress} />
                </div>
                {selectedTask.description ? (
                  <div className="detail-field" style={{ marginTop: 8 }}>
                    <span className="detail-label">任务说明</span>
                    <div className="detail-value">{selectedTask.description}</div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="empty-state-desc">请选择左侧任务查看详情。</div>
            )}
          </Panel>
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
    </div>
  );
}

function DailyLogForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const [projectId, setProjectId] = useState('');
  const [content, setContent] = useState('');
  const [blockers, setBlockers] = useState('');
  const [nextPlan, setNextPlan] = useState('');
  const [logDate, setLogDate] = useState(today());
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { data: projects } = useAsync<Project[]>(fetchProjects, []);
  const selectedProject = useMemo(
    () => (projects ?? []).find((item) => item.id === projectId) ?? null,
    [projectId, projects],
  );

  async function handleSubmit() {
    setFormError(null);
    if (!content.trim() && !file) {
      setFormError('请填写日报正文，或上传日报文件。');
      return;
    }

    setSubmitting(true);
    try {
      let contentBase64: string | undefined;
      if (file) {
        contentBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result ?? ''));
          reader.onerror = () => reject(new Error('读取文件失败'));
          reader.readAsDataURL(file);
        });
      }

      await createWorkLog({
        projectId: projectId || undefined,
        project: selectedProject?.name || '',
        content: content.trim(),
        blockers: blockers.trim(),
        nextPlan: nextPlan.trim(),
        logDate,
        fileName: file?.name,
        fileType: file?.type || file?.name.split('.').pop() || '',
        contentBase64,
      });
      await onSaved();
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : '提交失败');
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <Panel title="上传每日日报" subtitle="支持手填内容，也支持导入 .md / .txt / .doc / .docx 文件。">
        {formError ? <div className="form-error" style={{ marginBottom: 8 }}>{formError}</div> : null}
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">日期</label>
            <input className="form-input" type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">所属项目</label>
            <select className="form-select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">未绑定项目</option>
              {(projects ?? []).map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">日报正文</label>
          <textarea className="form-textarea" rows={6} value={content} onChange={(e) => setContent(e.target.value)} placeholder="建议写今日完成、提交、验证、联调情况。" />
        </div>
        <div className="form-group">
          <label className="form-label">阻塞项</label>
          <textarea className="form-textarea" rows={3} value={blockers} onChange={(e) => setBlockers(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">明日计划</label>
          <textarea className="form-textarea" rows={3} value={nextPlan} onChange={(e) => setNextPlan(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">日报文件</label>
          <input className="form-input" type="file" accept=".md,.txt,.doc,.docx,text/plain" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
        <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>取消</button>
          <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={submitting}>
            {submitting ? '提交中...' : '提交日报'}
          </button>
        </div>
      </Panel>
    </Overlay>
  );
}

export default MyWorkPage;
