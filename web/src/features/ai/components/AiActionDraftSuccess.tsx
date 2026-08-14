import { useTranslation } from 'react-i18next';

export default function AiActionDraftSuccess({
  actionLabel,
  doneId,
  onOpen,
}: {
  actionLabel: string;
  doneId: string;
  onOpen: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="ai-action-card ai-action-card-success">
      <div className="ai-action-card-title">{t('features.ai.aiActionDraftCard.completed', { label: actionLabel })}</div>
      <div className="body-text">{t('features.ai.aiActionDraftCard.target')}：<span className="text-mono">{doneId}</span></div>
      <div className="ai-action-card-toolbar">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onOpen}>{t('features.ai.aiActionDraftCard.openRelatedPage')}</button>
      </div>
    </div>
  );
}
