import { getSessionUser } from '../services/auth';
import PageHeader from '../components/common/PageHeader';
import Panel from '../components/common/Panel';

// ---------------------------------------------------------------------------
// Settings page
// ---------------------------------------------------------------------------

function SettingsPage() {
  const user = getSessionUser();

  return (
    <div>
      <PageHeader title="系统设置" description="管理账户信息、API 配置、AI 模型与通知偏好。" />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Account info */}
        <Panel title="账户信息" subtitle="当前登录用户">
          <div className="metric-grid" style={{ marginBottom: 0 }}>
            <div className="metric-card">
              <div className="metric-card-label">姓名</div>
              <div className="metric-card-value">{user?.name ?? '—'}</div>
            </div>
            <div className="metric-card">
              <div className="metric-card-label">邮箱</div>
              <div className="metric-card-value">{user?.email ?? '—'}</div>
            </div>
            <div className="metric-card">
              <div className="metric-card-label">角色</div>
              <div className="metric-card-value">{user?.role ?? '—'}</div>
            </div>
            <div className="metric-card">
              <div className="metric-card-label">权限</div>
              <div className="metric-card-value">
                {user?.permissions?.length ? user.permissions.join(', ') : '—'}
              </div>
            </div>
          </div>
        </Panel>

        {/* API configuration placeholder */}
        <Panel title="API 配置" subtitle="后端服务连接设置">
          <div className="empty-state">
            <div className="empty-state-title">API 连接</div>
            <p className="empty-state-desc">
              当前 API 地址: http://localhost:4010。可在此处配置 API 端点、超时设置和鉴权方式。
            </p>
          </div>
        </Panel>

        {/* AI model configuration placeholder */}
        <Panel title="AI 模型配置" subtitle="模型选择与参数设置">
          <div className="empty-state">
            <div className="empty-state-title">模型管理</div>
            <p className="empty-state-desc">
              在此配置 AI 分析所使用的模型、路由策略、置信度阈值和人工审核规则。
            </p>
          </div>
        </Panel>

        {/* Notification preferences placeholder */}
        <Panel title="通知偏好" subtitle="消息推送与提醒设置">
          <div className="empty-state">
            <div className="empty-state-title">通知设置</div>
            <p className="empty-state-desc">
              配置站内通知、邮件提醒、风险预警和 AI 分析完成通知的接收方式。
            </p>
          </div>
        </Panel>
      </div>
    </div>
  );
}

export default SettingsPage;
