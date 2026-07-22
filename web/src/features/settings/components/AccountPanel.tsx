import Panel from '../../../components/common/Panel';
import StatusBadge from '../../../components/common/StatusBadge';
import type { SessionUser } from '../../../types';
import { USER_ROLE_LABELS, labelOf } from '../../../constants/enums';

export default function AccountPanel({ sessionUser }: { sessionUser: SessionUser | null }) {
  return (
    <Panel title="当前账号" subtitle="只展示登录账号信息；成员维护已收敛到团队管理">
      <div className="account-info-grid">
        <div className="account-info-item">
          <span className="account-info-label">姓名</span>
          <span className="account-info-value font-medium">{sessionUser?.name ?? '未登录'}</span>
        </div>
        <div className="account-info-item">
          <span className="account-info-label">邮箱</span>
          <span className="account-info-value text-mono">{sessionUser?.email ?? '未填写'}</span>
        </div>
        <div className="account-info-item">
          <span className="account-info-label">角色</span>
          <span className="account-info-value">
            {sessionUser ? <StatusBadge label={labelOf(USER_ROLE_LABELS, sessionUser.role)} status={sessionUser.role} showDot={false} /> : '未设置'}
          </span>
        </div>
        <div className="account-info-item">
          <span className="account-info-label">权限</span>
          <span className="account-info-value">{sessionUser?.permissions?.length ? sessionUser.permissions.join('、') : '未配置'}</span>
        </div>
      </div>
    </Panel>
  );
}
