import { useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE_URL, authFetch } from './apiClient';

const POLL_INTERVAL_MS = 4000;

function normalizeWordCloud(input) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((item) => ({ word: String(item?.word || '').trim(), count: Number(item?.count || 0) }))
    .filter((item) => item.word && item.count > 0);
}

function getWordTierClasses(weight) {
  if (weight >= 0.8) return 'text-3xl font-extrabold text-cyan-400';
  if (weight >= 0.6) return 'text-2xl font-bold text-cyan-300';
  if (weight >= 0.4) return 'text-xl font-semibold text-cyan-200';
  if (weight >= 0.2) return 'text-base font-medium text-slate-300';
  return 'text-sm font-medium text-slate-500';
}

export default function StudentScorecard({ score, totalPoints, studentName, quizTitle, quizId, onResetMock }) {
  const [sharedAnalytics, setSharedAnalytics] = useState(null);
  const [defaultQuestionId, setDefaultQuestionId] = useState(null);
  const pollingRef = useRef(null);

  useEffect(() => {
    if (!quizId) {
      setDefaultQuestionId(null);
      return undefined;
    }

    let isMounted = true;
    const loadQuestionContext = async () => {
      try {
        const response = await authFetch(`${API_BASE_URL}/api/quizzes/${quizId}/`);
        if (!response.ok) {
          return;
        }

        const payload = await response.json();
        const firstQuestionId = Array.isArray(payload?.questions) ? payload.questions[0]?.id : null;
        if (isMounted) {
          setDefaultQuestionId(firstQuestionId || null);
        }
      } catch {
        if (isMounted) {
          setDefaultQuestionId(null);
        }
      }
    };

    loadQuestionContext();
    return () => {
      isMounted = false;
    };
  }, [quizId]);

  useEffect(() => {
    if (!quizId || !defaultQuestionId) {
      setSharedAnalytics(null);
      return undefined;
    }

    let isMounted = true;
    const fetchSharedAnalytics = async () => {
      try {
        const response = await authFetch(
          `${API_BASE_URL}/api/quizzes/${quizId}/analytics/?question_id=${encodeURIComponent(defaultQuestionId)}`
        );
        if (!response.ok) {
          return;
        }

        const payload = await response.json();
        if (isMounted) {
          setSharedAnalytics(payload?.is_shared_with_students ? payload : null);
        }
      } catch {
        if (isMounted) {
          setSharedAnalytics(null);
        }
      }
    };

    fetchSharedAnalytics();
    pollingRef.current = window.setInterval(fetchSharedAnalytics, POLL_INTERVAL_MS);

    return () => {
      isMounted = false;
      if (pollingRef.current) {
        window.clearInterval(pollingRef.current);
      }
    };
  }, [quizId, defaultQuestionId]);

  const sharedWordCloud = useMemo(() => {
    const normalized = normalizeWordCloud(sharedAnalytics?.word_cloud);
    if (!normalized.length) {
      return [];
    }

    const counts = normalized.map((item) => item.count);
    const max = Math.max(...counts);
    const min = Math.min(...counts);
    const spread = Math.max(1, max - min);

    return normalized.map((item) => ({
      ...item,
      tierClasses: getWordTierClasses((item.count - min) / spread),
    }));
  }, [sharedAnalytics]);

  const sharedGists = Array.isArray(sharedAnalytics?.most_popular_gists) ? sharedAnalytics.most_popular_gists.slice(0, 5) : [];

  return (
    <div className="w-full max-w-md bg-white border-2 border-slate-300 rounded-xl p-6 shadow-md text-slate-900 text-center">
      <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3 border border-emerald-300">
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
      </div>

      <h3 className="text-2xl font-bold text-slate-800">Submission Confirmed</h3>
      <p className="mt-2 text-sm text-slate-500">Thank you! Your responses have been successfully sent to the instructor.</p>
      
      <div className="my-6 border-y-2 border-slate-100 py-4 text-left space-y-2 text-sm font-medium text-slate-700">
        <p><span className="text-slate-400">Quiz:</span> <span className="text-slate-900 font-bold">{quizTitle || 'Default Sandbox Quiz'}</span></p>
        <p><span className="text-slate-400">Name:</span> <span className="text-slate-900 font-bold">{studentName || 'Anonymous Identity'}</span></p>
      </div>

      {sharedAnalytics ? (
        <div className="mt-6 rounded-xl border border-slate-700 bg-slate-950 p-4 text-left">
          <p className="text-[10px] uppercase tracking-[0.25em] text-cyan-300">Shared Analytics Canvas</p>
          <h4 className="mt-2 text-base font-semibold text-white">Live instructor insights</h4>

          <div className="mt-3 rounded-xl border border-violet-500/30 bg-violet-500/10 p-3">
            <p className="text-xs font-semibold text-violet-200">✨ AI Real-Time Response Gist</p>
            <ul className="mt-2 space-y-1 text-xs text-slate-200">
              {sharedGists.map((gist, index) => (
                <li key={`${gist}-${index}`}>• {gist}</li>
              ))}
            </ul>
          </div>

          <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900/80 p-3">
            <p className="text-xs font-semibold text-slate-300">Answer Word Cloud</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {sharedWordCloud.length ? sharedWordCloud.map((item) => (
                <span key={`${item.word}-${item.count}`} className={item.tierClasses}>{item.word}</span>
              )) : <span className="text-xs text-slate-500">Waiting for short-answer frequency data.</span>}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}