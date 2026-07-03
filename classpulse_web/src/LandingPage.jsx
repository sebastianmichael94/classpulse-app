import React from 'react';
import { Link } from 'react-router-dom';

function AccessDoor({ to, title, subtitle, accentClass, pulseClass }) {
  return (
    <Link
      to={to}
      className={`group relative overflow-hidden rounded-3xl border border-slate-700/80 bg-slate-900/70 p-7 transition duration-300 hover:-translate-y-1 hover:border-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${pulseClass}`}
    >
      <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full blur-3xl opacity-70 transition group-hover:opacity-100" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.08),transparent_35%),linear-gradient(160deg,rgba(15,23,42,0.2),rgba(2,6,23,0.8))]" />

      <div className="relative z-10">
        <p className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-400">Pathway</p>
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
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(8,145,178,0.22),transparent_35%),radial-gradient(circle_at_85%_15%,rgba(14,116,144,0.16),transparent_32%),linear-gradient(180deg,#020617_0%,#0b1120_50%,#030712_100%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(to_right,rgba(148,163,184,0.15)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.15)_1px,transparent_1px)] [background-size:48px_48px]" />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-10 sm:px-6 lg:px-8">
        <header className="rounded-3xl border border-slate-800/90 bg-slate-900/70 p-8 backdrop-blur">
          <p className="text-xs uppercase tracking-[0.38em] text-cyan-300">ClassPulse Executive Studio</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight text-white sm:text-5xl">
            Real-time exam command center for institutions that run precision assessments.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
            Launch controlled examinations, monitor live intelligence, and deliver a seamless student test
            experience across devices with an elevated enterprise-grade interface.
          </p>
        </header>

        <main className="mt-8 grid flex-1 gap-5 md:grid-cols-2">
          <AccessDoor
            to="/login?role=professor"
            title="🔬 Professor Console"
            subtitle="Sign in to design quizzes, manage question banks, and launch real-time AI analytics command screens."
            accentClass="text-cyan-200"
            pulseClass="hover:shadow-[0_0_40px_rgba(34,211,238,0.25)]"
          />
          <AccessDoor
            to="/login?role=student"
            title="🎓 Student Portal"
            subtitle="Sign in to access your gradebook, review quiz history, and enter a live exam PIN with session continuity."
            accentClass="text-emerald-200"
            pulseClass="hover:shadow-[0_0_40px_rgba(16,185,129,0.22)]"
          />
        </main>
      </div>
    </div>
  );
}
