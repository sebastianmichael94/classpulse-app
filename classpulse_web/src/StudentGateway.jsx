import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate, useParams } from 'react-router-dom';
import { API_BASE_URL, readAuthSession } from './apiClient';

function extractPinSeed(identityValue) {
  if (!identityValue) {
    return '';
  }

  const digitsOnly = String(identityValue).replace(/\D/g, '');
  if (digitsOnly.length >= 4) {
    return digitsOnly.slice(-4);
  }

  return digitsOnly;
}

function sanitizePin(rawValue) {
  return String(rawValue || '').replace(/\D/g, '').slice(0, 4);
}

export default function StudentGateway({ onQuizLoaded }) {
  const navigate = useNavigate();
  const { id } = useParams();
  const authSession = readAuthSession();
  const profileName = String(
    authSession?.user?.name
    || authSession?.user?.full_name
    || [authSession?.user?.first_name, authSession?.user?.last_name].filter(Boolean).join(' ')
    || authSession?.user?.username
    || ''
  ).trim();
  const [accessCode, setAccessCode] = useState('');
  const [studentName, setStudentName] = useState(profileName);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasAutoJoined, setHasAutoJoined] = useState(false);

  useEffect(() => {
    if (id) {
      setAccessCode(extractPinSeed(id));
    }
  }, [id]);

  useEffect(() => {
    if (profileName) {
      setStudentName(profileName);
    }
  }, [profileName]);

  const handleUnlock = async (event, options = {}) => {
    if (event?.preventDefault) {
      event.preventDefault();
    }

    const normalizedPin = sanitizePin(options.accessCode ?? accessCode);
    const normalizedName = String(options.studentName ?? studentName).trim();

    if (normalizedPin.length !== 4) {
      setError('Enter a valid 4-digit access PIN.');
      return;
    }

    if (!normalizedName) {
      setError('Enter your name to continue.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await axios.post(`${API_BASE_URL}/api/quizzes/unlock/`, {
        access_code: normalizedPin,
      });

      if (response?.data) {
        const loadResult = onQuizLoaded?.({ quiz: response.data, studentName: normalizedName });
        if (loadResult?.alreadySubmitted) {
          navigate('/scorecard');
          return;
        }
        navigate(`/player/${response.data.id}`);
      }
    } catch (err) {
      if (err.response?.status === 404) {
        setError('That access code is invalid.');
      } else if (err.response?.status === 403) {
        setError(String(err.response?.data?.error || 'This quiz session is not available right now.'));
      } else {
        setError('We could not unlock the quiz. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const normalizedPin = sanitizePin(accessCode);
    if (!id || !profileName || normalizedPin.length !== 4 || isLoading || hasAutoJoined) {
      return;
    }

    setHasAutoJoined(true);
    handleUnlock(null, {
      accessCode: normalizedPin,
      studentName: profileName,
    }).catch(() => {
      setHasAutoJoined(false);
    });
  }, [id, profileName, accessCode, isLoading, hasAutoJoined]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-3xl overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/90 shadow-2xl">
        <div className="border-b border-slate-800 bg-[#0f172a] px-8 py-6">
          <p className="text-sm uppercase tracking-[0.35em] text-cyan-300">ClassPulse Student Gateway</p>
          <h1 className="mt-3 text-3xl font-semibold text-white">Student Examination Gateway</h1>
          <p className="mt-2 text-sm text-slate-400">Authenticate with your name and the instructor PIN to enter a secured live assessment session.</p>
        </div>

        <div className="grid gap-8 p-8 md:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-2xl border border-slate-800 bg-black/20 p-6">
            <div className="rounded-2xl border border-cyan-500/30 bg-cyan-950/30 p-5 text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300">Session Ready</p>
              <p className="mt-2 text-sm text-slate-300">The exam will open instantly after your PIN is verified.</p>
              <div className="mt-5 rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-2xl font-semibold tracking-[0.35em] text-cyan-200">
                {accessCode || '0000'}
              </div>
            </div>
            <div className="mt-6 space-y-3 text-sm text-slate-400">
              <p>• {profileName ? 'Your signed-in student profile will be used automatically.' : 'Enter your name so your submission is attributed correctly.'}</p>
              <p>• Use the four-digit PIN supplied by your instructor.</p>
              <p>• If the session is not active yet, you will see a clear message and can retry when it starts.</p>
            </div>
          </div>

          <form onSubmit={handleUnlock} className="space-y-4">
            {profileName ? (
              <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 px-4 py-3 text-sm text-cyan-100">
                Joining as <span className="font-semibold">{profileName}</span>
              </div>
            ) : (
              <label className="block text-sm font-medium text-slate-300">
                Student Name
                <input
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  placeholder="Enter your name"
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400"
                  required
                />
              </label>
            )}

            <label className="block text-sm font-medium text-slate-300">
              Access Code
              <input
                value={accessCode}
                onChange={(e) => setAccessCode(sanitizePin(e.target.value))}
                inputMode="numeric"
                pattern="[0-9]{4}"
                maxLength="4"
                placeholder="0000"
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400"
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
