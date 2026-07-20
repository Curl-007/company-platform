import { useState } from 'react';
import { createRelease } from '../api';
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
import { RELEASE_TYPE_LABELS, labelOf } from '../../../constants/enums';
import type { Build, Defect, Product, Requirement } from '../../../types';

export default function CreateReleaseDialog({
  products,
  builds,
  requirements,
  defects,
  onClose,
  onCreated,
}: {
  products: Product[];
  builds: Build[];
  requirements: Requirement[];
  defects: Defect[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [productId, setProductId] = useState(products[0]?.id ?? '');
  const [buildId, setBuildId] = useState(builds.find((item) => item.status === 'released')?.id ?? '');
  const [name, setName] = useState('');
  const [version, setVersion] = useState('');
  const [releaseDate, setReleaseDate] = useState(today());
  const [releaseType, setReleaseType] = useState('official');
  const [linkedStories, setLinkedStories] = useState('');
  const [linkedBugs, setLinkedBugs] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function submit() {
    setFormError(null);
    if (!name.trim()) return setFormError('请输入发布名称。');
    setSubmitting(true);
    try {
      await createRelease({
        productId: productId || undefined,
        buildId: buildId || undefined,
        name: name.trim(),
        version: version.trim() || undefined,
        releaseDate,
        releaseType,
        linkedStories: splitIds(linkedStories),
        linkedBugs: splitIds(linkedBugs),
        releaseNotes: releaseNotes.trim() || undefined,
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
      <Panel title="新建发布" subtitle="从候选构建生成对外发布单，沉淀版本说明和质量门禁。">
        <DeliveryFormError message={formError} />
        <form className="delivery-form" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <div className="form-row">
            <FormSelect label="所属产品" value={productId} onChange={setProductId} options={[{ value: '', label: '未关联产品' }, ...products.map((item) => ({ value: item.id, label: item.name }))]} />
            <FormSelect label="关联构建" value={buildId} onChange={setBuildId} options={[{ value: '', label: '未关联构建' }, ...builds.map((item) => ({ value: item.id, label: `${item.version || item.id} · ${item.name}` }))]} />
          </div>
          <div className="form-row">
            <FormInput label="发布名称" value={name} onChange={setName} placeholder="例如：项目管理平台 v1.2" />
            <FormInput label="版本号" value={version} onChange={setVersion} placeholder="1.2.0" />
          </div>
          <div className="form-row">
            <FormInput label="发布日期" type="date" value={releaseDate} onChange={setReleaseDate} />
            <FormSelect label="发布类型" value={releaseType} onChange={setReleaseType} options={[
              { value: 'official', label: labelOf(RELEASE_TYPE_LABELS, 'official') },
              { value: 'stable', label: labelOf(RELEASE_TYPE_LABELS, 'stable') },
              { value: 'hotfix', label: labelOf(RELEASE_TYPE_LABELS, 'hotfix') },
            ]} />
          </div>
          <QuickIdInput label="关联需求" value={linkedStories} onChange={setLinkedStories} items={requirements.map((item) => item.id)} />
          <QuickIdInput label="关联缺陷" value={linkedBugs} onChange={setLinkedBugs} items={defects.map((item) => item.id)} />
          <FormTextarea label="发布说明" value={releaseNotes} onChange={setReleaseNotes} placeholder="补充新增能力、修复内容、影响范围和回滚方案" />
          <FormActions submitting={submitting} submitText="创建发布" onClose={onClose} />
        </form>
      </Panel>
    </Overlay>
  );
}
