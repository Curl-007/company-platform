import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircleQuestion, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  cancelAiInteraction,
  fetchAiInteractions,
  respondAiInteraction,
  type AiInteraction,
} from '../api/interactions';
import { subscribeAgentUiCommands, type AgentUiSubscriptionHandlers } from '../agentEventSocket';
import { useToast } from '../../../components/common/Toast';

/** REST polling fallback cadence; ws `agent.interaction` pushes only accelerate it. */
const PENDING_REFETCH_MS = 15_000;

function relativeTime(value: string | null): string {
  if (!value) return '';
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return '';
  const seconds = Math.max(0, Math.round((Date.now() - parsed) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}

function QuestionInteraction({
  interaction,
  busy,
  onRespond,
}: {
  interaction: AiInteraction;
  busy: boolean;
  onRespond: (interaction: AiInteraction, answer: { answers: Array<{ id: string; selected: string[]; custom?: string }> }) => void;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [custom, setCustom] = useState<Record<string, string>>({});
  const questions = interaction.payload.questions ?? [];

  const ready = useMemo(
    () => questions.every((question) => {
      const picked = selected[question.id]?.length ?? 0;
      const text = (custom[question.id] ?? '').trim();
      return picked > 0 || Boolean(text);
    }),
    [custom, questions, selected],
  );

  function toggle(questionId: string, label: string, multiSelect: boolean) {
    setSelected((current) => {
      const existing = current[questionId] ?? [];
      if (!multiSelect) return { ...current, [questionId]: existing.includes(label) ? [] : [label] };
      return {
        ...current,
        [questionId]: existing.includes(label) ? existing.filter((item) => item !== label) : [...existing, label],
      };
    });
  }

  function submit() {
    onRespond(interaction, {
      answers: questions.map((question) => {
        const text = (custom[question.id] ?? '').trim();
        return {
          id: question.id,
          selected: selected[question.id] ?? [],
          ...(text ? { custom: text } : {}),
        };
      }),
    });
  }

  return (
    <div className="ai-interaction-item is-question">
      <div className="ai-interaction-item-header">
        <MessageCircleQuestion size={14} aria-hidden="true" />
        <span>{t('features.ai.aiInteractionCard.questionTitle')}</span>
        <span className="ai-interaction-item-meta">
          {interaction.invocationId ? <span className="text-mono">{interaction.invocationId}</span> : null}
          {relativeTime(interaction.createdAt)}
        </span>
      </div>
      {questions.map((question) => (
        <div className="ai-interaction-question" key={question.id}>
          <div className="ai-interaction-question-text">
            {question.header ? <strong>{question.header}</strong> : null}
            <span>{question.question}</span>
            {question.detail ? <small>{question.detail}</small> : null}
            {question.multiSelect ? <em>{t('features.ai.aiInteractionCard.multiSelectHint')}</em> : null}
          </div>
          {question.options?.length ? (
            <div className="ai-interaction-options" role="group">
              {question.options.map((option) => {
                const active = (selected[question.id] ?? []).includes(option.label);
                return (
                  <button
                    key={option.label}
                    type="button"
                    className={`btn btn-sm ${active ? 'btn-primary' : 'btn-secondary'} ai-interaction-option`}
                    aria-pressed={active}
                    disabled={busy}
                    title={option.description}
                    onClick={() => toggle(question.id, option.label, Boolean(question.multiSelect))}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          ) : null}
          <input
            className="form-input ai-interaction-custom"
            value={custom[question.id] ?? ''}
            maxLength={4000}
            placeholder={t('features.ai.aiInteractionCard.customPlaceholder')}
            aria-label={t('features.ai.aiInteractionCard.customLabel')}
            disabled={busy}
            onChange={(event) => setCustom((current) => ({ ...current, [question.id]: event.target.value }))}
          />
        </div>
      ))}
      <div className="ai-interaction-item-actions">
        <button type="button" className="btn btn-primary btn-sm" disabled={busy || !ready} onClick={submit}>
          {t('features.ai.aiInteractionCard.submit')}
        </button>
      </div>
    </div>
  );
}

function ApprovalInteraction({
  interaction,
  busy,
  onRespond,
}: {
  interaction: AiInteraction;
  busy: boolean;
  onRespond: (interaction: AiInteraction, decision: 'approve' | 'reject') => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="ai-interaction-item is-approval">
      <div className="ai-interaction-item-header">
        <ShieldCheck size={14} aria-hidden="true" />
        <span>{t('features.ai.aiInteractionCard.approvalTitle')}</span>
        <span className="ai-interaction-item-meta">
          {interaction.payload.toolName ? <span className="text-mono">{interaction.payload.toolName}</span> : null}
          {relativeTime(interaction.createdAt)}
        </span>
      </div>
      {interaction.payload.reason ? (
        <p className="ai-interaction-reason">{interaction.payload.reason}</p>
      ) : (
        <p className="ai-interaction-reason">{t('features.ai.aiInteractionCard.approvalDefaultReason')}</p>
      )}
      <p className="ai-interaction-risk" role="note">
        {t('features.ai.aiInteractionCard.approveRisk')}
      </p>
      <div className="ai-interaction-item-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy}
          onClick={() => onRespond(interaction, 'approve')}
        >
          {t('features.ai.aiInteractionCard.approve')}
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={busy}
          onClick={() => onRespond(interaction, 'reject')}
        >
          {t('features.ai.aiInteractionCard.reject')}
        </button>
      </div>
      <p className="ai-interaction-hint">{t('features.ai.aiInteractionCard.rejectHint')}</p>
    </div>
  );
}

/**
 * Pending ask-user/approval cards. The 15s REST poll stays the fallback; an
 * `agent.interaction` push on the realtime channel accelerates the refresh by
 * invalidating the query immediately.
 */
export default function AiInteractionCard({
  subscribeInteractions = subscribeAgentUiCommands,
}: {
  /** Injection point for tests (same pattern as useInvocationTrace). */
  subscribeInteractions?: (handlers: AgentUiSubscriptionHandlers) => () => void;
} = {}) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const pendingQuery = useQuery({
    queryKey: ['ai', 'interactions', 'pending'],
    queryFn: ({ signal }) => fetchAiInteractions('pending', signal),
    refetchInterval: PENDING_REFETCH_MS,
  });

  const pending = pendingQuery.data ?? [];

  // ws acceleration: every agent.interaction push triggers an immediate
  // refetch; without a connection this stays a no-op and polling covers it.
  useEffect(() => subscribeInteractions({
    onInteraction: () => {
      void queryClient.invalidateQueries({ queryKey: ['ai', 'interactions'] });
    },
  }), [queryClient, subscribeInteractions]);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['ai', 'interactions'] });
  }

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('features.ai.aiInteractionCard.actionFailed'));
    }
  }

  async function handleRespond(
    interaction: AiInteraction,
    input: { answer: { answers: Array<{ id: string; selected: string[]; custom?: string }> } } | { decision: 'approve' | 'reject' },
  ) {
    setBusyId(interaction.interactionId);
    try {
      await run(() => respondAiInteraction(interaction.interactionId, input));
      toast.success(t('features.ai.aiInteractionCard.responded'));
    } finally {
      setBusyId(null);
    }
  }

  async function handleCancel(interaction: AiInteraction) {
    setBusyId(interaction.interactionId);
    try {
      await run(() => cancelAiInteraction(interaction.interactionId));
      toast.success(t('features.ai.aiInteractionCard.cancelled'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="ai-interaction-card" aria-label={t('features.ai.aiInteractionCard.title')}>
      <div className="ai-interaction-header">
        <MessageCircleQuestion size={14} aria-hidden="true" />
        <span>{t('features.ai.aiInteractionCard.title')}</span>
        {pending.length > 0 ? (
          <span className="ai-interaction-count" aria-label={t('features.ai.aiInteractionCard.countLabel')}>
            {pending.length}
          </span>
        ) : null}
      </div>
      {pendingQuery.isError ? (
        <div className="ai-interaction-empty" role="status">{t('features.ai.aiInteractionCard.loadFailed')}</div>
      ) : pendingQuery.isPending ? (
        <div className="ai-interaction-empty" role="status">{t('features.ai.aiInteractionCard.loading')}</div>
      ) : pending.length === 0 ? (
        <div className="ai-interaction-empty" role="status">{t('features.ai.aiInteractionCard.empty')}</div>
      ) : (
        <ul className="ai-interaction-list">
          {pending.map((interaction) => (
            <li key={interaction.interactionId}>
              {interaction.kind === 'approval' ? (
                <ApprovalInteraction
                  interaction={interaction}
                  busy={busyId === interaction.interactionId}
                  onRespond={(item, decision) => { void handleRespond(item, { decision }); }}
                />
              ) : (
                <QuestionInteraction
                  interaction={interaction}
                  busy={busyId === interaction.interactionId}
                  onRespond={(item, answer) => { void handleRespond(item, { answer }); }}
                />
              )}
              <div className="ai-interaction-cancel-row">
                <button
                  type="button"
                  className="btn btn-text btn-xs"
                  disabled={busyId === interaction.interactionId}
                  onClick={() => { void handleCancel(interaction); }}
                >
                  {t('features.ai.aiInteractionCard.cancel')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
