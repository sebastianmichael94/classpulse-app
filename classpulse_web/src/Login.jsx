import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL, persistAuthSession } from './apiClient';
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Input } from './components/ui/input';

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
      setError('Wrong email or password.');
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
    <div className="min-h-screen px-4 py-10 flex items-center justify-center bg-[radial-gradient(circle_at_15%_15%,hsl(var(--primary)/0.16),transparent_38%)]">
      <Card className="w-full max-w-5xl overflow-hidden border-border/80 bg-card/95 shadow-2xl backdrop-blur">
        <div className="grid md:grid-cols-[1fr_1.15fr]">
          <div className="hidden md:flex flex-col justify-between border-r border-border/60 bg-gradient-to-br from-cyan-500/15 via-transparent to-emerald-500/10 p-8">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-primary">ClassPulse Access</p>
              <h2 className="mt-4 text-3xl font-bold text-foreground">Teaching, simplified</h2>
              <p className="mt-3 text-sm text-muted-foreground">Launch quizzes, monitor understanding in real time, and adapt your class instantly.</p>
            </div>
            <p className="text-xs text-muted-foreground">Secure instructor sign-in</p>
          </div>

          <div className="p-1">
            <CardHeader>
              <p className="text-xs uppercase tracking-[0.35em] text-primary md:hidden">ClassPulse Access</p>
              <CardTitle className="mt-2 text-3xl">Welcome back</CardTitle>
              <CardDescription>Instructor sign in.</CardDescription>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleLogin} className="space-y-4">
                <Input
                type="email"
                name="email"
                value={credentials.email}
                onChange={handleChange}
                placeholder="Email"
                className="h-12"
                required
                />
                <Input
                type="password"
                name="password"
                value={credentials.password}
                onChange={handleChange}
                placeholder="Password"
                className="h-12"
                required
                />

                {error ? <p className="text-sm text-destructive">{error}</p> : null}

                <Button type="submit" disabled={isSubmitting} className="h-12 w-full text-sm font-semibold">
                  {isSubmitting ? 'Signing in...' : 'Sign In'}
                </Button>
              </form>
            </CardContent>
          </div>
        </div>
      </Card>
    </div>
  );
}
