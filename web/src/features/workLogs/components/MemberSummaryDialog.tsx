import Overlay from '../../../components/common/Overlay';
import Panel from '../../../components/common/Panel';
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
  const relatedLinks = buildMemberLinks(member);
  const blocked = hasRealBlockers(member.summary.blockers);

  return (
    <Overlay onClose={onClose} maxWidth={760}>
      <Panel
        title={`${member.author} 周报`}
        subtitle={`${labelOf(USER_ROLE_LABELS, member.role)} · ${weekKey}`}
        toolbar={
          <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => downloadMarkdown(`${member.author}-${weekKey}.md`, member.markdown)}>
              导出 Markdown
            </button>
            <button className="btn btn-secondary btn-sm" onClick={onClose}>
              关闭
            </button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
            <StatusBadge status={member.role} label={labelOf(USER_ROLE_LABELS, member.role)} showDot={false} />
            <span className="tag">{member.count} 篇日报</span>
            {blocked ? (
              <span className="tag" style={{ color: 'var(--color-risk, #dc2626)', borderColor: 'var(--color-risk, #dc2626)' }}>
                有阻塞
              </span>
            ) : null}
          </div>

          <div>
            <div className="section-title">周报摘要</div>
            <div className="body-text" style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>
              {member.summary.summary || '暂无摘要。'}
            </div>
          </div>

          <SummaryList title="本周完成" items={member.summary.completedItems} emptyText="暂无完成项。" />
          <SummaryList title="当前阻塞" items={member.summary.blockers.filter((item) => item !== 'No explicit blocker was detected.')} emptyText="暂无阻塞。" />
          <SummaryList title="下步计划" items={member.summary.nextPlans} emptyText="暂无下步计划。" />

          <div>
            <div className="section-title">关联详情</div>
            {relatedLinks.length ? (
              <div className="summary-card-links" style={{ marginTop: 8 }}>
                {relatedLinks.map((entry) => (
                  <button key={`${entry.kind}-${entry.id}`} className="btn btn-text btn-xs" onClick={() => goToTarget(entry)}>
                    {entry.label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="body-text" style={{ marginTop: 8 }}>暂无关联条目。</div>
            )}
          </div>

          <div>
            <div className="section-title">周报 Markdown</div>
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
        </div>
      </Panel>
    </Overlay>
  );
}
