import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, X } from 'lucide-react';
import { createTestRun } from '../api';
import { ApiError } from '../../../services/api';
import Overlay from '../../../components/common/Overlay';
import Panel from '../../../components/common/Panel';
import StatusBadge from '../../../components/common/StatusBadge';
import type { TestCase, TestRunInput } from '../../../types';
import {
  TEST_CASE_STATUS_LABELS,
  TEST_RUN_RESULTS,
  TEST_RUN_RESULT_LABELS,
  labelOf,
} from '../../../constants/enums';
import { passRate } from './testingHelpers';

export default function TestExecutionForm({
  item,
  onClose,
  onDone,
}: {
  item: TestCase;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [result, setResult] = useState<'passed' | 'failed' | 'blocked'>('passed');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const rate = passRate(item);

  async function handleSubmit() {
    setFormError(null);
    setSubmitting(true);
    try {
      await createTestRun({ testCaseId: item.id, result, notes: notes.trim() || undefined } as TestRunInput);
      onDone();
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : t('features.testing.testExecutionForm.saveFailed'));
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose} maxWidth={560} ariaLabel={t('features.testing.testExecutionForm.ariaLabel', { name: item.name })}>
      <Panel
        className="qa-form-panel"
        title={t('features.testing.testExecutionForm.title')}
        subtitle={item.name}
        toolbar={(
          <button className="btn btn-text btn-sm btn-with-icon" onClick={onClose} aria-label={t('common.close')}>
            <X size={15} aria-hidden="true" />
          </button>
        )}
      >
        <div className="qa-form-body">
          {formError ? <div className="form-error qa-form-error">{formError}</div> : null}

          <div className="qa-form-summary">
            <StatusBadge status={item.status} label={labelOf(TEST_CASE_STATUS_LABELS, item.status)} />
            <span className="qa-form-summary-meta">
              {t('features.testing.testExecutionForm.summaryMeta', { rate, total: item.totalCases, passed: item.passedCases, failed: item.failedCases, blocked: item.blockedCases })}
            </span>
          </div>

          <div className="form-group">
            <label className="form-label">{t('features.testing.testExecutionForm.resultLabel')}</label>
            <div className="qa-result-row" role="radiogroup" aria-label={t('features.testing.testExecutionForm.resultAria')}>
              {TEST_RUN_RESULTS.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`qa-result-chip ${result === value ? 'is-active' : ''} tone-${value}`}
                  aria-pressed={result === value}
                  onClick={() => setResult(value)}
                >
                  {labelOf(TEST_RUN_RESULT_LABELS, value)}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">{t('features.testing.testExecutionForm.notesLabel')}</label>
            <textarea
              className="form-textarea"
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('features.testing.testExecutionForm.notesPlaceholder')}
            />
          </div>

          <div className="qa-form-footer">
            <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>{t('common.cancel')}</button>
            <button className="btn btn-primary btn-sm btn-with-icon" onClick={handleSubmit} disabled={submitting}>
              <Play size={14} aria-hidden="true" />
              {submitting ? t('features.testing.testExecutionForm.submitting') : t('features.testing.testExecutionForm.submit')}
            </button>
          </div>
        </div>
      </Panel>
    </Overlay>
  );
}
