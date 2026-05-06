import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme';
import { adminLogin, isAdminAuthenticated } from '../lib/adminAuth';
import { getCachedRuntimeMode } from '../lib/runtimeMode';

export function AdminLoginPage() {
  useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (getCachedRuntimeMode()?.demoMode || isAdminAuthenticated()) {
    return <Navigate to="/admin" replace />;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      await adminLogin(username, password);
      const target = (location.state as { from?: string } | null)?.from || '/admin';
      navigate(target, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login fehlgeschlagen');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
        <p className="text-xs uppercase tracking-[0.25em] text-slate-400 mb-3">Admin Login</p>
        <h1 className="text-2xl font-semibold mb-2">Dialoge verwalten</h1>
        <p className="text-sm text-slate-400 mb-6">
          Melden Sie sich an, um Dialoge zu erstellen, zu bearbeiten und freizuschalten.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-300 mb-1">Benutzername</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              autoComplete="username"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">Passwort</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              autoComplete="current-password"
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-medium text-white hover:bg-primary-dark transition-colors disabled:opacity-60"
          >
            {submitting ? 'Anmeldung läuft …' : 'Anmelden'}
          </button>
        </form>
      </div>
    </div>
  );
}
