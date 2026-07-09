import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, GraduationCap } from 'lucide-react';
import { Button } from './components/ui/button';
import { Card, CardContent } from './components/ui/card';
import { Input } from './components/ui/input';

function AccessDoor({ to, title, subtitle, accentClass, pulseClass }) {
  return (
    <Link
      to={to}
      className={`group relative overflow-hidden rounded-3xl border border-border/80 bg-card/90 p-7 shadow-lg transition duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${pulseClass}`}
    >
      <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-cyan-500/15 blur-3xl opacity-70 transition group-hover:opacity-100" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-background/30 to-background/0 dark:from-slate-900/70 dark:to-slate-950/90" />

      <div className="relative z-10">
        <h2 className={`mt-3 text-2xl font-semibold text-foreground ${accentClass}`}>{title}</h2>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">{subtitle}</p>

        <Button variant="outline" className="mt-6 inline-flex items-center gap-2">
          Enter <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
        </Button>
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
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_12%,rgba(14,165,233,0.18),transparent_36%),radial-gradient(circle_at_85%_10%,rgba(16,185,129,0.14),transparent_30%)] dark:bg-[radial-gradient(circle_at_10%_14%,rgba(8,145,178,0.25),transparent_35%),radial-gradient(circle_at_85%_15%,rgba(14,116,144,0.2),transparent_32%),linear-gradient(180deg,#020617_0%,#0b1120_50%,#030712_100%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-20 dark:opacity-25 [background-image:linear-gradient(to_right,rgba(148,163,184,0.15)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.15)_1px,transparent_1px)] [background-size:48px_48px]" />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-10 sm:px-6 lg:px-8">
        <header className="pt-12 text-center sm:pt-16">
          <h1 className="mx-auto flex max-w-5xl items-center justify-center gap-3 bg-gradient-to-r from-cyan-500 via-blue-500 to-emerald-500 bg-clip-text text-5xl font-extrabold leading-tight text-transparent sm:text-6xl lg:text-7xl">
            Welcome to Class Pulse <GraduationCap className="size-12 text-cyan-500 sm:size-14" />
          </h1>
          <p className="mt-5 text-lg text-slate-700 dark:text-muted-foreground">
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

          <Card className="group relative overflow-hidden rounded-3xl border border-border/80 bg-card/90 p-7 shadow-lg transition duration-300 hover:-translate-y-1 hover:border-emerald-500/40 hover:shadow-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
            <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-emerald-500/15 blur-3xl opacity-70 transition group-hover:opacity-100" />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-background/30 to-background/0 dark:from-slate-900/70 dark:to-slate-950/90" />

            <CardContent className="relative z-10 p-0">
              <h2 className="mt-3 text-2xl font-semibold text-emerald-700 dark:text-emerald-300">Student Join Area</h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">Enter your class PIN to join and submit answers.</p>

              <form onSubmit={handleStudentJoin} className="mt-6 space-y-3">
                <Input
                  type="text"
                  value={accessCode}
                  onChange={handleAccessCodeChange}
                  inputMode="numeric"
                  pattern="[0-9]{4}"
                  maxLength={4}
                  placeholder="Enter 4-digit PIN"
                  className="h-12 border-input bg-background/95 text-base font-semibold tracking-[0.18em]"
                  required
                />

                <Button
                  type="submit"
                  disabled={accessCode.length !== 4}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 text-sm font-semibold"
                >
                  Join Quiz <ArrowRight className="size-4" />
                </Button>
              </form>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}
