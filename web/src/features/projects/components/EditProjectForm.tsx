import { useState } from 'react';
import { updateProject } from '../api';
import { fetchProducts, fetchPrograms } from '../../products/api';
import { useAsync } from '../../../hooks/useAsync';
import { ApiError } from '../../../services/api';
import Panel from '../../../components/common/Panel';
import Overlay from '../../../components/common/Overlay';
import type { Project, Milestone } from '../../../types';
import {
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  labelOf,
} from '../../../constants/enums';

export default function EditProjectForm({
  project,
  onClose,
  onSaved,
}: {
  project: Project;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(project.name);
  const [objective, setObjective] = useState(project.objective ?? '');
  const [code, setCode] = useState(project.code ?? '');
  const [description, setDescription] = useState(project.description ?? '');
  const [owner, setOwner] = useState(project.owner);
  const [status, setStatus] = useState(project.status);
  const [progress, setProgress] = useState(String(project.progress));
  const [processMode, setProcessMode] = useState(project.processMode);
  const [programId, setProgramId] = useState(project.programId ?? '');
  const [productId, setProductId] = useState(project.productId ?? '');
  const [milestones, setMilestones] = useState<Milestone[]>(project.milestones ?? []);
  const [startDate, setStartDate] = useState(project.startDate ?? '');
  const [endDate, setEndDate] = useState(project.endDate ?? '');
  const [sourcePath, setSourcePath] = useState(project.sourcePath ?? '');
  const [showSource, setShowSource] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: programs } = useAsync(fetchPrograms, [], { cacheKey: 'programs:list' });
  const { data: products } = useAsync(fetchProducts, [], { cacheKey: 'products:list' });

  async function handleSubmit() {
    setFormError(null);
    if (!name.trim()) return setFormError('项目名称不能为空。');

    setSubmitting(true);
    try {
      await updateProject(project.id, {
        version: project.version,
        name: name.trim(),
        objective: objective.trim() || undefined,
        code: code.trim() || undefined,
        description: description.trim() || undefined,
        owner: owner.trim(),
        status,
        progress: Number(progress),
        processMode,
        programId: programId || null,
        productId: productId || null,
        milestones,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        sourcePath: sourcePath.trim() || undefined,
      });
      onSaved();
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : '保存项目失败');
    } finally {
      setSubmitting(false);
    }
  }

  function addMilestoneItem() {
    setMilestones([...milestones, { name: '', status: 'planned', date: '' }]);
  }

  function updateMilestone(idx: number, field: keyof Milestone, value: string) {
    const next = milestones.map((milestone, index) =>
      index === idx ? { ...milestone, [field]: value } : milestone,
    );
    setMilestones(next);
  }

  function removeMilestone(idx: number) {
    setMilestones(milestones.filter((_, index) => index !== idx));
  }

  return (
    <Overlay onClose={onClose} maxWidth={860}>
      <Panel
        className="project-form-panel"
        title="编辑项目"
        subtitle={`${project.name} · ${project.id}`}
        footer={(
          <div className="project-form-actions">
            <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>取消</button>
            <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={submitting}>
              {submitting ? '保存中...' : '保存'}
            </button>
          </div>
        )}
      >
        {formError && <div className="form-error project-form-error">{formError}</div>}

        <div className="project-form-section">
          <div className="project-form-section-title">基本信息</div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">项目名称</label>
              <input className="form-input" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">项目代号</label>
              <input className="form-input" value={code} onChange={(event) => setCode(event.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">项目目标</label>
            <textarea
              className="form-textarea"
              rows={2}
              value={objective}
              onChange={(event) => setObjective(event.target.value)}
              placeholder="说明项目要达成的业务结果或客户价值"
            />
          </div>
          <div className="form-group">
            <label className="form-label">项目描述</label>
            <textarea
              className="form-textarea"
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">负责人</label>
            <input className="form-input" value={owner} onChange={(event) => setOwner(event.target.value)} />
          </div>
        </div>

        <div className="project-form-section">
          <div className="project-form-section-title">排期与进度</div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">开始日期</label>
              <input className="form-input" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">结束日期</label>
              <input className="form-input" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">进度</label>
              <div className="flex items-center gap-2">
                <input type="range" min={0} max={100} value={progress} onChange={(event) => setProgress(event.target.value)} style={{ flex: 1 }} />
                <input className="form-input" type="number" min={0} max={100} value={progress} onChange={(event) => setProgress(event.target.value)} style={{ width: 64 }} />
                <span>%</span>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">状态</label>
              <select className="form-select" value={status} onChange={(event) => setStatus(event.target.value)}>
                {PROJECT_STATUSES.map((item) => (
                  <option key={item} value={item}>
                    {labelOf(PROJECT_STATUS_LABELS, item)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">流程模式</label>
            <select className="form-select" value={processMode} onChange={(event) => setProcessMode(event.target.value)}>
              <option value="scrum">Scrum</option>
              <option value="kanban">看板</option>
              <option value="waterfall">瀑布</option>
            </select>
          </div>
        </div>

        <div className="project-form-section">
          <div className="project-form-section-title">关联信息</div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">所属项目集</label>
              <select className="form-select" value={programId} onChange={(event) => setProgramId(event.target.value)}>
                <option value="">无</option>
                {(programs ?? []).map((program) => (
                  <option key={program.id} value={program.id}>
                    {program.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">关联产品</label>
              <select className="form-select" value={productId} onChange={(event) => setProductId(event.target.value)}>
                <option value="">无</option>
                {(products ?? []).map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="project-form-section">
          <div className="project-form-section-title project-form-section-title-row">
            <span>里程碑</span>
            <button className="btn btn-text btn-sm" style={{ marginLeft: 8 }} onClick={addMilestoneItem} type="button">
              + 添加
            </button>
          </div>
          {milestones.length === 0 ? (
            <div className="text-secondary" style={{ fontSize: 13, padding: '4px 0' }}>暂未定义里程碑。</div>
          ) : (
            <div className="project-milestone-list">
              {milestones.map((milestone, idx) => (
                <div key={idx} className="project-milestone-row">
                  <div className="form-group" style={{ flex: 2 }}>
                    <input className="form-input" value={milestone.name} onChange={(event) => updateMilestone(idx, 'name', event.target.value)} placeholder="里程碑名称" />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <input className="form-input" type="date" value={milestone.date} onChange={(event) => updateMilestone(idx, 'date', event.target.value)} />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <select className="form-select" value={milestone.status} onChange={(event) => updateMilestone(idx, 'status', event.target.value)}>
                      <option value="planned">计划中</option>
                      <option value="in_progress">进行中</option>
                      <option value="completed">已完成</option>
                      <option value="delayed">已延期</option>
                    </select>
                  </div>
                  <button className="btn btn-text btn-sm" onClick={() => removeMilestone(idx)} type="button">x</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="project-form-section project-form-section-compact">
          <button className="project-source-toggle" onClick={() => setShowSource(!showSource)} type="button">
            {showSource ? '▼' : '▶'} 源码路径
          </button>
          {showSource && (
            <div className="form-group" style={{ marginTop: 8 }}>
              <label className="form-label">服务端源码路径</label>
              <input
                className="form-input"
                value={sourcePath}
                onChange={(event) => setSourcePath(event.target.value)}
                placeholder="例如：/home/projects/my-app"
              />
            </div>
          )}
        </div>

      </Panel>
    </Overlay>
  );
}
