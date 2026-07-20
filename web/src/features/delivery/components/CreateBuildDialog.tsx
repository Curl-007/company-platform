import { useState } from 'react';
import { createBuild } from '../api';
import { splitIds, today } from '../deliveryPageModel';
import {
  DeliveryFormError,
  FormActions,
  FormInput,
  FormSelect,
  FormTextarea,
  QuickIdInput,
} from './DeliveryFormControls';
import { ApiError } from '../../../services/api';
import Overlay from '../../../components/common/Overlay';
import Panel from '../../../components/common/Panel';
import type { Defect, Project, Requirement } from '../../../types';

export default function CreateBuildDialog({
  projects,
  requirements,
  defects,
  onClose,
  onCreated,
}: {
  projects: Project[];
  requirements: Requirement[];
  defects: Defect[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [name, setName] = useState('');
  const [version, setVersion] = useState('');
  const [buildDate, setBuildDate] = useState(today());
  const [scmHash, setScmHash] = useState('');
  const [linkedStories, setLinkedStories] = useState('');
  const [linkedBugs, setLinkedBugs] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function submit() {
    setFormError(null);
    if (!projectId) return setFormError('请选择所属项目。');
    if (!name.trim()) return setFormError('请输入构建名称。');
    setSubmitting(true);
    try {
      await createBuild({
        projectId,
        name: name.trim(),
        version: version.trim() || undefined,
        buildDate,
        scmHash: scmHash.trim() || undefined,
        linkedStories: splitIds(linkedStories),
        linkedBugs: splitIds(linkedBugs),
        notes: notes.trim() || undefined,
      });
      onCreated();
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : '创建失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose} maxWidth={720}>
      <Panel title="新建构建" subtitle="记录代码构建、版本号、提交标识和关联需求/缺陷。">
        <DeliveryFormError message={formError} />
        <form className="delivery-form" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <div className="form-row">
            <FormSelect label="所属项目" value={projectId} onChange={setProjectId} options={projects.map((item) => ({ value: item.id, label: item.name }))} />
            <FormInput label="构建名称" value={name} onChange={setName} placeholder="例如：研发平台一期开发构建 #24" />
          </div>
          <div className="form-row">
            <FormInput label="版本号" value={version} onChange={setVersion} placeholder="1.2.0" />
            <FormInput label="构建日期" type="date" value={buildDate} onChange={setBuildDate} />
          </div>
          <FormInput label="提交标识" value={scmHash} onChange={setScmHash} placeholder="例如：a1b2c3d" />
          <QuickIdInput label="关联需求" value={linkedStories} onChange={setLinkedStories} items={requirements.map((item) => item.id)} />
          <QuickIdInput label="关联缺陷" value={linkedBugs} onChange={setLinkedBugs} items={defects.map((item) => item.id)} />
          <FormTextarea label="构建说明" value={notes} onChange={setNotes} placeholder="补充本次构建范围、测试目标或风险说明" />
          <FormActions submitting={submitting} submitText="创建构建" onClose={onClose} />
        </form>
      </Panel>
    </Overlay>
  );
}
