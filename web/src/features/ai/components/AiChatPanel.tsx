import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import type { AiChatAttachment, AiChatMessage, Project } from '../../../types';
import Panel from '../../../components/common/Panel';
import StatusBadge from '../../../components/common/StatusBadge';
import AgentMessages from './agent/AgentMessages';
import AgentComposer from './agent/AgentComposer';

/**
 * Workspace chat panel: thin shell over the shared agent chat pieces
 * (AgentMessages / AgentComposer) with the provider header strip. The global
 * agent sidebar renders the same shared pieces in compact mode. Capability
 * policy stays behind the DSH/runtime
 * boundary rather than appearing as a manual toolbar in the conversation.
 */
export default function AiChatPanel({
  providerStatus,
  providerConfigured,
  messages,
  draft,
  setDraft,
  attachments,
  setAttachments,
  sending,
  fileError,
  onFiles,
  onSend,
  projects = [],
  onActionDone,
}: {
  providerStatus: string;
  providerConfigured?: boolean;
  messages: AiChatMessage[];
  draft: string;
  setDraft: (value: string) => void;
  attachments: AiChatAttachment[];
  setAttachments: Dispatch<SetStateAction<AiChatAttachment[]>>;
  sending: boolean;
  fileError: string | null;
  onFiles: (files: FileList | null) => void;
  onSend: () => void;
  projects?: Project[];
  onActionDone?: (result: { type: string; id: string; label: string }) => void;
}) {
  const { t } = useTranslation();

  return (
    <Panel
      className="ai-chat-panel"
      title={t('features.ai.aiChatPanel.title')}
      subtitle={providerStatus}
      toolbar={<StatusBadge label={providerConfigured ? t('features.ai.aiChatModel.sourceRealModel') : t('features.ai.aiChatModel.sourceRuleFallback')} status={providerConfigured ? 'success' : 'warning'} />}
    >
      <AgentMessages messages={messages} sending={sending} projects={projects} onActionDone={onActionDone} />

      <AgentComposer
        draft={draft}
        setDraft={setDraft}
        attachments={attachments}
        setAttachments={setAttachments}
        sending={sending}
        fileError={fileError}
        onFiles={onFiles}
        onSend={onSend}
      />
    </Panel>
  );
}
