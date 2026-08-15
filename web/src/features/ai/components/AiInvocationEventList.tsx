import { useTranslation } from 'react-i18next';
import { CircleDashed, Flag, MessageSquare, Wrench, type LucideIcon } from 'lucide-react';
import { formatInvocationRelativeTime, type InvocationEventView } from '../models/harnessModel';

// ---------------------------------------------------------------------------
// Pure rendering layer of the dsh execution timeline: the vertical event list
// shared by the live invocation trace drawer (AiInvocationTimeline) and the
// read-only session replay. No data fetching, no realtime logic.
// ---------------------------------------------------------------------------

type Translator = (key: string, options?: Record<string, unknown>) => string;

function eventIcon(category: InvocationEventView['category']): LucideIcon {
  if (category === 'turn-end') return Flag;
  if (category === 'assistant-message') return MessageSquare;
  if (category === 'tool-call') return Wrench;
  return CircleDashed;
}

function reasonLabel(reasonKind: string | null, t: Translator): string {
  const prefix = 'features.ai.aiInvocationTimeline';
  if (reasonKind === 'completed') return t(`${prefix}.reasonCompleted`);
  if (reasonKind === 'aborted') return t(`${prefix}.reasonAborted`);
  if (reasonKind === 'blocked') return t(`${prefix}.reasonBlocked`);
  if (reasonKind === 'error') return t(`${prefix}.reasonError`);
  if (reasonKind === 'max-tokens') return t(`${prefix}.reasonMaxTokens`);
  if (reasonKind === 'interrupted') return t(`${prefix}.reasonInterrupted`);
  if (!reasonKind) return t(`${prefix}.reasonMissing`);
  return t(`${prefix}.reasonUnknown`, { kind: reasonKind });
}

function toolDisplayName(toolName: string, t: (key: string) => string): string {
  const prefix = 'features.ai.aiInvocationTimeline';
  if (toolName === 'project_snapshot') return t(`${prefix}.toolProjectSnapshot`);
  if (toolName === 'ui_control') return t(`${prefix}.toolUiControl`);
  return toolName;
}

function eventDisplayName(event: InvocationEventView, t: Translator): string {
  const prefix = 'features.ai.aiInvocationTimeline';
  if (event.category === 'turn-end') return t(`${prefix}.eventTurnEnd`);
  if (event.category === 'assistant-message') return t(`${prefix}.eventAssistantMessage`);
  if (event.category === 'tool-call') return t(`${prefix}.eventToolCall`);
  // Unknown harness event types degrade to their raw type text.
  return event.type;
}

function eventSummary(event: InvocationEventView, t: Translator): string {
  const prefix = 'features.ai.aiInvocationTimeline';
  if (event.category === 'turn-end') return reasonLabel(event.reasonKind, t);
  if (event.category === 'assistant-message' && event.usage) {
    return t(`${prefix}.tokenDelta`, { input: event.usage.inputTokens, output: event.usage.outputTokens });
  }
  if (event.category === 'tool-call' && event.toolName) return toolDisplayName(event.toolName, t);
  return '';
}

export default function AiInvocationEventList({ events }: { events: InvocationEventView[] }) {
  const { t } = useTranslation();
  return (
    <ol className="ai-invocation-events">
      {events.map((event) => {
        const Icon = eventIcon(event.category);
        const summary = eventSummary(event, t);
        return (
          <li
            key={`${event.seq}-${event.type}`}
            className={`ai-invocation-event is-${event.tone} ${event.category === 'tool-call' ? 'is-tool' : ''}`}
          >
            <span className="ai-invocation-event-seq">{event.seq}</span>
            <span className="ai-invocation-event-icon"><Icon size={12} aria-hidden="true" /></span>
            <div className="ai-invocation-event-main">
              <div className="ai-invocation-event-meta">
                <span className="ai-invocation-event-name">{eventDisplayName(event, t)}</span>
                {event.time ? (
                  <span className="ai-invocation-event-time">{formatInvocationRelativeTime(event.time)}</span>
                ) : null}
              </div>
              {summary ? <div className="ai-invocation-event-summary">{summary}</div> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
