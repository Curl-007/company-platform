import Panel from '../../../components/common/Panel';
import Overlay from '../../../components/common/Overlay';
import StatusBadge from '../../../components/common/StatusBadge';
import ProgressBar from '../../../components/common/ProgressBar';
import type { Task } from '../../../types';
import { TASK_STATUS_LABELS, labelOf } from '../../../constants/enums';

export default function TaskDetailView({ task, onClose }: { task: Task; onClose: () => void; onUpdated: () => void }) {
  return (
    <Overlay onClose={onClose}>
      <Panel title={task.title} subtitle={task.wbsCode}>
        <div className="detail-grid">
          <div className="detail-field">
            <span className="detail-label">编码</span>
            <span className="text-mono">{task.wbsCode}</span>
          </div>
          <div className="detail-field">
            <span className="detail-label">负责人</span>
            <span>{task.owner || '-'}</span>
          </div>
          <div className="detail-field">
            <span className="detail-label">状态</span>
            <StatusBadge label={labelOf(TASK_STATUS_LABELS, task.status)} status={task.status} />
          </div>
          <div className="detail-field">
            <span className="detail-label">预估工时</span>
            <span>{task.estimatedHours ?? '-'}h</span>
          </div>
          <div className="detail-field">
            <span className="detail-label">剩余工时</span>
            <span>{task.remainingHours ?? 0}h</span>
          </div>
          <div className="detail-field">
            <span className="detail-label">进度</span>
            <ProgressBar percent={task.progress ?? 0} height={8} />
          </div>
          <div className="detail-field">
            <span className="detail-label">描述</span>
            <span>{task.description || '暂无描述'}</span>
          </div>
          <div className="detail-field">
            <span className="detail-label">截止日期</span>
            <span>{task.dueDate || '-'}</span>
          </div>
        </div>
        <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>关闭</button>
        </div>
      </Panel>
    </Overlay>
  );
}
