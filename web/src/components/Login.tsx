import React, { useState, FormEvent } from 'react';
import { login } from '../services/auth';
import type { SessionUser } from '../types';

// ---------------------------------------------------------------------------
// Login: email + password authentication form
// ---------------------------------------------------------------------------

interface LoginProps {
  /** Callback when login succeeds */
  onLoginSuccess: (user: SessionUser) => void;
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('admin@example.com');
  const [password, setPassword] = useState('Admin@123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Please enter both email and password.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const user = await login(email.trim(), password);
      onLoginSuccess(user);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Login failed. Please check your credentials.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-card-brand">
          <div className="sidebar-brand-logo">P</div>
          <div className="login-card-title">项目管理平台</div>
          <div className="login-card-subtitle">
            AI 驱动的企业项目管理平台
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="login-email">
              邮箱
            </label>
            <input
              id="login-email"
              className="form-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="login-password">
              密码
            </label>
            <input
              id="login-password"
              className="form-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              autoComplete="current-password"
            />
          </div>

          {error && <div className="form-error">{error}</div>}

          <button
            className="btn btn-primary btn-lg"
            type="submit"
            disabled={loading}
          >
            {loading ? '登录中…' : '登录'}
          </button>
        </form>

        <div className="login-card-hint">
          <strong>演示账号</strong> · 管理员 admin@example.com / Admin@123
          <br />
          项目经理 pm@example.com / Pm@12345
        </div>
      </div>
    </div>
  );
};

export default Login;
