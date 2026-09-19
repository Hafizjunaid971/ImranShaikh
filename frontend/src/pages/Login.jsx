import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../i18n/LangContext';
import { LangToggle } from '../components/Layout';

export default function Login() {
  const { user, login } = useAuth();
  const { t } = useLang();
  const [form, setForm] = useState({ username: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    const res = await login(form.username.trim(), form.password);
    setBusy(false);
    if (!res.ok) setErr(res.message);
  };

  return (
    <div className="login-wrap">
      <div style={{ position: 'fixed', insetInlineEnd: '1rem', insetBlockStart: '1rem' }}>
        <LangToggle />
      </div>

      <form className="card login-card" onSubmit={submit}>
        <div className="login-title">{t('login.title')}</div>

        <div style={{ marginBottom: '.7rem' }}>
          <label htmlFor="u">{t('login.username')}</label>
          <input
            id="u"
            autoFocus
            autoComplete="username"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
          />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="p">{t('login.password')}</label>
          <input
            id="p"
            type="password"
            autoComplete="current-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </div>

        {err && (
          <div className="chip warn" style={{ display: 'block', marginBottom: '.8rem', padding: '.4rem .7rem' }}>
            {err}
          </div>
        )}

        <button className="btn gold" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>
          {busy ? t('login.checking') : t('login.submit')}
        </button>

        <p className="muted" style={{ fontSize: '.82rem', marginTop: '1rem', marginBottom: 0 }}>
          {t('login.firstTime')}: <span className="num">admin / admin123</span>
        </p>
      </form>
    </div>
  );
}
