import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Overlay from '../../../components/common/Overlay';
import Panel from '../../../components/common/Panel';
import { ApiError } from '../../../services/api';
import { updateWorkloadThresholds, type WorkloadThresholds } from '../api';

export default function WorkloadThresholdsOverlay({
  initial,
  onClose,
  onSaved,
}: {
  initial: WorkloadThresholds;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [values, setValues] = useState<WorkloadThresholds>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await updateWorkloadThresholds(values);
      onSaved();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : t('features.capacity.workloadThresholdsOverlay.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <Panel title={t('features.capacity.workloadThresholdsOverlay.title')} subtitle={t('features.capacity.workloadThresholdsOverlay.subtitle')}>
        <form className="form-stack" onSubmit={submit}>
          {error ? <div className="form-error">{error}</div> : null}
          <div className="form-grid form-grid-3">
            <label className="form-field">
              <span>{t('features.capacity.workloadThresholdsOverlay.balancedMin')}</span>
              <input
                className="form-input"
                type="number"
                min="0"
                step="0.01"
                value={values.balancedMin}
                onChange={(event) => setValues((current) => ({ ...current, balancedMin: Number(event.target.value) }))}
              />
            </label>
            <label className="form-field">
              <span>{t('features.capacity.workloadThresholdsOverlay.attentionMin')}</span>
              <input
                className="form-input"
                type="number"
                min="0"
                step="0.01"
                value={values.attentionMin}
                onChange={(event) => setValues((current) => ({ ...current, attentionMin: Number(event.target.value) }))}
              />
            </label>
            <label className="form-field">
              <span>{t('features.capacity.workloadThresholdsOverlay.overloadedAbove')}</span>
              <input
                className="form-input"
                type="number"
                min="0"
                step="0.01"
                value={values.overloadedAbove}
                onChange={(event) => setValues((current) => ({ ...current, overloadedAbove: Number(event.target.value) }))}
              />
            </label>
          </div>
          <small className="text-secondary">{t('features.capacity.workloadThresholdsOverlay.requirementHint')}</small>
          <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={saving}>{t('common.cancel')}</button>
            <button className="btn btn-primary btn-sm" disabled={saving}>{saving ? t('features.capacity.workloadThresholdsOverlay.saving') : t('features.capacity.workloadThresholdsOverlay.saveThresholds')}</button>
          </div>
        </form>
      </Panel>
    </Overlay>
  );
}
