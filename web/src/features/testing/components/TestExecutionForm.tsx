import { useState } from 'react';
import { createTestRun } from '../api';
import { ApiError } from '../../../services/api';
import Overlay from '../../../components/common/Overlay';
import Panel from '../../../components/common/Panel';
import type { TestCase, TestRunInput } from '../../../types';
import {
  TEST_RUN_RESULTS,
  TEST_RUN_RESULT_LABELS,
  labelOf,
} from '../../../constants/enums';

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
    <Overlay onClose={onClose}>
      <Panel title="记录测试执行" subtitle={item.name}>
        {formError ? <div className="form-error" style={{ marginBottom: 8 }}>{formError}</div> : null}
        <div className="form-group">
          <label className="form-label">执行结果</label>
          <div className="flex items-center gap-4" style={{ flexWrap: 'wrap', marginTop: 8 }}>
            {TEST_RUN_RESULTS.map((value) => (
              <label key={value} className="flex items-center gap-1">
                <input type="radio" checked={result === value} onChange={() => setResult(value)} />
                {labelOf(TEST_RUN_RESULT_LABELS, value)}
              </label>
            ))}
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">执行备注</label>
          <textarea className="form-textarea" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>取消</button>
          <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={submitting}>{submitting ? '提交中...' : '提交'}</button>
        </div>
      </Panel>
    </Overlay>
  );
}
