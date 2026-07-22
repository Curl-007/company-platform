import {
  Ban,
  CheckCircle2,
  Clock3,
  IdCard,
  Mail,
  Pencil,
  Phone,
} from 'lucide-react';
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
  const isCurrentUser = member.id === currentUserId;
  const isDisabled = member.status === 'disabled';

  return (
    <Overlay onClose={onClose} maxWidth={920}>
      <Panel
        className="team-detail-panel"
        title={member.name}
        subtitle={`${member.department || '未设置部门'} · ${statusLabel(ROLE_LABELS, member.role)} · ${PRESENCE_LABELS[member.presence]}`}
        toolbar={<StatusBadge status={member.status ?? 'active'} label={statusLabel(USER_STATUS_LABELS, member.status ?? 'active')} showDot={false} />}
      >
        <div className="team-detail-hero">
          <div className="team-avatar large">{initials(member.name)}</div>
          <div className="team-detail-profile">
            <div className="team-detail-email"><Mail size={14} />{member.email}</div>
            <div className="team-detail-active"><Clock3 size={14} />最近活动：{formatDate(member.lastActiveAt)}</div>
            {member.phone ? <div className="team-detail-active"><Phone size={14} />{member.phone}</div> : null}
            {member.position ? <div className="team-detail-active"><IdCard size={14} />{member.position}</div> : null}
            <div className="team-skill-row">
              {member.skills.map((skill) => <span key={skill} className="team-skill">{skill}</span>)}
            </div>
          </div>
        </div>

        <div className="team-detail-metrics">
          <DetailMetric label="关联工作项" value={member.stats.totalTasks} />
          <DetailMetric label="进行中" value={member.stats.activeTasks} />
          <DetailMetric label="已闭环工作项" value={member.stats.doneTasks} />
          <DetailMetric label="阻塞/风险" value={member.stats.blockers} tone={member.stats.blockers > 0 ? 'risk' : 'neutral'} />
          <DetailMetric label="需求关联" value={member.stats.requirements} />
          <DetailMetric label="协作记录" value={member.stats.workLogs} />
        </div>

        <div className="team-detail-workload">
          <div className="team-progress-head">
            <span>资源协调概览</span>
            <strong>{member.stats.actualHours}h 已用 / {member.stats.remainingHours}h 剩余</strong>
          </div>
          <ProgressBar percent={workloadRate(member)} height={8} showPercent={false} />
          <div className="text-secondary" style={{ fontSize: 12, marginTop: 6 }}>仅用于识别资源安排和交付风险，不用于绩效、排名、薪酬、晋升或淘汰。</div>
        </div>

        <div className="team-detail-grid">
          <section className="team-detail-section">
            <div className="team-section-title">参与项目</div>
            {member.projects.length ? member.projects.map((project) => (
              <button className="team-link-row" key={project.id} onClick={() => navigateTo('projects', { focus: project.id })}>
                <span>{project.name}</span>
                <span>{project.progress}%</span>
              </button>
            )) : <div className="team-empty-line">暂无项目参与记录</div>}
          </section>

          <section className="team-detail-section">
            <div className="team-section-title">近期任务</div>
            {member.recentTasks.length ? member.recentTasks.map((task) => (
              <div className="team-task-row" key={task.id}>
                <div>
                  <div className="team-task-title">{task.title}</div>
                  <div className="team-task-meta">截止：{task.dueDate || '未设置'}</div>
                </div>
                <StatusBadge status={task.status} label={statusLabel(TASK_STATUS_LABELS, task.status)} showDot={false} />
              </div>
            )) : <div className="team-empty-line">暂无进行中任务</div>}
          </section>

          <section className="team-detail-section wide">
            <div className="team-section-title">最近日报</div>
            {member.recentLogs.length ? member.recentLogs.map((log) => (
              <div className="team-log-row" key={log.id}>
                <div className="team-log-head">
                  <span>{log.project || '未绑定项目'}</span>
                  <span>{log.logDate || formatDate(log.createdAt)}</span>
                </div>
                <p>{log.content}</p>
                {log.blockers ? <div className="team-log-risk">阻塞：{log.blockers}</div> : null}
              </div>
            )) : <div className="team-empty-line">暂无日报记录</div>}
          </section>
        </div>

        <div className="team-detail-actions">
          <Button variant="secondary" size="sm" onClick={onClose}>关闭</Button>
          <Button variant="secondary" size="sm" onClick={() => navigateTo('teamlogs', { author: member.name })}>查看日报</Button>
          {canUpdateUsers || canDisableUsers ? (
            <>
              {canUpdateUsers ? (
                <Button variant="secondary" size="sm" icon={<Pencil size={14} />} onClick={onEdit}>
                  编辑账号
                </Button>
              ) : null}
              {canDisableUsers ? (
                <Button
                  variant={isDisabled ? 'primary' : 'danger'}
                  size="sm"
                  icon={isDisabled ? <CheckCircle2 size={14} /> : <Ban size={14} />}
                  onClick={onToggleStatus}
                  disabled={toggling || (isCurrentUser && !isDisabled)}
                  title={isCurrentUser && !isDisabled ? '不能停用当前登录账号' : undefined}
                >
                  {toggling ? '处理中...' : isDisabled ? '启用账号' : '停用账号'}
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      </Panel>
    </Overlay>
  );
}
