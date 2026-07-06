import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { API_BASE_URL } from './apiClient';

const SECURITY_QUESTIONS = [
  { value: 'first_pet', label: "What was your first pet's name?" },
  { value: 'birth_city', label: 'What city were you born in?' },
  { value: 'first_school', label: 'What was the name of your first school?' },
];

function readPreferredRole(search) {
  const params = new URLSearchParams(search || '');
  const role = String(params.get('role') || '').toLowerCase();
  return role === 'professor' ? 'professor' : 'student';
}

export default function Register() {
  const location = useLocation();
  const navigate = useNavigate();
  const initialRole = useMemo(() => readPreferredRole(location.search), [location.search]);

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    username: '',
    email: '',
    password: '',
    role: initialRole,
    securityQuestion: SECURITY_QUESTIONS[0].value,
    securityAnswer: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/register/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: formData.username,
          email: formData.email,
          password: formData.password,
          first_name: formData.firstName,
          last_name: formData.lastName,
          role: formData.role,
          security_question: formData.role === 'student' ? formData.securityQuestion : undefined,
          security_answer: formData.role === 'student' ? formData.securityAnswer : undefined,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to create account.');
      }

      navigate(`/login?role=${formData.role}`, { replace: true });
    } catch (registerError) {
      setError(registerError.message || 'Unable to create account.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-10 flex items-center justify-center">
      <div className="w-full max-w-xl rounded-3xl border border-slate-800 bg-slate-900/90 p-8 shadow-2xl">
        <p className="text-xs uppercase tracking-[0.35em] text-cyan-300">ClassPulse Identity Hub</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">Create account</h1>
        <p className="mt-2 text-sm text-slate-400">Register as student or professor and enter the appropriate portal instantly.</p>

        <div className="mt-6 rounded-xl border border-slate-700 bg-slate-950 p-1 grid grid-cols-2 gap-1">
          <button
            type="button"
            onClick={() => setFormData((prev) => ({ ...prev, role: 'student' }))}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition-all ${formData.role === 'student' ? 'bg-cyan-500 text-slate-950' : 'text-slate-300 hover:text-white'}`}
          >
            Student
          </button>
          <button
            type="button"
            onClick={() => setFormData((prev) => ({ ...prev, role: 'professor' }))}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition-all ${formData.role === 'professor' ? 'bg-cyan-500 text-slate-950' : 'text-slate-300 hover:text-white'}`}
          >
            Professor
          </button>
        </div>

        <form onSubmit={handleRegister} className="mt-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <input
              name="firstName"
              value={formData.firstName}
              onChange={handleChange}
              placeholder="First name"
              className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400"
              required
            />
            <input
              name="lastName"
              value={formData.lastName}
              onChange={handleChange}
              placeholder="Last name"
              className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400"
              required
            />
          </div>

          <input
            name="username"
            value={formData.username}
            onChange={handleChange}
            placeholder="Username"
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400"
            required
          />

          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            placeholder="Email"
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400"
            required
          />

          <input
            type="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            placeholder="Password"
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400"
            required
          />

          {formData.role === 'student' ? (
            <>
              <label className="block text-sm text-slate-300">
                Security question
                <select
                  name="securityQuestion"
                  value={formData.securityQuestion}
                  onChange={handleChange}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400"
                  required
                >
                  {SECURITY_QUESTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>

              <input
                type="text"
                name="securityAnswer"
                value={formData.securityAnswer}
                onChange={handleChange}
                placeholder="Security answer"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400"
                required
              />
            </>
          ) : null}

          {error ? <p className="text-sm text-rose-300">{error}</p> : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Creating account...' : `Register as ${formData.role === 'professor' ? 'Professor' : 'Student'}`}
          </button>
        </form>

        <p className="mt-5 text-sm text-slate-400">
          Already have an account?{' '}
          <Link to={`/login?role=${formData.role}`} className="text-cyan-300 hover:text-cyan-200 font-semibold">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
