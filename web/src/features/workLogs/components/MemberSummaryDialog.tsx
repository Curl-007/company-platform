import { useTranslation } from 'react-i18next';
import Overlay from '../../../components/common/Overlay';
import Panel from '../../../components/common/Panel';
import SortableSectionLayout, { SortableSection } from '../../../components/common/SortableSectionLayout';
import StatusBadge from '../../../components/common/StatusBadge';
import { USER_ROLE_LABELS, labelOf } from '../../../constants/enums';
import type { TeamWorkSummaryMember } from '../../../types';
import {
  buildMemberLinks,
  downloadMarkdown,
  goToTarget,
  hasRealBlockers,
} from './teamLogsHelpers';
import SummaryList from './SummaryList';

export default function MemberSummaryDialog({
  member,
  weekKey,
  onClose,
}: {
  member: TeamWorkSummaryMember;
  weekKey: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const relatedLinks = buildMemberLinks(member);
  const blocked = hasRealBlockers(member.summary.blockers);

  return (
    <Overlay onClose={onClose} maxWidth={760}>
      <Panel
        title={t('features.workLogs.memberSummaryDialog.title', { author: member.author })}
        subtitle={`${labelOf(USER_ROLE_LABELS, member.role)} · ${weekKey}`}
        toolbar={
          <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => downloadMarkdown(`${member.author}-${weekKey}.md`, member.markdown)}>
              {t('features.workLogs.memberSummaryDialog.exportMarkdown')}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={onClose}>
              {t('common.close')}
            </button>
          </div>
        }
      >
        <SortableSectionLayout surface="teamlogs.member-summary" className="teamlogs-member-summary-sortable">
          <SortableSection id="status" label={t('features.workLogs.memberSummaryDialog.title', { author: member.author })}>
            <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
            <StatusBadge status={member.role} label={labelOf(USER_ROLE_LABELS, member.role)} showDot={false} />
            <span className="tag">{t('features.workLogs.common.logCountTag', { count: member.count })}</span>
            {blocked ? (
              <span className="tag" style={{ color: 'var(--color-risk, #dc2626)', borderColor: 'var(--color-risk, #dc2626)' }}>
                {t('features.workLogs.common.hasBlockers')}
              </span>
            ) : null}
            </div>
          </SortableSection>

          <SortableSection id="summary" label={t('features.workLogs.memberSummaryDialog.summaryHeading')}>
            <div>
            <div className="section-title">{t('features.workLogs.memberSummaryDialog.summaryHeading')}</div>
            <div className="body-text" style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>
              {member.summary.summary || t('features.workLogs.common.noSummary')}
            </div>
            </div>
          </SortableSection>

          <SortableSection id="completed" label={t('features.workLogs.memberSummaryDialog.thisWeekCompleted')}>
            <SummaryList title={t('features.workLogs.memberSummaryDialog.thisWeekCompleted')} items={member.summary.completedItems} emptyText={t('features.workLogs.memberSummaryDialog.noCompletedItems')} />
          </SortableSection>
          <SortableSection id="blockers" label={t('features.workLogs.memberSummaryDialog.currentBlockers')}>
            <SummaryList title={t('features.workLogs.memberSummaryDialog.currentBlockers')} items={member.summary.blockers.filter((item) => item !== 'No explicit blocker was detected.')} emptyText={t('features.workLogs.memberSummaryDialog.noBlockers')} />
          </SortableSection>
          <SortableSection id="next-plans" label={t('features.workLogs.memberSummaryDialog.nextPlans')}>
            <SummaryList title={t('features.workLogs.memberSummaryDialog.nextPlans')} items={member.summary.nextPlans} emptyText={t('features.workLogs.memberSummaryDialog.noNextPlans')} />
          </SortableSection>

          <SortableSection id="related-details" label={t('features.workLogs.memberSummaryDialog.relatedDetails')}>
            <div>
            <div className="section-title">{t('features.workLogs.memberSummaryDialog.relatedDetails')}</div>
            {relatedLinks.length ? (
              <div className="summary-card-links" style={{ marginTop: 8 }}>
                {relatedLinks.map((entry) => (
                  <button key={`${entry.kind}-${entry.id}`} className="btn btn-text btn-xs" onClick={() => goToTarget(entry)}>
                    {entry.label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="body-text" style={{ marginTop: 8 }}>{t('features.workLogs.memberSummaryDialog.noRelatedItems')}</div>
            )}
            </div>
          </SortableSection>

          <SortableSection id="weekly-markdown" label={t('features.workLogs.memberSummaryDialog.weeklyMarkdown')}>
            <div>
            <div className="section-title">{t('features.workLogs.memberSummaryDialog.weeklyMarkdown')}</div>
            <pre
              style={{
                marginTop: 8,
                padding: 12,
                borderRadius: 12,
                background: 'rgba(15, 23, 42, 0.04)',
                border: '1px solid var(--border-divider)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontSize: 13,
                lineHeight: 1.7,
              }}
            >
              {member.markdown}
            </pre>
            </div>
          </SortableSection>
        </SortableSectionLayout>
      </Panel>
    </Overlay>
  );
}
