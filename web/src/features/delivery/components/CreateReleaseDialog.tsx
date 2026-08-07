import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
    if (!name.trim()) return setFormError(t('features.delivery.createReleaseDialog.nameRequired'));
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
      setFormError(err instanceof ApiError ? err.message : t('features.delivery.createReleaseDialog.createFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose} maxWidth={720}>
      <Panel title={t('features.delivery.createReleaseDialog.createTitle')} subtitle={t('features.delivery.createReleaseDialog.subtitle')}>
        <DeliveryFormError message={formError} />
        <form className="delivery-form" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <div className="form-row">
            <FormSelect label={t('features.delivery.createReleaseDialog.productLabel')} value={productId} onChange={setProductId} options={[{ value: '', label: t('features.delivery.deliveryPageModel.noLinkedProduct') }, ...products.map((item) => ({ value: item.id, label: item.name }))]} />
            <FormSelect label={t('features.delivery.createReleaseDialog.buildLabel')} value={buildId} onChange={setBuildId} options={[{ value: '', label: t('features.delivery.createReleaseDialog.noLinkedBuild') }, ...builds.map((item) => ({ value: item.id, label: `${item.version || item.id} · ${item.name}` }))]} />
          </div>
          <div className="form-row">
            <FormInput label={t('features.delivery.createReleaseDialog.nameLabel')} value={name} onChange={setName} placeholder={t('features.delivery.createReleaseDialog.namePlaceholder')} />
            <FormInput label={t('features.delivery.createReleaseDialog.versionLabel')} value={version} onChange={setVersion} placeholder="1.2.0" />
          </div>
          <div className="form-row">
            <FormInput label={t('features.delivery.createReleaseDialog.releaseDateLabel')} type="date" value={releaseDate} onChange={setReleaseDate} />
            <FormSelect label={t('features.delivery.createReleaseDialog.releaseTypeLabel')} value={releaseType} onChange={setReleaseType} options={[
              { value: 'official', label: labelOf(RELEASE_TYPE_LABELS, 'official') },
              { value: 'stable', label: labelOf(RELEASE_TYPE_LABELS, 'stable') },
              { value: 'hotfix', label: labelOf(RELEASE_TYPE_LABELS, 'hotfix') },
            ]} />
          </div>
          <QuickIdInput label={t('features.delivery.createReleaseDialog.linkedStoriesLabel')} value={linkedStories} onChange={setLinkedStories} items={requirements.map((item) => item.id)} />
          <QuickIdInput label={t('features.delivery.createReleaseDialog.linkedBugsLabel')} value={linkedBugs} onChange={setLinkedBugs} items={defects.map((item) => item.id)} />
          <FormTextarea label={t('features.delivery.createReleaseDialog.releaseNotesLabel')} value={releaseNotes} onChange={setReleaseNotes} placeholder={t('features.delivery.createReleaseDialog.releaseNotesPlaceholder')} />
          <FormActions submitting={submitting} submitText={t('features.delivery.createReleaseDialog.createRelease')} onClose={onClose} />
        </form>
      </Panel>
    </Overlay>
  );
}
