import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
    if (!projectId) return setFormError(t('features.delivery.createBuildDialog.projectRequired'));
    if (!name.trim()) return setFormError(t('features.delivery.createBuildDialog.nameRequired'));
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
      setFormError(err instanceof ApiError ? err.message : t('features.delivery.createBuildDialog.createFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose} maxWidth={720}>
      <Panel title={t('features.delivery.createBuildDialog.createTitle')} subtitle={t('features.delivery.createBuildDialog.subtitle')}>
        <DeliveryFormError message={formError} />
        <form className="delivery-form" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <div className="form-row">
            <FormSelect label={t('features.delivery.createBuildDialog.projectLabel')} value={projectId} onChange={setProjectId} options={projects.map((item) => ({ value: item.id, label: item.name }))} />
            <FormInput label={t('features.delivery.createBuildDialog.nameLabel')} value={name} onChange={setName} placeholder={t('features.delivery.createBuildDialog.namePlaceholder')} />
          </div>
          <div className="form-row">
            <FormInput label={t('features.delivery.createBuildDialog.versionLabel')} value={version} onChange={setVersion} placeholder="1.2.0" />
            <FormInput label={t('features.delivery.createBuildDialog.buildDateLabel')} type="date" value={buildDate} onChange={setBuildDate} />
          </div>
          <FormInput label={t('features.delivery.createBuildDialog.scmLabel')} value={scmHash} onChange={setScmHash} placeholder={t('features.delivery.createBuildDialog.scmPlaceholder')} />
          <QuickIdInput label={t('features.delivery.createBuildDialog.linkedStoriesLabel')} value={linkedStories} onChange={setLinkedStories} items={requirements.map((item) => item.id)} />
          <QuickIdInput label={t('features.delivery.createBuildDialog.linkedBugsLabel')} value={linkedBugs} onChange={setLinkedBugs} items={defects.map((item) => item.id)} />
          <FormTextarea label={t('features.delivery.createBuildDialog.notesLabel')} value={notes} onChange={setNotes} placeholder={t('features.delivery.createBuildDialog.notesPlaceholder')} />
          <FormActions submitting={submitting} submitText={t('features.delivery.createBuildDialog.createBuild')} onClose={onClose} />
        </form>
      </Panel>
    </Overlay>
  );
}
