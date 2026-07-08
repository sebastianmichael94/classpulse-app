import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

function AccessDoor({ to, title, subtitle, accentClass, pulseClass }) {
  return (
    <Link
      to={to}
      className={`group relative overflow-hidden rounded-3xl border border-slate-700/80 bg-slate-900/70 p-7 transition duration-300 hover:-translate-y-1 hover:border-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${pulseClass}`}
    >
      <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full blur-3xl opacity-70 transition group-hover:opacity-100" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.08),transparent_35%),linear-gradient(160deg,rgba(15,23,42,0.2),rgba(2,6,23,0.8))]" />

      <div className="relative z-10">
        <h2 className={`mt-3 text-2xl font-semibold text-white ${accentClass}`}>{title}</h2>
        <p className="mt-3 text-sm leading-7 text-slate-300">{subtitle}</p>

        <div className="mt-6 inline-flex items-center gap-2 rounded-xl border border-slate-600/80 bg-slate-950/80 px-4 py-2 text-sm font-medium text-slate-100">
          Enter
          <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
        </div>
      </div>
    </Link>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();
  const [accessCode, setAccessCode] = useState('');

  const handleAccessCodeChange = (event) => {
    setAccessCode(String(event.target.value || '').replace(/\D/g, '').slice(0, 4));
  };

  const handleStudentJoin = (event) => {
    event.preventDefault();
    const normalizedCode = String(accessCode || '').trim();
    if (normalizedCode.length !== 4) {
      return;
    }

    navigate(`/quiz/${normalizedCode}`);
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(8,145,178,0.22),transparent_35%),radial-gradient(circle_at_85%_15%,rgba(14,116,144,0.16),transparent_32%),linear-gradient(180deg,#020617_0%,#0b1120_50%,#030712_100%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(to_right,rgba(148,163,184,0.15)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.15)_1px,transparent_1px)] [background-size:48px_48px]" />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-10 sm:px-6 lg:px-8">
        <header className="pt-12 text-center sm:pt-16">
          <h1 className="mx-auto max-w-5xl bg-gradient-to-r from-blue-400 via-indigo-400 to-cyan-400 bg-clip-text text-5xl font-extrabold leading-tight text-transparent sm:text-6xl lg:text-7xl">
            Welcome to Class Pulse 🎓
          </h1>
          <p className="mt-5 text-lg text-slate-400">
            Live quizzes with quick class feedback.
          </p>
        </header>

        <main className="mt-8 grid flex-1 gap-5 md:grid-cols-2">
          <AccessDoor
            to="/login?role=professor"
            title="Instructor Portal"
            subtitle="Sign in to create quizzes and view class results."
            accentClass="text-cyan-200"
            pulseClass="hover:shadow-[0_0_40px_rgba(34,211,238,0.25)]"
          />

          <section className="group relative overflow-hidden rounded-3xl border border-slate-700/80 bg-slate-900/70 p-7 transition duration-300 hover:-translate-y-1 hover:border-slate-500 hover:shadow-[0_0_40px_rgba(16,185,129,0.22)] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
            <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full blur-3xl opacity-70 transition group-hover:opacity-100" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.08),transparent_35%),linear-gradient(160deg,rgba(15,23,42,0.2),rgba(2,6,23,0.8))]" />

            <div className="relative z-10">
              <h2 className="mt-3 text-2xl font-semibold text-emerald-200">Student Join Area</h2>
              <p className="mt-3 text-sm leading-7 text-slate-300">Enter your class PIN to join and submit answers.</p>

              <form onSubmit={handleStudentJoin} className="mt-6 space-y-3">
                <input
                  type="text"
                  value={accessCode}
                  onChange={handleAccessCodeChange}
                  inputMode="numeric"
                  pattern="[0-9]{4}"
                  maxLength={4}
                  placeholder="Enter 4-digit PIN"
                  className="w-full rounded-xl border border-slate-600/80 bg-slate-950/85 px-4 py-3 text-sm font-medium tracking-[0.18em] text-slate-100 outline-none transition-all placeholder:text-slate-500 focus:border-emerald-400"
                  required
                />

                <button
                  type="submit"
                  disabled={accessCode.length !== 4}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-600/80 bg-slate-950/80 px-4 py-3 text-sm font-medium text-slate-100 transition-all hover:border-emerald-400/60 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Join Quiz
                  <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
                </button>
              </form>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
