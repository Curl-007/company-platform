import React, { Suspense, useState, type FormEvent } from 'react';
import { Check, LockKeyhole, Mail } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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

const HIGHLIGHT_KEYS = [
  'auth.feature1',
  'auth.feature2',
  'auth.feature3',
  'auth.feature4',
];

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError(t('auth.emailPasswordRequired'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      const user = await login(email.trim(), password);
      onLoginSuccess(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.loginFailed'));
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
            <MotionGuard fallback={<span>{t('auth.brandTitle')}</span>}>
              <GradientText
                colors={['#339cff', '#7cc4ff', '#1f7fdf', '#339cff']}
                animationSpeed={6}
              >
                {t('auth.brandTitle')}
              </GradientText>
            </MotionGuard>
          </h1>
          <p className="login-brand-subtitle">{t('auth.subtitle')}</p>
          <ul className="login-brand-highlights">
            {HIGHLIGHT_KEYS.map((item) => (
              <li key={item}>
                <Check size={16} />
                <span>{t(item)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="login-form-panel">
          <div className="login-card">
            <div className="login-card-header">
              <span className="login-card-kicker">Sign in</span>
              <h2 className="login-card-title">{t('auth.welcome')}</h2>
              <p className="login-card-subtitle">{t('auth.cardSubtitle')}</p>
            </div>

            <form className="login-form" onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label" htmlFor="login-email">{t('auth.email')}</label>
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
                <label className="form-label" htmlFor="login-password">{t('auth.password')}</label>
                <div className="login-input-wrap">
                  <LockKeyhole size={16} className="login-input-icon" aria-hidden />
                  <input
                    id="login-password"
                    className="form-input login-input"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('auth.passwordPlaceholder')}
                    autoComplete="current-password"
                  />
                </div>
              </div>

              {error && <div className="form-error">{error}</div>}

              <button className="btn btn-primary btn-lg login-submit" type="submit" disabled={loading}>
                {loading ? t('auth.signingIn') : t('auth.login')}
              </button>
            </form>

          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
