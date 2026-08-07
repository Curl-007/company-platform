import {
  Ban,
  CheckCircle2,
  Clock3,
  IdCard,
  Mail,
  Pencil,
  Phone,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Overlay from '../../../components/common/Overlay';
import Panel from '../../../components/common/Panel';
import ProgressBar from '../../../components/common/ProgressBar';
import StatusBadge from '../../../components/common/StatusBadge';
import { Button } from '../../../components/ui';
import type { TeamMemberOverview } from '../../../types';
import {
  formatDate,
  initials,
  navigateTo,
  PRESENCE_LABELS,
  ROLE_LABELS,
  statusLabel,
  TASK_STATUS_LABELS,
  USER_STATUS_LABELS,
  workloadRate,
} from './teamMeta';

function DetailMetric({ label, value, tone = 'neutral' }: { label: string; value: number; tone?: 'neutral' | 'risk' }) {
  return (
    <div className={`team-detail-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default function MemberDetail({
  member,
  canUpdateUsers,
  canDisableUsers,
  currentUserId,
  toggling,
  onClose,
  onEdit,
  onToggleStatus,
}: {
  member: TeamMemberOverview;
  canUpdateUsers: boolean;
  canDisableUsers: boolean;
  currentUserId?: string;
  toggling: boolean;
  onClose: () => void;
  onEdit: () => void;
  onToggleStatus: () => void;
}) {
  const { t } = useTranslation();
  const isCurrentUser = member.id === currentUserId;
  const isDisabled = member.status === 'disabled';

  return (
    <Overlay onClose={onClose} maxWidth={920}>
      <Panel
        className="team-detail-panel"
        title={member.name}
        subtitle={t('features.team.memberDetail.subtitle', {
          department: member.department || t('features.team.teamView.unsetDepartment'),
          role: statusLabel(ROLE_LABELS, member.role),
          presence: statusLabel(PRESENCE_LABELS, member.presence),
        })}
        toolbar={<StatusBadge status={member.status ?? 'active'} label={statusLabel(USER_STATUS_LABELS, member.status ?? 'active')} showDot={false} />}
      >
        <div className="team-detail-hero">
          <div className="team-avatar large">{initials(member.name)}</div>
          <div className="team-detail-profile">
            <div className="team-detail-email"><Mail size={14} />{member.email}</div>
            <div className="team-detail-active"><Clock3 size={14} />{t('features.team.memberDetail.lastActive', { date: formatDate(member.lastActiveAt) })}</div>
            {member.phone ? <div className="team-detail-active"><Phone size={14} />{member.phone}</div> : null}
            {member.position ? <div className="team-detail-active"><IdCard size={14} />{member.position}</div> : null}
            <div className="team-skill-row">
              {member.skills.map((skill) => <span key={skill} className="team-skill">{skill}</span>)}
            </div>
          </div>
        </div>

        <div className="team-detail-metrics">
          <DetailMetric label={t('features.team.memberDetail.linkedItems')} value={member.stats.totalTasks} />
          <DetailMetric label={t('features.team.memberDetail.activeTasks')} value={member.stats.activeTasks} />
          <DetailMetric label={t('features.team.memberDetail.doneTasks')} value={member.stats.doneTasks} />
          <DetailMetric label={t('features.team.memberDetail.blockersRisk')} value={member.stats.blockers} tone={member.stats.blockers > 0 ? 'risk' : 'neutral'} />
          <DetailMetric label={t('features.team.memberDetail.requirementsLinked')} value={member.stats.requirements} />
          <DetailMetric label={t('features.team.memberDetail.collaborationLogs')} value={member.stats.workLogs} />
        </div>

        <div className="team-detail-workload">
          <div className="team-progress-head">
            <span>{t('features.team.memberDetail.workloadTitle')}</span>
            <strong>{t('features.team.memberDetail.workloadSummary', { used: member.stats.actualHours, remaining: member.stats.remainingHours })}</strong>
          </div>
          <ProgressBar percent={workloadRate(member)} height={8} showPercent={false} />
          <div className="text-secondary" style={{ fontSize: 12, marginTop: 6 }}>{t('features.team.memberDetail.workloadDisclaimer')}</div>
        </div>

        <div className="team-detail-grid">
          <section className="team-detail-section">
            <div className="team-section-title">{t('features.team.memberDetail.projectsTitle')}</div>
            {member.projects.length ? member.projects.map((project) => (
              <button className="team-link-row" key={project.id} onClick={() => navigateTo('projects', { focus: project.id })}>
                <span>{project.name}</span>
                <span>{project.progress}%</span>
              </button>
            )) : <div className="team-empty-line">{t('features.team.memberDetail.noProjects')}</div>}
          </section>

          <section className="team-detail-section">
            <div className="team-section-title">{t('features.team.memberDetail.recentTasksTitle')}</div>
            {member.recentTasks.length ? member.recentTasks.map((task) => (
              <div className="team-task-row" key={task.id}>
                <div>
                  <div className="team-task-title">{task.title}</div>
                  <div className="team-task-meta">{t('features.team.memberDetail.dueDate', { date: task.dueDate || t('enums.unset') })}</div>
                </div>
                <StatusBadge status={task.status} label={statusLabel(TASK_STATUS_LABELS, task.status)} showDot={false} />
              </div>
            )) : <div className="team-empty-line">{t('features.team.memberDetail.noTasks')}</div>}
          </section>

          <section className="team-detail-section wide">
            <div className="team-section-title">{t('features.team.memberDetail.recentLogsTitle')}</div>
            {member.recentLogs.length ? member.recentLogs.map((log) => (
              <div className="team-log-row" key={log.id}>
                <div className="team-log-head">
                  <span>{log.project || t('features.team.memberDetail.unboundProject')}</span>
                  <span>{log.logDate || formatDate(log.createdAt)}</span>
                </div>
                <p>{log.content}</p>
                {log.blockers ? <div className="team-log-risk">{t('features.team.memberDetail.blockers', { content: log.blockers })}</div> : null}
              </div>
            )) : <div className="team-empty-line">{t('features.team.memberDetail.noLogs')}</div>}
          </section>
        </div>

        <div className="team-detail-actions">
          <Button variant="secondary" size="sm" onClick={onClose}>{t('common.close')}</Button>
          <Button variant="secondary" size="sm" onClick={() => navigateTo('teamlogs', { author: member.name })}>{t('features.team.memberDetail.viewLogs')}</Button>
          {canUpdateUsers || canDisableUsers ? (
            <>
              {canUpdateUsers ? (
                <Button variant="secondary" size="sm" icon={<Pencil size={14} />} onClick={onEdit}>
                  {t('features.team.memberDetail.editAccount')}
                </Button>
              ) : null}
              {canDisableUsers ? (
                <Button
                  variant={isDisabled ? 'primary' : 'danger'}
                  size="sm"
                  icon={isDisabled ? <CheckCircle2 size={14} /> : <Ban size={14} />}
                  onClick={onToggleStatus}
                  disabled={toggling || (isCurrentUser && !isDisabled)}
                  title={isCurrentUser && !isDisabled ? t('features.team.teamView.cannotDisableSelf') : undefined}
                >
                  {toggling ? t('features.team.memberDetail.processing') : isDisabled ? t('features.team.teamView.enableAccount') : t('features.team.teamView.disableAccount')}
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      </Panel>
    </Overlay>
  );
}
