import { useState } from 'react';
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
      setError(reason instanceof ApiError ? reason.message : '保存风险阈值失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <Panel title="容量风险阈值" subtitle="阈值仅改变资源风险提示，不用于个人绩效评分。">
        <form className="form-stack" onSubmit={submit}>
          {error ? <div className="form-error">{error}</div> : null}
          <div className="form-grid form-grid-3">
            <label className="form-field">
              <span>平衡下限</span>
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
              <span>关注下限</span>
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
              <span>过载阈值</span>
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
          <small className="text-secondary">要求：平衡下限 ≤ 关注下限 ≤ 过载阈值。比例 1 代表 100%。</small>
          <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={saving}>取消</button>
            <button className="btn btn-primary btn-sm" disabled={saving}>{saving ? '保存中…' : '保存阈值'}</button>
          </div>
        </form>
      </Panel>
    </Overlay>
  );
}
