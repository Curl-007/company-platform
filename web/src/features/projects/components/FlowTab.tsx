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

const FIXED_ID = 'fixed-project-delivery-v1';
const LIGHT_ID = 'lightweight-delivery-v1';

export default function FlowTab({ projectId }: { projectId: string }) {
  const sessionUser = getSessionUser();
  const canManage = canOperate(sessionUser, 'projects:update')
    || canOperate(sessionUser, 'admin:*')
    || sessionUser?.role === 'admin'
    || sessionUser?.role === 'pm';

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

  const templates = useMemo(
    () => (catalog?.templates || []).filter((item) => item.id === FIXED_ID || item.id === LIGHT_ID),
    [catalog],
  );
  const effectiveSelected = selectedTemplateId || binding?.templateId || data?.workflow?.templateId || FIXED_ID;

  async function handleBind() {
    if (!effectiveSelected) return;
    setSaving(true);
    setSaveError(null);
    setSaveOk(null);
    try {
      await bindProjectWorkflowTemplate(projectId, effectiveSelected);
      setSaveOk('已切换流程模板');
      await Promise.all([reload(), reloadBinding(), reloadCatalog()]);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '切换失败');
    } finally {
      setSaving(false);
    }
  }

  if (loading || error || !data) {
    return <PageState loading={loading} error={error} isEmpty={!loading && !error && !data} onRetry={reload} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Panel
        title="研发流程门禁"
        subtitle={`${data.projectName} · 当前：${data.workflow?.templateName || '固定交付'}`}
      >
        <FlowPipeline gates={data.gates} />
      </Panel>

      <Panel
        title="切换流程模板"
        subtitle={canManage ? '只支持两个选项：固定交付 / 轻量交付' : '当前账号可查看，修改需项目管理权限'}
      >
        {(bindingLoading || catalogLoading) && <p className="text-secondary">加载中...</p>}
        {(bindingError || catalogError) && <p className="form-error">{bindingError || catalogError}</p>}
        {!bindingLoading && !catalogLoading && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            {templates.map((template: WorkflowTemplate) => {
              const active = effectiveSelected === template.id;
              return (
                <button
                  key={template.id}
                  className={`btn ${active ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                  disabled={!canManage || saving}
                  onClick={() => {
                    setSelectedTemplateId(template.id);
                    setSaveOk(null);
                    setSaveError(null);
                  }}
                >
                  {template.name}
                  <span style={{ marginLeft: 6, opacity: 0.85 }}>{template.stages?.length || 0} 阶段</span>
                </button>
              );
            })}
            {canManage && (
              <button className="btn btn-primary btn-sm" disabled={saving || !effectiveSelected} onClick={handleBind}>
                {saving ? '保存中...' : '应用所选模板'}
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
        {templates.find((item) => item.id === effectiveSelected)?.description && (
          <p className="text-secondary" style={{ marginTop: 10 }}>
            {templates.find((item) => item.id === effectiveSelected)?.description}
          </p>
        )}
        {saveError && <p className="form-error" style={{ marginTop: 8 }}>{saveError}</p>}
        {saveOk && <p className="text-secondary" style={{ marginTop: 8, color: 'var(--color-success, #16a34a)' }}>{saveOk}</p>}
      </Panel>

      <div className="grid-2">
        <Panel title="缺陷闭环" subtitle="缺陷状态漏斗">
          <DefectFunnel data={data.defectFunnel} />
        </Panel>
        <Panel title="工时与规模" subtitle="预估 / 消耗 / 剩余">
          <div className="metric-grid" style={{ marginBottom: 12 }}>
            <div className="metric-card"><div className="metric-card-label">预估工时</div><div className="metric-card-value">{data.hours.estimated}<span className="metric-card-unit">h</span></div></div>
            <div className="metric-card"><div className="metric-card-label">已消耗</div><div className="metric-card-value">{data.hours.consumed}<span className="metric-card-unit">h</span></div></div>
            <div className="metric-card"><div className="metric-card-label">剩余工时</div><div className="metric-card-value">{data.hours.remaining}<span className="metric-card-unit">h</span></div></div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
