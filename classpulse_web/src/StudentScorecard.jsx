import { useEffect, useMemo, useRef, useState } from 'react';

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
  const pollingRef = useRef(null);
  const percentage = Math.round((score / totalPoints) * 100) || 0;

  useEffect(() => {
    if (!quizId) {
      setSharedAnalytics(null);
      return undefined;
    }

    let isMounted = true;
    const fetchSharedAnalytics = async () => {
      try {
        const response = await fetch(`http://127.0.0.1:8000/api/quizzes/${quizId}/analytics/`);
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
  }, [quizId]);

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

      <h3 className="text-xl font-bold text-slate-800">Submission Receipt Confirmed</h3>
      <p className="text-xs text-slate-500 font-mono uppercase tracking-wider font-bold mt-0.5">Module 2: Client Scorecard</p>
      
      <div className="my-6 border-y-2 border-slate-100 py-4 text-left space-y-2 text-sm font-medium text-slate-700">
        <p>🏫 <span className="text-slate-400">Quiz Context:</span> <span className="text-slate-900 font-bold">{quizTitle || 'Default Sandbox Quiz'}</span></p>
        <p>👤 <span className="text-slate-400">Student Identity:</span> <span className="text-slate-900 font-bold">{studentName || 'Anonymous Identity'}</span></p>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 mb-4">
        <span className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Automated Grade Matrix</span>
        <div className="text-4xl font-black text-slate-800 tracking-tight">
          {score} <span className="text-xl text-slate-400 font-normal">/ {totalPoints} Pts</span>
        </div>
        <div className={`mt-2 text-xs font-mono font-bold inline-block px-2.5 py-0.5 rounded-full border ${
          percentage >= 75 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'
        }`}>
          Performance Index: {percentage}%
        </div>
      </div>

      <button onClick={onResetMock} className="text-xs font-bold text-slate-500 hover:text-indigo-600 underline tracking-wide font-mono uppercase block mx-auto">
        🔄 Simulate New Student Loop
      </button>

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