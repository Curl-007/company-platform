import type { Dispatch, SetStateAction } from 'react';
import Panel from '../../../components/common/Panel';
import { Button, Checkbox, FormField } from '../../../components/ui';
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
  const unchanged =
    aiPrefsDraft.confidenceThreshold === aiPrefs.confidenceThreshold &&
    aiPrefsDraft.autoAnalyze === aiPrefs.autoAnalyze;

  return (
    <Panel
      title="AI 分析策略"
      subtitle="控制自动分析和人工确认阈值"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="primary" size="sm" onClick={onSave} disabled={unchanged}>
            保存策略
          </Button>
        </div>
      }
    >
      <div className="settings-form">
        <FormField label="自动确认阈值" htmlFor="settings-ai-confidence" helpText="低于该置信度的 AI 分析结果不会自动写入，需人工确认。">
          <div className="flex items-center gap-3">
            <input
              id="settings-ai-confidence"
              className="form-input flex-1"
              type="range"
              min={0}
              max={100}
              step={5}
              value={aiPrefsDraft.confidenceThreshold}
              onChange={(e) => setAiPrefsDraft((prev) => ({ ...prev, confidenceThreshold: Number(e.target.value) }))}
            />
            <span className="text-mono min-w-10 text-right">{aiPrefsDraft.confidenceThreshold}%</span>
          </div>
        </FormField>
        <FormField label="自动分析" htmlFor="settings-ai-auto-analyze" helpText="文档上传后自动触发 AI 分析，无需手动点击。">
          <Checkbox id="settings-ai-auto-analyze" checked={aiPrefsDraft.autoAnalyze} onChange={(e) => setAiPrefsDraft((prev) => ({ ...prev, autoAnalyze: e.target.checked }))} />
        </FormField>
      </div>
    </Panel>
  );
}
