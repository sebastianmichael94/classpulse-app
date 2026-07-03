import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

const AUTH_SESSION_KEY = 'classpulse.authSession';

function readPreferredRole(search) {
  const params = new URLSearchParams(search || '');
  const role = String(params.get('role') || '').toLowerCase();
  return role === 'professor' ? 'professor' : 'student';
}

export default function Login() {
  const location = useLocation();
  const navigate = useNavigate();
  const preferredRole = useMemo(() => readPreferredRole(location.search), [location.search]);

  const [credentials, setCredentials] = useState({ username: '', password: '' });
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

    try {
      const response = await fetch('http://127.0.0.1:8000/api/auth/login/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to sign in.');
      }

      const sessionPayload = {
        token: payload.token,
        user: payload.user,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(sessionPayload));

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
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-10 flex items-center justify-center">
      <div className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900/90 p-8 shadow-2xl">
        <p className="text-xs uppercase tracking-[0.35em] text-cyan-300">ClassPulse Access</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">Welcome back</h1>
        <p className="mt-2 text-sm text-slate-400">
          Sign in as {preferredRole === 'professor' ? 'Professor' : 'Student'} to enter your workspace.
        </p>

        <form onSubmit={handleLogin} className="mt-6 space-y-4">
          <input
            name="username"
            value={credentials.username}
            onChange={handleChange}
            placeholder="Username or email"
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400"
            required
          />
          <input
            type="password"
            name="password"
            value={credentials.password}
            onChange={handleChange}
            placeholder="Password"
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400"
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

        <p className="mt-5 text-sm text-slate-400">
          Need an account?{' '}
          <Link to={`/register?role=${preferredRole}`} className="text-cyan-300 hover:text-cyan-200 font-semibold">
            Register here
          </Link>
        </p>
      </div>
    </div>
  );
}
