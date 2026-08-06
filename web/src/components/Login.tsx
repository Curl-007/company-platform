import React, { Suspense, lazy, useState, type FormEvent } from 'react';
import { Check, LockKeyhole, Mail } from 'lucide-react';
import { login } from '../services/auth';
import { lazyWithRetry } from '../app/lazyWithRetry';
import { GradientText, MotionGuard } from './reactbits';
import type { SessionUser } from '../types';

// Aurora uses ogl (WebGL). Keep it lazy so the ~150kb webgl-ogl chunk only
// loads on the login screen, never on the authenticated app shell.
const Aurora = lazyWithRetry(() => import('./reactbits/Aurora/Aurora'));

interface LoginProps {
  onLoginSuccess: (user: SessionUser) => void;
}

const HIGHLIGHTS = [
  '项目、需求、任务、测试全流程闭环',
  '看板拖拽与迭代燃尽图可视化',
  'AI 文档分析与工作日志智能解读',
  '操作审计与动态追踪',
];

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('请输入邮箱和密码。');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const user = await login(email.trim(), password);
      onLoginSuccess(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请检查账号和密码。');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-aurora" aria-hidden="true">
        <MotionGuard fallback={<div className="login-aurora-static" />}>
          <Suspense fallback={null}>
            <Aurora
              colorStops={['#339cff', '#1f7fdf', '#0a3d7a']}
              amplitude={0.8}
              blend={0.6}
            />
          </Suspense>
        </MotionGuard>
      </div>
      <div className="login-shell">
        <div className="login-brand-panel">
          <div className="login-brand-logo-lg">P</div>
          <h1 className="login-brand-title">
            <MotionGuard fallback={<span>项目管理平台</span>}>
              <GradientText
                colors={['#339cff', '#7cc4ff', '#1f7fdf', '#339cff']}
                animationSpeed={6}
              >
                项目管理平台
              </GradientText>
            </MotionGuard>
          </h1>
          <p className="login-brand-subtitle">AI 驱动的企业级项目协作工作台</p>
          <ul className="login-brand-highlights">
            {HIGHLIGHTS.map((item) => (
              <li key={item}>
                <Check size={16} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="login-form-panel">
          <div className="login-card">
            <div className="login-card-header">
              <span className="login-card-kicker">Sign in</span>
              <h2 className="login-card-title">欢迎回来</h2>
              <p className="login-card-subtitle">使用企业账号登录，进入项目协作工作台</p>
            </div>

            <form className="login-form" onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label" htmlFor="login-email">邮箱</label>
                <div className="login-input-wrap">
                  <Mail size={16} className="login-input-icon" aria-hidden />
                  <input
                    id="login-email"
                    className="form-input login-input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    autoComplete="email"
                    autoFocus
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="login-password">密码</label>
                <div className="login-input-wrap">
                  <LockKeyhole size={16} className="login-input-icon" aria-hidden />
                  <input
                    id="login-password"
                    className="form-input login-input"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="请输入密码"
                    autoComplete="current-password"
                  />
                </div>
              </div>

              {error && <div className="form-error">{error}</div>}

              <button className="btn btn-primary btn-lg login-submit" type="submit" disabled={loading}>
                {loading ? '登录中...' : '登录'}
              </button>
            </form>

          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
