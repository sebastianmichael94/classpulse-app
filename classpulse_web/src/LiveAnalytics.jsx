import React, { useEffect, useMemo, useRef, useState } from 'react';

const POLL_INTERVAL_MS = 4000;

function normalizeWordCloud(input) {
  if (Array.isArray(input)) {
    return input
      .map((item) => ({
        word: String(item?.word || '').trim(),
        count: Number(item?.count || 0),
      }))
      .filter((item) => item.word && item.count > 0);
  }

  if (input && typeof input === 'object') {
    return Object.entries(input)
      .map(([word, count]) => ({ word: String(word || '').trim(), count: Number(count || 0) }))
      .filter((item) => item.word && item.count > 0);
  }

  return [];
}

function toSummaryArray(value, fallbackMessage) {
  if (Array.isArray(value) && value.length > 0) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    return [value];
  }

  return [fallbackMessage];
}

function getWordTierClasses(weight) {
  if (weight >= 0.8) {
    return 'text-3xl font-extrabold text-emerald-400';
  }

  if (weight >= 0.6) {
    return 'text-2xl font-bold text-emerald-400/90';
  }

  if (weight >= 0.4) {
    return 'text-xl font-semibold text-slate-300';
  }

  if (weight >= 0.2) {
    return 'text-lg font-medium text-slate-400';
  }

  return 'text-sm font-medium text-slate-500';
}

function formatConfidenceIndex(value) {
  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) {
    return '0%';
  }

  const normalized = numericValue <= 1 ? numericValue * 100 : numericValue;
  return `${Math.max(0, Math.min(100, Math.round(normalized)))}%`;
}

export default function LiveAnalytics({ quizId }) {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const pollingTimerRef = useRef(null);
  const isFetchingRef = useRef(false);

  useEffect(() => {
    let isMounted = true;
    const abortController = new AbortController();

    const clearPollingClock = () => {
      if (pollingTimerRef.current) {
        window.clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
    };

    if (!quizId) {
      setAnalytics(null);
      setLastUpdated(null);
      setError('');
      clearPollingClock();
      return undefined;
    }

    const fetchAnalytics = async () => {
      if (isFetchingRef.current) {
        return;
      }

      isFetchingRef.current = true;
      if (!analytics) {
        setLoading(true);
      }

      try {
        const response = await fetch(`http://127.0.0.1:8000/api/quizzes/${quizId}/analytics/`, {
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error('Unable to load analytics');
        }

        const payload = await response.json();
        if (isMounted) {
          setAnalytics(payload);
          setLastUpdated(new Date().toISOString());
          setError('');
        }
      } catch (err) {
        if (err?.name !== 'AbortError' && isMounted) {
          setError(err.message || 'Unable to load analytics');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
        isFetchingRef.current = false;
      }
    };

    clearPollingClock();
    fetchAnalytics();
    pollingTimerRef.current = window.setInterval(fetchAnalytics, POLL_INTERVAL_MS);

    return () => {
      isMounted = false;
      abortController.abort();
      clearPollingClock();
      isFetchingRef.current = false;
    };
  }, [quizId]);

  const wordCloud = useMemo(() => {
    return normalizeWordCloud(analytics?.word_cloud);
  }, [analytics]);

  const wordCloudWithWeights = useMemo(() => {
    if (!wordCloud.length) {
      return [];
    }

    const counts = wordCloud.map((item) => item.count);
    const maxCount = Math.max(...counts);
    const minCount = Math.min(...counts);
    const spread = Math.max(1, maxCount - minCount);

    return wordCloud
      .map((item) => {
        const weight = (item.count - minCount) / spread;
        return {
          ...item,
          weight,
          tierClasses: getWordTierClasses(weight),
        };
      })
      .sort((a, b) => b.count - a.count);
  }, [wordCloud]);

  const essaySummary = analytics?.essay_summary || {};
  const misconceptions = toSummaryArray(
    essaySummary.common_misconceptions ?? analytics?.common_misconceptions,
    'No recurring misconception pattern detected yet.',
  );
  const themes = toSummaryArray(
    essaySummary.key_themes_detected ?? analytics?.key_themes_detected,
    'Themes will appear as written responses accumulate.',
  );
  const classConfidenceIndex =
    essaySummary.class_confidence_index ?? analytics?.class_confidence_index ?? 0;

  return (
    <div className="w-full rounded-3xl border border-slate-800 bg-slate-900/85 p-6 text-slate-100 shadow-[0_25px_65px_rgba(2,6,23,0.65)] md:p-8">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.34em] text-violet-300">Professor Monitor</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Dr. Reshma&apos;s Real-Time Reporting Canvas</h2>
          <p className="mt-1 text-xs text-slate-400">Polling every 4 seconds for live cohort response intelligence.</p>
        </div>

        <div className="rounded-2xl border border-violet-400/30 bg-violet-500/10 px-4 py-3 text-right shadow-[0_0_30px_rgba(167,139,250,0.18)]">
          <p className="text-[10px] uppercase tracking-[0.25em] text-violet-300">Live Submissions</p>
          <p className="mt-1 text-2xl font-bold text-white">{analytics?.total_submissions ?? 0}</p>
          <p className="text-xs text-slate-400">{lastUpdated ? `Updated ${new Date(lastUpdated).toLocaleTimeString()}` : 'Awaiting data pulse'}</p>
        </div>
      </div>

      {loading && !analytics ? (
        <p className="text-sm text-slate-400">Connecting to analytics stream...</p>
      ) : null}

      {error ? (
        <div className="mb-5 rounded-xl border border-rose-400/35 bg-rose-900/30 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      {analytics ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">AI Word Cloud Engine</span>
              <span className="text-xs text-slate-400">Avg score {Number(analytics.average_score || 0).toFixed(1)}</span>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                {wordCloudWithWeights.length ? wordCloudWithWeights.map((item) => {
                  return (
                    <span
                      key={`${item.word}-${item.count}`}
                      className={`leading-none transition-colors ${item.tierClasses}`}
                      title={`${item.word}: ${item.count}`}
                    >
                      {item.word}
                    </span>
                  );
                }) : <p className="text-sm text-slate-500">No tokenized terms yet. Word cloud will render as short-answer responses arrive.</p>}
              </div>

              <div className="mt-5 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Average</p>
                  <p className="mt-1 text-lg font-semibold text-slate-100">{Number(analytics.average_score || 0).toFixed(1)}</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Max</p>
                  <p className="mt-1 text-lg font-semibold text-emerald-400">{Number(analytics.max_score || 0).toFixed(1)}</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Min</p>
                  <p className="mt-1 text-lg font-semibold text-amber-300">{Number(analytics.min_score || 0).toFixed(1)}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-violet-400/25 bg-slate-950/60 p-5 shadow-[0_0_30px_rgba(139,92,246,0.18)]">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-violet-300">AI Executive Summary Report</p>
              <h3 className="mt-2 text-xl font-semibold text-white">Essay Aggregator Intelligence</h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">Structured synthesis of writing patterns from live submissions, optimized for rapid instructional action.</p>
            </div>

            <div className="mt-5 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Class Confidence Index</p>
              <p className="mt-2 text-3xl font-bold text-violet-200">{formatConfidenceIndex(classConfidenceIndex)}</p>
            </div>

            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Common Misconceptions</p>
              <ul className="mt-2 space-y-2 text-sm text-slate-200">
                {misconceptions.map((item) => (
                  <li key={item} className="rounded-xl border border-violet-500/20 bg-violet-500/10 p-3">{item}</li>
                ))}
              </ul>
            </div>

            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Key Themes Detected</p>
              <ul className="mt-2 space-y-2 text-sm text-slate-200">
                {themes.map((item) => (
                  <li key={item} className="rounded-xl border border-slate-800 bg-slate-900/85 p-3">{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}