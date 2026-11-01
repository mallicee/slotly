import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import catalog from '../../../shared/catalog.json';
import { api } from '../api/client';
import { useAuth } from './auth';

export default function Login() {
  const { email: signedIn, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const demo = api.mode === 'demo';
  const [email, setEmail] = useState(demo ? catalog.demoAdmin.email : '');
  const [password, setPassword] = useState(demo ? catalog.demoAdmin.password : '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (signedIn) return <Navigate to="/admin" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from.startsWith('/admin') ? from : '/admin', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось войти');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="brand brand-lg">
          <img src="./favicon.svg" alt="" width="40" height="40" />
          <span>Slotly</span>
        </div>
        <h1>Вход в CRM</h1>
        <p className="muted">Записи, клиенты и выручка салона в одном месте.</p>
        {demo && (
          <div className="notice">
            Демо-доступ уже подставлен: <b>{catalog.demoAdmin.email}</b> / <b>{catalog.demoAdmin.password}</b>
          </div>
        )}
        <label className="field">
          <span>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
        </label>
        <label className="field">
          <span>Пароль</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {error && <div className="notice notice-error" role="alert">{error}</div>}
        <button className="btn btn-primary btn-lg" disabled={busy}>{busy ? 'Входим…' : 'Войти'}</button>
        <Link to="/" className="back-link">← На страницу записи</Link>
      </form>
    </div>
  );
}
