import { useMemo, useState } from 'react';
import { fetchProjectFlow } from '../api';
import {
  bindProjectWorkflowTemplate,
  fetchProjectWorkflowBinding,
  fetchWorkflowTemplates,
} from '../../workflow/api';
import { useAsync } from '../../../hooks/useAsync';
import { getSessionUser } from '../../../services/auth';
import { canOperate } from '../../../constants/roles';
import PageState from '../../../components/common/PageState';
import Panel from '../../../components/common/Panel';
import FlowPipeline from '../../../components/common/FlowPipeline';
import DefectFunnel from '../../../components/common/DefectFunnel';
import type { ProjectFlow, WorkflowTemplate } from '../../../types';

export default function FlowTab({ projectId }: { projectId: string }) {
  const sessionUser = getSessionUser();
  const canManage = canOperate(sessionUser, 'projects:update') || canOperate(sessionUser, 'admin:*') || sessionUser?.role === 'admin' || sessionUser?.role === 'pm';

  const { data, loading, error, reload } = useAsync<ProjectFlow>(() => fetchProjectFlow(projectId), [projectId]);
  const {
    data: binding,
    loading: bindingLoading,
    error: bindingError,
    reload: reloadBinding,
  } = useAsync(() => fetchProjectWorkflowBinding(projectId), [projectId]);
  const {
    data: catalog,
    loading: catalogLoading,
    error: catalogError,
    reload: reloadCatalog,
  } = useAsync(() => fetchWorkflowTemplates(false), []);

  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<string | null>(null);

  const templates = catalog?.templates ?? [];
  const publishedTemplates = useMemo(
    () => templates.filter((item) => item.builtin || item.status === 'published' || !item.status),
    [templates],
  );

  const effectiveSelected = selectedTemplateId || binding?.templateId || data?.workflow?.templateId || '';

  async function handleBind() {
    if (!effectiveSelected) return;
    setSaving(true);
    setSaveError(null);
    setSaveOk(null);
    try {
      await bindProjectWorkflowTemplate(projectId, effectiveSelected);
      setSaveOk('已绑定流程模板');
      await Promise.all([reload(), reloadBinding(), reloadCatalog()]);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '绑定失败');
    } finally {
      setSaving(false);
    }
  }

  if (loading || error || !data) {
    return <PageState loading={loading} error={error} isEmpty={!loading && !error && !data} onRetry={reload} />;
  }

  const workflowLabel = data.workflow?.templateName
    ? `${data.workflow.templateName} · ${data.workflow.templateVersion || ''}`.trim()
    : data.workflow?.templateId || '默认固定模板';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Panel
        title="研发流程门禁"
        subtitle={`${data.projectName} · 模板：${workflowLabel}${data.workflow?.mode ? ` · ${data.workflow.mode}` : ''}`}
      >
        <FlowPipeline gates={data.gates} />
      </Panel>

      <Panel
        title="项目流程模板绑定"
        subtitle={canManage ? '可将本项目绑定到已发布模板；未绑定则使用内置固定模板。' : '当前账号可查看绑定；修改需项目管理权限。'}
      >
        {(bindingLoading || catalogLoading) && <p className="text-secondary">加载模板中...</p>}
        {(bindingError || catalogError) && <p className="form-error">{bindingError || catalogError}</p>}
        {!bindingLoading && !catalogLoading && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <label className="text-secondary" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              模板
              <select
                className="form-input"
                style={{ minWidth: 260 }}
                value={effectiveSelected}
                disabled={!canManage || saving}
                onChange={(event) => {
                  setSelectedTemplateId(event.target.value);
                  setSaveOk(null);
                  setSaveError(null);
                }}
              >
                {publishedTemplates.map((template: WorkflowTemplate) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                    {template.builtin ? '（内置）' : ''}
                    {template.version ? ` · ${template.version}` : ''}
                    {template.status ? ` · ${template.status}` : ''}
                  </option>
                ))}
              </select>
            </label>
            {canManage && (
              <button className="btn btn-primary btn-sm" disabled={saving || !effectiveSelected} onClick={handleBind}>
                {saving ? '保存中...' : '保存绑定'}
              </button>
            )}
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                reload();
                reloadBinding();
                reloadCatalog();
              }}
            >
              刷新
            </button>
          </div>
        )}
        {binding?.source === 'binding' && (
          <p className="text-secondary" style={{ marginTop: 8, fontSize: 13 }}>
            当前绑定：{binding.template?.name || binding.templateId}
            {binding.boundAt ? ` · ${binding.boundAt}` : ''}
          </p>
        )}
        {saveError && <p className="form-error" style={{ marginTop: 8 }}>{saveError}</p>}
        {saveOk && <p className="text-secondary" style={{ marginTop: 8, color: 'var(--color-success, #16a34a)' }}>{saveOk}</p>}
      </Panel>

      <div className="grid-2">
        <Panel title="缺陷闭环" subtitle="缺陷状态漏斗与关闭转化情况">
          <DefectFunnel data={data.defectFunnel} />
        </Panel>
        <Panel title="工时与规模" subtitle="预估 / 消耗 / 剩余 三类工时数据">
          <div className="metric-grid" style={{ marginBottom: 12 }}>
            <div className="metric-card"><div className="metric-card-label">预估工时</div><div className="metric-card-value">{data.hours.estimated}<span className="metric-card-unit">h</span></div></div>
            <div className="metric-card"><div className="metric-card-label">已消耗</div><div className="metric-card-value">{data.hours.consumed}<span className="metric-card-unit">h</span></div></div>
            <div className="metric-card"><div className="metric-card-label">剩余工时</div><div className="metric-card-value">{data.hours.remaining}<span className="metric-card-unit">h</span></div></div>
          </div>
          <div className="text-secondary" style={{ fontSize: 13 }}>需求 {data.counts.requirements} · 任务 {data.counts.tasks} · 缺陷 {data.counts.defects} · 测试用例 {data.counts.testCases}</div>
        </Panel>
      </div>
    </div>
  );
}
