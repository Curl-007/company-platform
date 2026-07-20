import { useState } from 'react';
import {
  fetchProducts,
  type StrategyInput,
} from '../api';
import { strategyStatusOptions, type StrategyKind, type StrategyRecord } from '../productModel';
import { fetchProjects } from '../../projects/api';
import { getSessionUser } from '../../../services/auth';
import { useAsync } from '../../../hooks/useAsync';
import { ApiError } from '../../../services/api';
import Overlay from '../../../components/common/Overlay';
import Panel from '../../../components/common/Panel';
import {
  PROJECT_STATUS_LABELS,
  ROADMAP_STATUS_LABELS,
  labelOf,
} from '../../../constants/enums';
import type { Portfolio, Product, Program, Project } from '../../../types';

export default function StrategyForm({
  kind,
  initial,
  onClose,
  onSubmit,
}: {
  kind: StrategyKind;
  initial?: StrategyRecord | null;
  onClose: () => void;
  onSubmit: (input: StrategyInput) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [owner, setOwner] = useState(initial?.owner ?? getSessionUser()?.name ?? '');
  const [objective, setObjective] = useState(initial?.objective ?? '');
  const [status, setStatus] = useState(initial?.status ?? (kind === 'program' ? 'planning' : 'planned'));
  const [linkedIds, setLinkedIds] = useState<string[]>(kind === 'program'
    ? ((initial as Program | undefined)?.projectIds ?? [])
    : ((initial as Portfolio | undefined)?.productIds ?? []));
  const [risksText, setRisksText] = useState((initial as Program | undefined)?.risks?.join('\n') ?? '');
  const [roadmapText, setRoadmapText] = useState(((initial as Portfolio | undefined)?.roadmap ?? [])
    .map((item) => [item.title ?? '', item.version ?? '', item.quarter ?? '', item.status ?? 'planned'].join(' | ')).join('\n'));
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const projectOptions = useAsync<Project[]>(fetchProjects, []);
  const productOptions = useAsync<Product[]>(fetchProducts, []);
  const links = kind === 'program' ? (projectOptions.data ?? []) : (productOptions.data ?? []);

  function toggleLink(id: string) {
    setLinkedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function submit() {
    if (!name.trim() || !owner.trim() || !objective.trim()) {
      setFormError('请完整填写名称、负责人和目标。');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const roadmap = roadmapText.split('\n').map((line) => line.split('|').map((item) => item.trim()))
        .filter((parts) => parts.some(Boolean))
        .map(([title, version, quarter, itemStatus]) => ({ title, version, quarter, status: itemStatus || 'planned' }));
      await onSubmit({
        name: name.trim(), owner: owner.trim(), objective: objective.trim(), status, risks: risksText.split('\n').map((item) => item.trim()).filter(Boolean),
        ...(kind === 'program' ? { projectIds: linkedIds } : { productIds: linkedIds, roadmap }),
      });
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : '保存失败，请稍后重试。');
      setSubmitting(false);
    }
  }

  const linkLabel = kind === 'program' ? '关联项目' : '关联产品';
  const title = `${initial ? '编辑' : '新建'}${kind === 'program' ? '项目集' : '产品组合'}`;
  return (
    <Overlay onClose={onClose}>
      <Panel title={title} subtitle="目标用于对齐交付方向；项目集和产品组合只汇总项目/产品层数据，不用于个人绩效评价。">
        {formError ? <div className="form-error" style={{ marginBottom: 8 }}>{formError}</div> : null}
        <div className="form-row">
          <div className="form-group"><label className="form-label">名称</label><input className="form-input" value={name} onChange={(event) => setName(event.target.value)} /></div>
          <div className="form-group"><label className="form-label">负责人</label><input className="form-input" value={owner} onChange={(event) => setOwner(event.target.value)} /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">状态</label><select className="form-select" value={status} onChange={(event) => setStatus(event.target.value)}>{strategyStatusOptions(kind).map((item) => <option key={item} value={item}>{kind === 'program' ? labelOf(PROJECT_STATUS_LABELS, item) : labelOf(ROADMAP_STATUS_LABELS, item)}</option>)}</select></div>
        </div>
        <div className="form-group"><label className="form-label">目标</label><textarea className="form-textarea" rows={3} value={objective} onChange={(event) => setObjective(event.target.value)} placeholder="描述要达成的业务或交付结果" /></div>
        <div className="form-group">
          <label className="form-label">{linkLabel}</label>
          <div className="management-chip-list" style={{ maxHeight: 180, overflow: 'auto' }}>
            {links.map((item) => <label key={item.id} className="tag" style={{ cursor: 'pointer' }}><input type="checkbox" checked={linkedIds.includes(item.id)} onChange={() => toggleLink(item.id)} style={{ marginRight: 5 }} />{item.name}</label>)}
            {!links.length ? <span className="text-secondary">暂无可关联对象。</span> : null}
          </div>
        </div>
        {kind === 'program' ? <div className="form-group"><label className="form-label">项目集风险提示（每行一项，可选）</label><textarea className="form-textarea" rows={3} value={risksText} onChange={(event) => setRisksText(event.target.value)} /></div> : null}
        {kind === 'portfolio' ? <div className="form-group"><label className="form-label">组合路线图（每行：标题 | 版本 | 季度 | 状态）</label><textarea className="form-textarea" rows={4} value={roadmapText} onChange={(event) => setRoadmapText(event.target.value)} placeholder="客户自助服务 | 2.0 | 2026 Q3 | development" /></div> : null}
        <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>取消</button>
          <button className="btn btn-primary btn-sm" onClick={submit} disabled={submitting}>{submitting ? '保存中…' : '保存'}</button>
        </div>
      </Panel>
    </Overlay>
  );
}
