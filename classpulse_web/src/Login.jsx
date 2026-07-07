import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL, persistAuthSession } from './apiClient';

export default function Login() {
  const navigate = useNavigate();

  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (event) => {
    const { name, value } = event.target;
    setCredentials((prev) => ({ ...prev, [name]: value }));
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    const targetEmail = 'menon@ucmerced.edu';
    const targetPassword = 'Menon@123';
    const email = String(credentials.email || '');
    const password = String(credentials.password || '');

    if (email.trim().toLowerCase() !== targetEmail || password !== targetPassword) {
      setError('Access Denied: Invalid administrator credentials.');
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: email,
          password,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to sign in.');
      }

      const sessionPayload = {
        token: payload.token,
        user: payload.user,
        savedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + (24 * 60 * 60 * 1000)).toISOString(),
      };

      // Persist auth data synchronously before route transition to avoid first-render guard races.
      persistAuthSession(sessionPayload);
      localStorage.setItem('token', String(payload.token || ''));
      localStorage.setItem('user', JSON.stringify(payload.user || {}));
      window.dispatchEvent(new Event('classpulse-auth-updated'));

      if (payload?.user?.role === 'professor') {
        navigate('/instructor', { replace: true });
      } else {
        navigate('/student', { replace: true });
      }
    } catch (loginError) {
      setError(loginError.message || 'Unable to sign in.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors px-4 py-10">
      <div className="p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl w-full max-w-md">
        <p className="text-xs uppercase tracking-[0.35em] text-cyan-300">ClassPulse Access</p>
        <h1 className="mt-3 text-3xl font-bold text-slate-900 dark:text-white">Welcome back</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Teacher Portal login. Authorized administrator credentials only.</p>

        <form onSubmit={handleLogin} className="mt-6 space-y-4">
          <input
            type="email"
            name="email"
            value={credentials.email}
            onChange={handleChange}
            placeholder="Email"
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 py-3 text-sm text-slate-900 dark:text-white outline-none focus:border-cyan-400 transition-colors"
            required
          />
          <input
            type="password"
            name="password"
            value={credentials.password}
            onChange={handleChange}
            placeholder="Password"
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 py-3 text-sm text-slate-900 dark:text-white outline-none focus:border-cyan-400 transition-colors"
            required
          />

          {error ? <p className="text-sm text-rose-300">{error}</p> : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
