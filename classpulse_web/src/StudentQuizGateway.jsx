import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate, useParams } from 'react-router-dom';
import katex from 'katex';
import 'katex/dist/katex.min.css';

function MathText({ value }) {
  if (typeof value !== 'string') return null;

  if (!value.includes('$$')) {
    return <span>{value}</span>;
  }

  const parts = value.split('$$');
  return (
    <span>
      {parts.map((part, index) => {
        if (index % 2 === 1) {
          try {
            return (
              <span
                key={index}
                className="inline-block align-middle mx-1"
                dangerouslySetInnerHTML={{ __html: katex.renderToString(part, { throwOnError: false }) }}
              />
            );
          } catch {
            return <span key={index}>{part}</span>;
          }
        }
        return <span key={index}>{part}</span>;
      })}
    </span>
  );
}

export default function StudentQuizGateway({ onQuizLoaded }) {
  const navigate = useNavigate();
  const { id } = useParams();
  const [accessCode, setAccessCode] = useState('');
  const [studentName, setStudentName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (id) {
      setAccessCode(id);
    }
  }, [id]);

  const handleUnlock = async (event) => {
    event.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await axios.post('http://127.0.0.1:8000/api/quizzes/unlock/', {
        access_code: accessCode,
      });

      if (response?.data) {
        onQuizLoaded?.({ quiz: response.data, studentName });
        navigate(`/player/${response.data.id}`);
      }
    } catch (err) {
      if (err.response?.status === 404) {
        setError('Invalid Code or Quiz Hidden');
      } else {
        setError('Unable to unlock quiz right now.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-3xl rounded-3xl border border-slate-800 bg-slate-900/90 shadow-2xl overflow-hidden">
        <div className="bg-[#0f172a] px-8 py-6 border-b border-slate-800">
          <p className="text-sm uppercase tracking-[0.35em] text-cyan-300">ClassPulse Student Access</p>
          <h1 className="mt-3 text-3xl font-semibold text-white">Enter your quiz access point</h1>
          <p className="mt-2 text-sm text-slate-400">Scan a QR code or type the 4-digit access code to start the exam.</p>
        </div>

        <div className="grid gap-8 p-8 md:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-slate-800 bg-black/20 p-6">
            <div className="w-40 h-40 mx-auto rounded-2xl border-2 border-dashed border-cyan-500/40 bg-cyan-950/30 flex items-center justify-center text-center text-sm font-medium text-cyan-200">
              QR Scan Placeholder
            </div>
            <div className="mt-6 space-y-3 text-sm text-slate-400">
              <p>• Point your camera at the quiz QR code.</p>
              <p>• Or enter the four-digit pin manually below.</p>
            </div>
          </div>

          <form onSubmit={handleUnlock} className="space-y-4">
            <label className="block text-sm font-medium text-slate-300">
              Student Name
              <input
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="Enter your name"
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none ring-0 focus:border-cyan-400"
                required
              />
            </label>

            <label className="block text-sm font-medium text-slate-300">
              Access Code
              <input
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                inputMode="numeric"
                maxLength="4"
                placeholder="0000"
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none ring-0 focus:border-cyan-400"
                required
              />
            </label>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isLoading ? 'Unlocking Quiz...' : 'Start Quiz'}
            </button>

            {error && (
              <div className="rounded-xl border border-rose-500/40 bg-rose-950/60 px-4 py-3 text-sm text-rose-200">
                {error}
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
