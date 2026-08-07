import { useState } from 'react';
import { Check, X, AlertTriangle, Clock, Circle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { FlowGate, GateState } from '../../types';

const STATE_COLORS: Record<GateState, { dot: string; ring: string; line: string; label: string }> = {
  done: {
    dot: 'var(--color-success, #16a34a)',
    ring: 'var(--color-success, #16a34a)',
    line: 'var(--color-success, #16a34a)',
    label: 'enums.flowState.done',
  },
  passed: {
    dot: 'var(--color-success, #16a34a)',
    ring: 'var(--color-success, #16a34a)',
    line: 'var(--color-success, #16a34a)',
    label: 'enums.flowState.passed',
  },
  in_progress: {
    dot: 'var(--color-info, #2563eb)',
    ring: 'var(--color-info, #2563eb)',
    line: 'var(--color-info, #2563eb)',
    label: 'enums.flowState.in_progress',
  },
  blocked: {
    dot: 'var(--color-risk, #dc2626)',
    ring: 'var(--color-risk, #dc2626)',
    line: 'var(--color-border, #e2e8f0)',
    label: 'enums.flowState.blocked',
  },
  pending: {
    dot: 'var(--color-border, #cbd5e1)',
    ring: 'var(--color-border, #cbd5e1)',
    line: 'var(--color-border, #e2e8f0)',
    label: 'enums.flowState.pending',
  },
};

function stateIcon(state: GateState) {
  switch (state) {
    case 'done':
    case 'passed':
      return <Check size={14} />;
    case 'in_progress':
      return <Clock size={14} />;
    case 'blocked':
      return <AlertTriangle size={14} />;
    default:
      return <Circle size={10} />;
  }
}

interface FlowPipelineProps {
  gates: FlowGate[];
}

export default function FlowPipeline({ gates }: FlowPipelineProps) {
  const { t } = useTranslation();
  const [active, setActive] = useState<string | null>(
    gates.find((gate) => gate.state === 'in_progress' || gate.state === 'blocked')?.stage ?? gates[0]?.stage ?? null,
  );

  const activeGate = gates.find((gate) => gate.stage === active);

  return (
    <div className="flow-pipeline">
      <div className="flow-track">
        {gates.map((gate, index) => {
          const color = STATE_COLORS[gate.state];
          const isActive = gate.stage === active;
          const prevDone = index === 0 || gates[index - 1].state === 'done' || gates[index - 1].state === 'passed';

          return (
            <div key={gate.stage} className="flow-node-wrap">
              {index > 0 && (
                <div
                  className={`flow-connector ${prevDone ? 'flow-connector-done' : ''}`}
                  style={{ background: prevDone ? STATE_COLORS[gates[index - 1].state].line : 'var(--color-border, #e2e8f0)' }}
                />
              )}
              <button
                className={`flow-node ${isActive ? 'flow-node-active' : ''}`}
                onClick={() => setActive(isActive ? null : gate.stage)}
                title={t(color.label)}
              >
                <span className="flow-node-dot" style={{ background: color.dot, borderColor: color.ring }}>
                  {stateIcon(gate.state)}
                </span>
                <span className="flow-node-label">{gate.label}</span>
              </button>
            </div>
          );
        })}
      </div>

      {activeGate && (
        <div className="flow-gate-detail">
          <div className="flow-gate-header">
            <span className="font-medium">{t('enums.flowState.stageSuffix', { stage: activeGate.label })}</span>
            <span className="tag" style={{ background: `${STATE_COLORS[activeGate.state].dot}22`, color: STATE_COLORS[activeGate.state].dot }}>
              {t(STATE_COLORS[activeGate.state].label)}
            </span>
          </div>
          <div className="flow-check-list">
            {activeGate.checks.map((check) => (
              <div key={check.name} className={`flow-check ${check.passed ? 'flow-check-passed' : 'flow-check-failed'}`}>
                <span className="flow-check-icon">
                  {check.passed ? <Check size={14} /> : <X size={14} />}
                </span>
                <span className="flow-check-name">{check.name}</span>
                {check.detail && <span className="flow-check-detail">{check.detail}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
