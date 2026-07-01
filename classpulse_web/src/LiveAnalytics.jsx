import React, { useEffect, useState } from 'react';

export default function LiveAnalytics({ quizId }) {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!quizId) {
      setAnalytics(null);
      return undefined;
    }

    let active = true;

    const fetchAnalytics = async () => {
      setLoading(true);
      try {
        const response = await fetch(`http://127.0.0.1:8000/api/quizzes/${quizId}/analytics/`);
        if (!response.ok) {
          throw new Error('Unable to load analytics');
        }
        const payload = await response.json();
        if (active) {
          setAnalytics(payload);
          setError('');
        }
      } catch (err) {
        if (active) {
          setError(err.message || 'Unable to load analytics');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    fetchAnalytics();
    const intervalId = window.setInterval(fetchAnalytics, 5000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [quizId]);

  const wordCloud = analytics?.word_cloud || [];
  const totalWeight = wordCloud.reduce((sum, item) => sum + (item.count || 0), 0) || 1;
  const misconceptions = analytics?.common_misconceptions || [];
  const themes = analytics?.key_themes_detected || [];

  return (
    <div className="w-full max-w-5xl bg-white border-2 border-slate-300 rounded-xl p-6 md:p-8 shadow-md text-slate-900">
      <div className="mb-6 border-b-2 border-slate-200 pb-3 flex flex-wrap justify-between items-end gap-2">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Module 3: Live Response Analytics Dashboard</h2>
          <p className="text-xs text-slate-500 font-mono font-bold uppercase tracking-wider">Professor Lecture Telemetry Stream</p>
        </div>
        <div className="bg-indigo-50 border border-indigo-200 px-4 py-1.5 rounded-lg text-center">
          <span className="block text-[9px] font-mono font-bold text-indigo-500 uppercase tracking-wider">Submissions Link Stream</span>
          <span className="text-base font-black text-indigo-700 font-mono">{analytics?.total_submissions ?? 0} Active</span>
        </div>
      </div>

      {loading && !analytics ? (
        <p className="text-sm text-slate-500">Refreshing the live telemetry feed…</p>
      ) : null}

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      {analytics ? (
        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Live Aggregation Ratios</span>
              <span className="text-xs text-slate-500">Avg score: {Number(analytics.average_score || 0).toFixed(1)}</span>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap gap-3">
                {wordCloud.length ? wordCloud.map((item) => {
                  const ratio = (item.count || 0) / totalWeight;
                  return (
                    <span
                      key={item.word}
                      className="rounded-full bg-indigo-600 px-3 py-1 font-semibold text-white shadow-sm"
                      style={{ fontSize: `${0.9 + ratio * 1.2}rem` }}
                    >
                      {item.word}
                    </span>
                  );
                }) : <p className="text-sm text-slate-500">No word-cloud data yet.</p>}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 space-y-4">
            <div>
              <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">AI Executive Report</p>
              <h3 className="mt-1 text-lg font-semibold text-slate-800">Dr. Reshma&apos;s response synthesis</h3>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Common misconceptions</p>
              <ul className="mt-2 space-y-2 text-sm text-slate-700">
                {misconceptions.map((item) => (
                  <li key={item} className="rounded-lg border border-slate-200 bg-white p-2">{item}</li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Key themes detected</p>
              <ul className="mt-2 space-y-2 text-sm text-slate-700">
                {themes.map((item) => (
                  <li key={item} className="rounded-lg border border-slate-200 bg-white p-2">{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}