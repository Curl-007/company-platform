import { useState } from 'react';
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
      setFormError(error instanceof ApiError ? error.message : '执行记录失败');
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose} maxWidth={560} ariaLabel={`记录测试执行：${item.name}`}>
      <Panel
        className="qa-form-panel"
        title="记录测试执行"
        subtitle={item.name}
        toolbar={(
          <button className="btn btn-text btn-sm btn-with-icon" onClick={onClose} aria-label="关闭">
            <X size={15} aria-hidden="true" />
          </button>
        )}
      >
        <div className="qa-form-body">
          {formError ? <div className="form-error qa-form-error">{formError}</div> : null}

          <div className="qa-form-summary">
            <StatusBadge status={item.status} label={labelOf(TEST_CASE_STATUS_LABELS, item.status)} />
            <span className="qa-form-summary-meta">
              通过率 {rate}% · 总 {item.totalCases} / 过 {item.passedCases} / 败 {item.failedCases} / 阻 {item.blockedCases}
            </span>
          </div>

          <div className="form-group">
            <label className="form-label">执行结果</label>
            <div className="qa-result-row" role="radiogroup" aria-label="执行结果">
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
            <label className="form-label">执行备注</label>
            <textarea
              className="form-textarea"
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="环境、数据、截图链接或失败定位"
            />
          </div>

          <div className="qa-form-footer">
            <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>取消</button>
            <button className="btn btn-primary btn-sm btn-with-icon" onClick={handleSubmit} disabled={submitting}>
              <Play size={14} aria-hidden="true" />
              {submitting ? '提交中...' : '提交执行'}
            </button>
          </div>
        </div>
      </Panel>
    </Overlay>
  );
}
