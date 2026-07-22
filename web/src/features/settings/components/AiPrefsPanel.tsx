import type { Dispatch, SetStateAction } from 'react';
import Panel from '../../../components/common/Panel';
import { Button } from '../../../components/ui';
import { DEFAULT_AI_PREFS } from '../settingsModel';

type AiPrefs = typeof DEFAULT_AI_PREFS;

export default function AiPrefsPanel({
  aiPrefsDraft,
  aiPrefs,
  setAiPrefsDraft,
  onSave,
}: {
  aiPrefsDraft: AiPrefs;
  aiPrefs: AiPrefs;
  setAiPrefsDraft: Dispatch<SetStateAction<AiPrefs>>;
  onSave: () => void;
}) {
  return (
    <Panel title="AI 分析策略" subtitle="控制自动分析和人工确认阈值">
      <div className="settings-form">
        <div className="form-group">
          <label className="form-label">自动确认阈值</label>
          <div className="flex items-center gap-2">
            <input className="form-input" type="range" min={0} max={100} step={5} value={aiPrefsDraft.confidenceThreshold} onChange={(e) => setAiPrefsDraft((prev) => ({ ...prev, confidenceThreshold: Number(e.target.value) }))} style={{ flex: 1 }} />
            <span className="text-mono" style={{ minWidth: 32, textAlign: 'right' }}>{aiPrefsDraft.confidenceThreshold}%</span>
          </div>
        </div>
        <div className="form-group">
          <label className="form-checkbox">
            <input type="checkbox" checked={aiPrefsDraft.autoAnalyze} onChange={(e) => setAiPrefsDraft((prev) => ({ ...prev, autoAnalyze: e.target.checked }))} />
            <span>新文档上传后自动触发 AI 分析</span>
          </label>
        </div>
        <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
          <Button
            variant="primary"
            size="sm"
            onClick={onSave}
            disabled={
              aiPrefsDraft.confidenceThreshold === aiPrefs.confidenceThreshold &&
              aiPrefsDraft.autoAnalyze === aiPrefs.autoAnalyze
            }
          >
            保存策略
          </Button>
        </div>
      </div>
    </Panel>
  );
}
