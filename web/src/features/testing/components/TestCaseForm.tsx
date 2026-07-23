import { useState } from 'react';
import {
  createTestCase,
  updateTestCase,
  type CreateTestCaseInput,
  type UpdateTestCaseInput,
} from '../api';
import { fetchProjects } from '../../projects/api';
import { useAsync } from '../../../hooks/useAsync';
import { ApiError } from '../../../services/api';
import Overlay from '../../../components/common/Overlay';
import Panel from '../../../components/common/Panel';
import StatusBadge from '../../../components/common/StatusBadge';
import BusinessAdvicePanel from '../../../components/common/BusinessAdvicePanel';
import type { Project, TestCase } from '../../../types';
import {
  TEST_CASE_STATUS_LABELS,
  labelOf,
} from '../../../constants/enums';

export default function TestCaseForm({
  mode,
  item,
  onClose,
  onDone,
  canUseAi = false,
}: {
  mode: 'create' | 'edit';
  item?: TestCase | null;
  onClose: () => void;
  onDone: () => void;
  canUseAi?: boolean;
}) {
  const { data: projects } = useAsync<Project[]>(fetchProjects, [], { cacheKey: 'projects:list' });
  const [name, setName] = useState(item?.name ?? '');
  const [projectId, setProjectId] = useState(item?.projectId ?? '');
  const [owner, setOwner] = useState(item?.owner ?? '');
  const [assigneeRole, setAssigneeRole] = useState(item?.assigneeRole ?? 'qa');
  const [description, setDescription] = useState(item?.description ?? '');
  const [expectedResult, setExpectedResult] = useState(item?.expectedResult ?? '');
  const [stepsText, setStepsText] = useState((item?.steps ?? []).join('\n'));
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!name.trim()) return setFormError('请输入测试用例名称。');
    if (!projectId) return setFormError('请选择所属项目。');
    setFormError(null);
    setSubmitting(true);
    try {
      const payload: CreateTestCaseInput & UpdateTestCaseInput = {
        name: name.trim(),
        projectId,
        owner: owner.trim() || undefined,
        assigneeRole,
        description: description.trim() || undefined,
        expectedResult: expectedResult.trim() || undefined,
        steps: stepsText.split('\n').map((line) => line.trim()).filter(Boolean),
      };
      if (mode === 'create') await createTestCase(payload);
      else if (item) await updateTestCase(item.id, payload);
      onDone();
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : `${mode === 'create' ? '创建' : '更新'}测试用例失败`);
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <Panel title={mode === 'create' ? '新建测试用例' : '编辑测试用例'} subtitle={item?.id ?? '按项目创建并指派给测试或开发'}>
        {formError ? <div className="form-error" style={{ marginBottom: 8 }}>{formError}</div> : null}
        {canUseAi && item ? (
          <BusinessAdvicePanel
            targetType="test_case"
            targetId={item.id}
            title="AI 测试建议"
            description="基于后端测试用例、执行记录、关联需求、关联缺陷和同步任务生成。"
            buttonText="AI 分析用例"
            question="请分析该测试用例的覆盖充分性、失败/阻塞风险、缺陷关联和下一步验证动作。"
            draft={() => ({
              name: name.trim(),
              projectId,
              owner: owner.trim(),
              assigneeRole,
              steps: stepsText.split('\n').map((line) => line.trim()).filter(Boolean),
              expectedResult: expectedResult.trim(),
              description: description.trim(),
            })}
          />
        ) : null}
        <div className="form-group">
          <label className="form-label">用例名称</label>
          <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">所属项目</label>
            <select className="form-select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">请选择项目</option>
              {(projects ?? []).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">负责人</label>
            <input className="form-input" value={owner} onChange={(e) => setOwner(e.target.value)} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">执行角色</label>
            <select className="form-select" value={assigneeRole} onChange={(e) => setAssigneeRole(e.target.value)}>
              <option value="qa">测试</option>
              <option value="dev">开发联调</option>
            </select>
          </div>
          {mode === 'edit' && item ? (
            <div className="form-group">
              <label className="form-label">当前状态</label>
              <div style={{ paddingTop: 10 }}>
                <StatusBadge status={item.status} label={labelOf(TEST_CASE_STATUS_LABELS, item.status)} />
              </div>
            </div>
          ) : null}
        </div>
        <div className="form-group">
          <label className="form-label">步骤（每行一条）</label>
          <textarea className="form-textarea" rows={5} value={stepsText} onChange={(e) => setStepsText(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">预期结果</label>
          <textarea className="form-textarea" rows={3} value={expectedResult} onChange={(e) => setExpectedResult(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">说明</label>
          <textarea className="form-textarea" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>取消</button>
          <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={submitting}>{submitting ? '保存中...' : '保存'}</button>
        </div>
      </Panel>
    </Overlay>
  );
}
