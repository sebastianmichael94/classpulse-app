import { useEffect, useMemo, useRef, useState } from 'react';

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
    return 'text-4xl font-extrabold text-cyan-400';
  }

  if (weight >= 0.6) {
    return 'text-3xl font-bold text-cyan-300';
  }

  if (weight >= 0.4) {
    return 'text-2xl font-semibold text-cyan-200';
  }

  if (weight >= 0.2) {
    return 'text-lg font-medium text-slate-300';
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

export default function LiveAnalytics({ quizId, staticMode = false }) {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isRefreshingSummary, setIsRefreshingSummary] = useState(false);
  const [isSharingAnalytics, setIsSharingAnalytics] = useState(false);
  const [isResponsesPanelOpen, setIsResponsesPanelOpen] = useState(false);
  const [expandedRows, setExpandedRows] = useState({});
  const [assistantPrompt, setAssistantPrompt] = useState('');
  const [assistantError, setAssistantError] = useState('');
  const [isSendingPrompt, setIsSendingPrompt] = useState(false);
  const [sharingPromptId, setSharingPromptId] = useState(null);
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

    const fetchAnalytics = async ({ forceRefresh = false } = {}) => {
      if (isFetchingRef.current) {
        return;
      }

      isFetchingRef.current = true;
      if (!analytics) {
        setLoading(true);
      }

      try {
        const endpoint = forceRefresh
          ? `http://127.0.0.1:8000/api/quizzes/${quizId}/analytics/refresh/`
          : `http://127.0.0.1:8000/api/quizzes/${quizId}/analytics/`;
        const response = await fetch(endpoint, {
          method: forceRefresh ? 'POST' : 'GET',
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
    if (!staticMode) {
      pollingTimerRef.current = window.setInterval(fetchAnalytics, POLL_INTERVAL_MS);
    }

    return () => {
      isMounted = false;
      abortController.abort();
      clearPollingClock();
      isFetchingRef.current = false;
    };
  }, [quizId, staticMode]);

  const refreshAiSummary = async () => {
    if (!quizId || isRefreshingSummary) {
      return;
    }

    setIsRefreshingSummary(true);
    try {
      const response = await fetch(`http://127.0.0.1:8000/api/quizzes/${quizId}/analytics/refresh/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Unable to refresh AI summary');
      }

      const payload = await response.json();
      setAnalytics(payload);
      setLastUpdated(new Date().toISOString());
      setError('');
    } catch (err) {
      setError(err.message || 'Unable to refresh AI summary');
    } finally {
      setIsRefreshingSummary(false);
    }
  };

  const toggleShareAnalytics = async () => {
    if (!quizId || isSharingAnalytics) {
      return;
    }

    const nextState = !Boolean(analytics?.is_shared_with_students);
    setIsSharingAnalytics(true);
    try {
      const response = await fetch(`http://127.0.0.1:8000/api/quizzes/${quizId}/share-analytics/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ is_shared_with_students: nextState }),
      });

      if (!response.ok) {
        throw new Error('Unable to update sharing state');
      }

      const payload = await response.json();
      setAnalytics((prev) => ({ ...(prev || {}), is_shared_with_students: payload.is_shared_with_students }));
      setError('');
    } catch (err) {
      setError(err.message || 'Unable to update sharing state');
    } finally {
      setIsSharingAnalytics(false);
    }
  };

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
  const mostPopularGists = toSummaryArray(
    essaySummary.most_popular_gists ?? analytics?.most_popular_gists,
    'Waiting for enough essay responses to build a reliable gist.',
  ).slice(0, 5);
  const individualSubmissions = Array.isArray(analytics?.individual_submissions) ? analytics.individual_submissions : [];
  const promptHistory = Array.isArray(analytics?.custom_prompt_history)
    ? [...analytics.custom_prompt_history].reverse()
    : [];
  const topVotedAnswers = Array.isArray(analytics?.top_voted_answers) ? analytics.top_voted_answers : [];

  const toggleExpandedRow = (submissionId) => {
    setExpandedRows((prev) => ({
      ...prev,
      [submissionId]: !prev[submissionId],
    }));
  };

  const handleSendPrompt = async () => {
    const trimmedPrompt = assistantPrompt.trim();
    if (!quizId || !trimmedPrompt || isSendingPrompt) {
      return;
    }

    setIsSendingPrompt(true);
    setAssistantError('');

    try {
      const response = await fetch('http://127.0.0.1:8000/api/custom-analytics-prompt/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quiz_id: quizId,
          prompt_text: trimmedPrompt,
        }),
      });

      if (!response.ok) {
        throw new Error('Unable to generate AI response at the moment.');
      }

      const payload = await response.json();
      setAnalytics((prev) => ({
        ...(prev || {}),
        custom_prompt_history: [payload, ...(prev?.custom_prompt_history || [])],
      }));
      setAssistantPrompt('');
    } catch (err) {
      setAssistantError(err.message || 'Unable to generate AI response at the moment.');
    } finally {
      setIsSendingPrompt(false);
    }
  };

  const handleSharePromptResponse = async (promptId) => {
    if (!quizId || !promptId || sharingPromptId) {
      return;
    }

    setSharingPromptId(promptId);
    setAssistantError('');

    try {
      const response = await fetch('http://127.0.0.1:8000/api/custom-analytics-prompt/share/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ quiz_id: quizId, prompt_id: promptId }),
      });

      if (!response.ok) {
        throw new Error('Unable to share this AI insight with students.');
      }

      const payload = await response.json();
      setAnalytics((prev) => ({
        ...(prev || {}),
        shared_insight_text: payload.shared_insight_text,
        shared_insight_updated_at: payload.shared_insight_updated_at,
        custom_prompt_history: (prev?.custom_prompt_history || []).map((item) => (
          item.id === promptId ? { ...item, is_announcement: true } : item
        )),
      }));
    } catch (err) {
      setAssistantError(err.message || 'Unable to share this AI insight with students.');
    } finally {
      setSharingPromptId(null);
    }
  };

  return (
    <div className="w-full rounded-3xl border border-slate-800 bg-slate-900/85 p-6 text-slate-100 shadow-[0_25px_65px_rgba(2,6,23,0.65)] md:p-8">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.34em] text-violet-300">Professor Monitor</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">{staticMode ? 'Archived Assessment Analytics' : 'Dr. Reshma\'s Real-Time Reporting Canvas'}</h2>
          <p className="mt-1 text-xs text-slate-400">{staticMode ? 'Static snapshot of final session intelligence.' : 'Polling every 4 seconds for live cohort response intelligence.'}</p>
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
              <span className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">Answer Word Cloud</span>
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
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-violet-300">Live NLP Synthesis</p>
                <h3 className="mt-2 text-xl font-semibold text-white">✨ AI Real-Time Response Gist</h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">Most Popular Gist of Answers streaming from current essay responses.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 justify-end">
                {!staticMode ? (
                  <>
                    <button
                      type="button"
                      onClick={refreshAiSummary}
                      disabled={isRefreshingSummary}
                      className="group inline-flex items-center gap-2 rounded-xl border border-violet-400/40 bg-violet-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-violet-200 transition-all hover:border-violet-300 hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span className={`inline-block ${isRefreshingSummary ? 'animate-spin' : 'group-hover:animate-spin'}`}>🔄</span>
                      Refresh AI Summary
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsResponsesPanelOpen(true)}
                      className="inline-flex items-center gap-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-2 text-xs font-semibold uppercase tracking-wide transition-all"
                    >
                      📋 View Individual Responses
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsResponsesPanelOpen(true)}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-2 text-xs font-semibold uppercase tracking-wide transition-all"
                  >
                    📋 View Individual Responses
                  </button>
                )}
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-violet-500/25 bg-violet-500/10 p-4">
              <ul className="space-y-2 text-sm text-violet-100">
                {mostPopularGists.map((gist, index) => (
                  <li key={`${gist}-${index}`} className="flex items-start gap-2">
                    <span className="mt-1 text-violet-300">•</span>
                    <span>{gist}</span>
                  </li>
                ))}
              </ul>
            </div>

            {!staticMode ? (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={toggleShareAnalytics}
                  disabled={isSharingAnalytics}
                  className={`w-full rounded-xl border px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] transition-all ${analytics?.is_shared_with_students ? 'border-cyan-400/50 bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/25' : 'border-slate-700 bg-slate-900/80 text-slate-200 hover:border-cyan-500/40 hover:text-cyan-200'} disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {isSharingAnalytics ? 'Updating Share State...' : analytics?.is_shared_with_students ? 'Share Live Insights Screen: ON' : 'Share Live Insights Screen: OFF'}
                </button>
              </div>
            ) : null}

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

            {!staticMode ? (
              <div className="mt-5 rounded-2xl border border-cyan-500/25 bg-slate-900/70 p-4">
              <div className="mb-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-cyan-300">Classroom Co-Pilot</p>
                <h4 className="mt-2 text-lg font-semibold text-white">💬 Live Interactive AI Assistant</h4>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 max-h-72 overflow-y-auto space-y-3">
                {promptHistory.length ? promptHistory.map((item) => (
                  <div key={item.id} className="space-y-2">
                    <div className="rounded-xl border border-slate-700 bg-slate-900/80 p-3 text-sm text-slate-200">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-300 mb-1">Professor Prompt</p>
                      <p>{item.prompt_text}</p>
                    </div>
                    <div className="rounded-xl border border-violet-500/25 bg-violet-500/10 p-3 text-sm text-violet-100">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-violet-300 mb-1">AI Response</p>
                      <p className="whitespace-pre-wrap">{item.response_text}</p>
                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          disabled={item.is_announcement || sharingPromptId === item.id}
                          onClick={() => handleSharePromptResponse(item.id)}
                          className="rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-cyan-200 transition-all hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {item.is_announcement ? 'Shared with Class' : sharingPromptId === item.id ? 'Sharing...' : '📢 Share with Class'}
                        </button>
                      </div>
                    </div>
                  </div>
                )) : (
                  <p className="text-sm text-slate-500">No assistant prompts yet. Ask your first live classroom question.</p>
                )}
              </div>

              <div className="mt-3 space-y-2">
                <input
                  type="text"
                  value={assistantPrompt}
                  onChange={(event) => setAssistantPrompt(event.target.value)}
                  placeholder="Ask anything about the student responses... (e.g., 'What are the main misconceptions?')"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-400"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      handleSendPrompt();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={handleSendPrompt}
                  disabled={isSendingPrompt || !assistantPrompt.trim()}
                  className="w-full rounded-xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 transition-all hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSendingPrompt ? 'Generating AI Response...' : 'Send Prompt'}
                </button>
                {assistantError ? (
                  <p className="text-xs text-rose-300">{assistantError}</p>
                ) : null}
              </div>
              </div>
            ) : null}

            {analytics?.peer_upvoting_enabled ? (
              <div className="mt-5 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-amber-300">Peer Leaderboard</p>
                    <h4 className="mt-2 text-lg font-semibold text-white">Top Voted Student Answers</h4>
                  </div>
                  <span className="text-xs text-amber-200">Live</span>
                </div>

                <div className="mt-3 space-y-2 max-h-72 overflow-y-auto">
                  {topVotedAnswers.length ? topVotedAnswers.map((item) => (
                    <div key={item.id} className="rounded-xl border border-amber-400/20 bg-slate-950/70 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-100">{item.student_name}</p>
                        <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-200">👍 {item.upvote_count}</span>
                      </div>
                      <p className="mt-2 text-xs text-slate-400">{item.question_title}</p>
                      <p className="mt-2 text-sm text-slate-200 whitespace-pre-wrap">{item.response_text}</p>
                    </div>
                  )) : (
                    <div className="rounded-xl border border-amber-400/20 bg-slate-950/60 p-3 text-sm text-slate-400">
                      Upvoted responses will appear here as students engage with peer feed.
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {isResponsesPanelOpen ? (
        <div
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setIsResponsesPanelOpen(false);
            }
          }}
        >
          <div className="absolute right-0 top-0 h-full w-full max-w-2xl bg-slate-900 border-l border-slate-800 shadow-2xl shadow-black/50 flex flex-col">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800">
              <div>
                <h3 className="text-lg font-semibold text-slate-100">Individual Submissions</h3>
                <p className="text-xs text-slate-400 mt-1">Live stream updates every 4 seconds from the analytics feed.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsResponsesPanelOpen(false)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-300 transition-all hover:border-rose-400/50 hover:text-rose-300"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {individualSubmissions.length ? individualSubmissions.map((submission) => {
                const submittedTime = submission.submitted_at ? new Date(submission.submitted_at).toLocaleTimeString() : 'Unknown time';
                const isExpanded = Boolean(expandedRows[submission.submission_id]);

                return (
                  <div key={submission.submission_id} className="rounded-2xl border border-slate-800 bg-slate-950/50">
                    <button
                      type="button"
                      onClick={() => toggleExpandedRow(submission.submission_id)}
                      className="w-full px-4 py-3 text-left flex flex-wrap items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-slate-100">{submission.student_name || 'Anonymous Student'}</span>
                        <span className="text-[10px] uppercase tracking-[0.18em] text-slate-400 border border-slate-700 rounded-full px-2 py-0.5">{submittedTime}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] uppercase tracking-[0.18em] text-cyan-300 border border-cyan-500/30 bg-cyan-500/10 rounded-full px-2 py-0.5">Choice: {submission.choice_badge || 'N/A'}</span>
                        <span className="text-slate-500 text-xs">{isExpanded ? '▲' : '▼'}</span>
                      </div>
                    </button>

                    {isExpanded ? (
                      <div className="px-4 pb-4">
                        <div className="bg-slate-950/60 p-3 rounded-xl text-slate-300 text-sm italic max-h-56 overflow-y-auto whitespace-pre-wrap">
                          {submission.response_text}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              }) : (
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-400">
                  No individual submissions have streamed in yet.
                </div>
              )}
            </div>

            <div className="border-t border-slate-800 px-6 py-4">
              <button
                type="button"
                onClick={() => setIsResponsesPanelOpen(false)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-200 transition-all hover:bg-slate-700"
              >
                Close Viewer
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}