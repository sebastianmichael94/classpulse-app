import { useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE_URL, authFetch } from './apiClient';
import WordCloudComponent from './WordCloudComponent';
import LatexText from './LatexText';
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './components/ui/dialog';
import { Spinner } from './components/ui/spinner';

const POLL_INTERVAL_MS = 4000;
const PIE_COLORS = ['#06b6d4', '#22c55e', '#f59e0b', '#a78bfa', '#ef4444', '#14b8a6', '#f97316'];
const TRUE_FALSE_COLORS = {
  True: '#22c55e',
  False: '#ef4444',
};

function ChoicePieTooltip({ active, payload, totalSelections }) {
  if (!active || !Array.isArray(payload) || !payload.length) {
    return null;
  }

  const point = payload[0]?.payload;
  if (!point) {
    return null;
  }

  const count = Number(point.value || 0);
  const percent = totalSelections > 0
    ? ((count / totalSelections) * 100).toFixed(1)
    : '0.0';

  return (
    <div className="rounded-xl border border-input bg-background/95 p-3 shadow-xl">
      <p className="text-sm font-semibold text-foreground">{point.name}</p>
      <p className="mt-1 text-xs text-cyan-300">Students: {count}</p>
      <p className="text-xs text-muted-foreground">Share: {percent}%</p>
    </div>
  );
}

function normalizeWordCloud(input) {
  if (Array.isArray(input)) {
    return input
      .map((item) => ({
        text: String(item?.text ?? item?.word ?? item?.token ?? '').trim(),
        value: Number(item?.value ?? item?.count ?? item?.frequency ?? item?.weight ?? 0),
      }))
      .filter((item) => item.text && item.value > 0)
      .sort((a, b) => b.value - a.value || a.text.localeCompare(b.text));
  }

  if (input && typeof input === 'object') {
    return Object.entries(input)
      .map(([text, value]) => ({ text: String(text || '').trim(), value: Number(value || 0) }))
      .filter((item) => item.text && item.value > 0)
      .sort((a, b) => b.value - a.value || a.text.localeCompare(b.text));
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

function normalizeListState(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }

  return [];
}

function stripTechnicalFragments(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }

  return raw
    .replace(/Local insight mode analyzed[^.]*\.\s*/gi, '')
    .replace(/Claude API Pipeline Error:[^\n]*/gi, '')
    .replace(/RAW CORE ANALYTICS ENGINE DATA INCOMING:[^\n]*/gi, '')
    .replace(/DEBUG:[^\n]*/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parsePedagogicalSections(value) {
  const cleaned = stripTechnicalFragments(value);
  if (!cleaned) {
    return {
      submissionBreakdown: 'No instructor summary available yet.',
      immediateRecommendation: 'Generate a response to receive a tactical recommendation.',
      suggestedFollowUpQuestion: 'Ask one short-answer check question to validate understanding.',
    };
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === 'object') {
      return {
        submissionBreakdown: String(parsed.submission_breakdown || parsed.breakdown || '').trim(),
        immediateRecommendation: String(parsed.immediate_recommendation || parsed.recommendation || '').trim(),
        suggestedFollowUpQuestion: String(parsed.suggested_follow_up_question || parsed.follow_up_question || '').trim(),
      };
    }
  } catch {
    // Non-JSON payloads are parsed by heading blocks below.
  }

  const breakdownMatch = cleaned.match(/(?:📊\s*)?Submission Breakdown:\s*([\s\S]*?)(?=(?:💡\s*)?Immediate Recommendation:|$)/i);
  const recommendationMatch = cleaned.match(/(?:💡\s*)?Immediate Recommendation:\s*([\s\S]*?)(?=(?:🎯\s*)?Suggested Follow-Up Question:|$)/i);
  const followUpMatch = cleaned.match(/(?:🎯\s*)?Suggested Follow-Up Question:\s*([\s\S]*)$/i);

  if (breakdownMatch || recommendationMatch || followUpMatch) {
    return {
      submissionBreakdown: String(breakdownMatch?.[1] || '').trim() || 'Submission patterns are still emerging.',
      immediateRecommendation: String(recommendationMatch?.[1] || '').trim() || 'Pause for a quick concept check and reteach one key point.',
      suggestedFollowUpQuestion: String(followUpMatch?.[1] || '').trim() || 'Ask one short-answer check question to validate understanding.',
    };
  }

  return {
    submissionBreakdown: cleaned,
    immediateRecommendation: 'In the next two minutes, restate the key concept and test one misconception aloud.',
    suggestedFollowUpQuestion: 'Short-answer check: In one sentence, explain the main idea and give one example.',
  };
}

function hasPedagogicalSections(value) {
  const cleaned = stripTechnicalFragments(value);
  if (!cleaned) {
    return false;
  }

  return /Submission Breakdown:/i.test(cleaned)
    && /Immediate Recommendation:/i.test(cleaned)
    && /Suggested Follow-Up Question:/i.test(cleaned);
}

function normalizeInsightPayload(data) {
  const fallbackGist = normalizeListState(data?.gist_list || data?.gistList || []);
  let gist = fallbackGist;
  let misconceptions = data?.misconceptions || data?.commonMisconceptions || data?.common_misconceptions || '';
  let keyThemes = data?.key_themes || data?.keyThemes || data?.key_themes_detected || '';

  if (gist.length === 1 && typeof gist[0] === 'string') {
    const maybeJson = gist[0].trim();
    if (maybeJson.startsWith('{') && maybeJson.includes('gist_list')) {
      try {
        const parsed = JSON.parse(maybeJson);
        gist = normalizeListState(parsed?.gist_list || parsed?.gistList || gist);
        misconceptions = parsed?.misconceptions || misconceptions;
        keyThemes = parsed?.key_themes || keyThemes;
      } catch {
        // Keep original payload if this isn't valid JSON.
      }
    }
  }

  if (Array.isArray(misconceptions)) {
    misconceptions = misconceptions.filter(Boolean).join(' | ');
  }

  if (Array.isArray(keyThemes)) {
    keyThemes = keyThemes.filter(Boolean).join(', ');
  }

  return {
    gist,
    misconceptions: String(misconceptions || '').trim(),
    keyThemes: String(keyThemes || '').trim(),
  };
}

function mergeAiSource(previousSource, incomingSource) {
  const next = String(incomingSource || 'fallback').toLowerCase();
  return next;
}

function normalizeQuestionType(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) {
    return 'unknown';
  }

  if (raw === 'fill in the blank') {
    return 'short_text';
  }

  if (
    raw === 'essay'
    || raw === 'essay question'
    || raw === 'essay_question'
    || raw === 'short answer'
    || raw === 'short_answer'
    || raw === 'short_answer_question'
  ) {
    return 'essay';
  }

  if (raw === 'multiple choice') {
    return 'choice';
  }

  if (raw === 'true/false' || raw === 'true_false_question' || raw === 'true false') {
    return 'true_false';
  }

  if (raw === 'matching' || raw === 'matching_question') {
    return 'matching';
  }

  return 'unknown';
}

function resolveTrueFalseLabel(value) {
  const token = String(value || '').trim().toLowerCase();
  if (!token) {
    return null;
  }

  if (['true', 't', 'a', '1', 'yes', 'y'].includes(token)) {
    return 'True';
  }

  if (['false', 'f', 'b', '0', 'no', 'n'].includes(token)) {
    return 'False';
  }

  return null;
}

function clampPercent(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.min(100, numeric));
}

function matchingBarColor({ isCorrect, isTopDistractor }) {
  if (isCorrect) {
    return 'from-emerald-400 to-emerald-500';
  }
  if (isTopDistractor) {
    return 'from-amber-400 to-amber-500';
  }
  return 'from-rose-400 to-rose-500';
}

export default function LiveAnalytics({
  quizId,
  accessCode,
  staticMode = false,
  onSessionStateChange,
  initialSessionStatus = 'READY',
  initialStartedAt = null,
  initialDurationMinutes = 10,
}) {
  const [analytics, setAnalytics] = useState(null);
  const [submissionCount, setSubmissionCount] = useState(0);
  const [wordCloudData, setWordCloudData] = useState([]);
  const [aiSummariesByQuestion, setAiSummariesByQuestion] = useState({});
  const [aiSource, setAiSource] = useState('fallback');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isRefreshingSummary, setIsRefreshingSummary] = useState(false);
  const [isResponsesPanelOpen, setIsResponsesPanelOpen] = useState(false);
  const [isWordCloudMaximized, setIsWordCloudMaximized] = useState(false);
  const [maximizedViewport, setMaximizedViewport] = useState({ width: 0, height: 0 });
  const [expandedRows, setExpandedRows] = useState({});
  const [assistantPrompt, setAssistantPrompt] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [assistantError, setAssistantError] = useState('');
  const [isSendingPrompt, setIsSendingPrompt] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [sessionStatus, setSessionStatus] = useState(() => String(initialSessionStatus || 'READY'));
  const [durationMinutes, setDurationMinutes] = useState(() => Number(initialDurationMinutes || 10) || 10);
  const [startedAt, setStartedAt] = useState(() => initialStartedAt || null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [isStoppingSession, setIsStoppingSession] = useState(false);
  const [questionOptions, setQuestionOptions] = useState([]);
  const [activeQuestionId, setActiveQuestionId] = useState(null);
  const pollingTimerRef = useRef(null);
  const countdownTimerRef = useRef(null);
  const isFetchingRef = useRef(false);
  const cleanAccessCode = String(accessCode || '').trim();
  const resolvedAccessCode = String(cleanAccessCode || analytics?.quiz_pin || '').trim();

  useEffect(() => {
    let isMounted = true;

    const loadQuestionOptions = async () => {
      if (!quizId) {
        if (isMounted) {
          setQuestionOptions([]);
          setActiveQuestionId(null);
        }
        return;
      }

      try {
        const response = await authFetch(`${API_BASE_URL}/api/quizzes/${quizId}/`);
        if (!response.ok) {
          throw new Error('Unable to load quiz questions for analytics tabs.');
        }

        const payload = await response.json();
        const questions = Array.isArray(payload?.questions) ? payload.questions : [];
        const normalized = questions.map((question, index) => ({
          id: question.id,
          label: `Question ${index + 1}: ${String(question.question_title || question.question_text || 'Untitled').slice(0, 90)}`,
          question_title: question.question_title,
          question_text: question.question_text,
          question_type: question.question_type,
          interaction_data: question.interaction_data || {},
        })).filter((question) => question.id);

        if (!isMounted) {
          return;
        }

        setQuestionOptions(normalized);
        setActiveQuestionId((prev) => {
          if (prev && normalized.some((item) => String(item.id) === String(prev))) {
            return prev;
          }
          return normalized[0]?.id || null;
        });
      } catch {
        if (isMounted) {
          setQuestionOptions([]);
          setActiveQuestionId(null);
        }
      }
    };

    loadQuestionOptions();

    return () => {
      isMounted = false;
    };
  }, [quizId]);

  useEffect(() => {
    // Instantly clear panel state when switching question tabs so each pane reflects only that question.
    setWordCloudData([]);
    setSubmissionCount(0);
    setChatMessages([]);
    setAssistantPrompt('');
    setAssistantError('');
    setError('');
  }, [activeQuestionId]);

  useEffect(() => {
    let isMounted = true;
    const abortController = new AbortController();
    const cleanPin = String(accessCode || '').trim();

    const clearPollingClock = () => {
      if (pollingTimerRef.current) {
        window.clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
    };

    if (!quizId && !cleanPin) {
      setAnalytics(null);
      setLastUpdated(null);
      setError('');
      setSubmissionCount(0);
      setWordCloudData([]);
      setAiSummariesByQuestion({});
      setAiSource('fallback');
      setChatMessages([]);
      clearPollingClock();
      return undefined;
    }

    if (!activeQuestionId) {
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
        let endpoint = '';
        let method = 'GET';

        if (forceRefresh) {
          if (!quizId) {
            throw new Error('Unable to refresh analytics until a quiz session is selected.');
          }
          endpoint = `${API_BASE_URL}/api/quizzes/${quizId}/analytics/refresh/?question_id=${encodeURIComponent(activeQuestionId)}`;
          method = 'POST';
        } else if (cleanPin) {
          endpoint = `${API_BASE_URL}/api/analytics/live/?pin=${encodeURIComponent(cleanPin)}&question_id=${encodeURIComponent(activeQuestionId)}`;
        } else if (quizId) {
          endpoint = `${API_BASE_URL}/api/quizzes/${quizId}/analytics/?question_id=${encodeURIComponent(activeQuestionId)}`;
        } else {
          throw new Error('No active quiz selected for analytics.');
        }

        console.log('Dashboard Polling URL:', endpoint);

        const response = await authFetch(endpoint, {
          method,
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error('Unable to load analytics');
        }

        const data = await response.json();
        if (isMounted) {
          console.log('RAW CORE ANALYTICS ENGINE DATA INCOMING:', data);
          const normalizedInsights = normalizeInsightPayload(data);

          const totalCount = data.total_submissions
            ?? data.submissions_count
            ?? (Array.isArray(data.responses) ? data.responses.length : 0)
            ?? 0;

          if (Array.isArray(data.question_catalog) && data.question_catalog.length > 0) {
            const normalizedCatalog = data.question_catalog.map((question) => ({
              id: question.id,
              label: question.label || question.question_title || `Question ${question.id}`,
              question_title: question.question_title,
              question_text: question.question_text,
              question_type: question.question_type,
              interaction_data: question.interaction_data || {},
            })).filter((question) => question.id);
            setQuestionOptions(normalizedCatalog);
          }

          if (data.generated_word_cloud || forceRefresh) {
            setWordCloudData(data.word_cloud_data || data.word_cloud || data.wordCloud || []);
          }

          const hasSummaryPayload = normalizedInsights.gist.length > 0
            || Boolean(normalizedInsights.misconceptions)
            || Boolean(normalizedInsights.keyThemes);

          if ((data.generated_summary || forceRefresh || hasSummaryPayload) && activeQuestionId) {
            const activeQuestionKey = String(activeQuestionId);
            setAiSummariesByQuestion((prev) => ({
              ...prev,
              [activeQuestionKey]: {
                gistList: normalizedInsights.gist,
                misconceptions: normalizedInsights.misconceptions,
                keyThemes: normalizedInsights.keyThemes,
                updatedAt: new Date().toISOString(),
              },
            }));
            setAiSource((prev) => mergeAiSource(prev, data.ai_source));
          }

          const nextQuizStatus = String(data.quiz_status || data.status || 'READY');
          setSessionStatus(nextQuizStatus);
          setDurationMinutes(Number(data.duration_minutes || 10) || 10);
          setStartedAt(data.started_at || null);

          if (quizId && onSessionStateChange) {
            onSessionStateChange({
              quizId,
              status: nextQuizStatus,
              startedAt: data.started_at || null,
              durationMinutes: Number(data.duration_minutes || 10) || 10,
            });
          }

          setAnalytics((prev) => ({
            ...data,
            word_cloud_image_data_uri: String(data.word_cloud_image_data_uri || '').trim()
              || String(prev?.word_cloud_image_data_uri || '').trim()
              || '',
          }));
          setSubmissionCount(Number(totalCount) || 0);
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
  }, [quizId, accessCode, staticMode, activeQuestionId]);

  useEffect(() => {
    if (countdownTimerRef.current) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }

    const computeRemaining = () => {
      if (sessionStatus !== 'ACTIVE' || !startedAt) {
        setRemainingSeconds(0);
        return;
      }

      const startedMillis = new Date(startedAt).getTime();
      const durationSeconds = Math.max(0, Number(durationMinutes || 0) * 60);
      const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedMillis) / 1000));
      const nextRemaining = Math.max(0, durationSeconds - elapsedSeconds);
      setRemainingSeconds(nextRemaining);
    };

    computeRemaining();
    countdownTimerRef.current = window.setInterval(computeRemaining, 1000);

    return () => {
      if (countdownTimerRef.current) {
        window.clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
    };
  }, [sessionStatus, startedAt, durationMinutes]);

  useEffect(() => {
    if (!isWordCloudMaximized) {
      return undefined;
    }

    const updateViewport = () => {
      setMaximizedViewport({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    updateViewport();

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsWordCloudMaximized(false);
      }
    };

    window.addEventListener('resize', updateViewport);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('resize', updateViewport);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isWordCloudMaximized]);

  const maximizedCloudWidth = Math.max(320, Number(maximizedViewport.width || 0) - 48);
  const maximizedCloudHeight = Math.max(240, Number(maximizedViewport.height || 0) - 48);

  const formatRemainingTime = (seconds) => {
    const safeSeconds = Math.max(0, Number(seconds || 0));
    const mins = Math.floor(safeSeconds / 60);
    const secs = safeSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const handleStartSession = async () => {
    if ((!quizId && !resolvedAccessCode) || isStartingSession) {
      return;
    }

    setIsStartingSession(true);
    setError('');
    try {
      const response = await authFetch(`${API_BASE_URL}/api/quizzes/start/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quiz_id: quizId || undefined,
          access_code: resolvedAccessCode || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error('Unable to activate this session right now.');
      }

      const payload = await response.json();
      const nextQuizStatus = String(payload.status || 'ACTIVE');
      setSessionStatus(nextQuizStatus);
      setDurationMinutes(Number(payload.duration_minutes || durationMinutes || 10));
      setStartedAt(payload.started_at || new Date().toISOString());
      setLastUpdated(new Date().toISOString());

      if (quizId && onSessionStateChange) {
        onSessionStateChange({
          quizId,
          status: nextQuizStatus,
          startedAt: payload.started_at || new Date().toISOString(),
          durationMinutes: Number(payload.duration_minutes || durationMinutes || 10) || 10,
        });
      }
    } catch (err) {
      setError(err.message || 'Unable to activate this session right now.');
    } finally {
      setIsStartingSession(false);
    }
  };

  const handleStopSession = async () => {
    if ((!quizId && !resolvedAccessCode) || isStoppingSession) {
      return;
    }

    setIsStoppingSession(true);
    setError('');
    try {
      const response = await authFetch(`${API_BASE_URL}/api/quizzes/stop/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quiz_id: quizId || undefined,
          access_code: resolvedAccessCode || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error('Unable to end this session right now.');
      }

      const payload = await response.json();
      const nextQuizStatus = String(payload.status || 'COMPLETED');
      setSessionStatus(nextQuizStatus);
      setRemainingSeconds(0);
      setLastUpdated(new Date().toISOString());

      if (quizId && onSessionStateChange) {
        onSessionStateChange({
          quizId,
          status: nextQuizStatus,
          startedAt: null,
          durationMinutes: Number(payload.duration_minutes || durationMinutes || 10) || 10,
        });
      }
    } catch (err) {
      setError(err.message || 'Unable to end this session right now.');
    } finally {
      setIsStoppingSession(false);
    }
  };

  const refreshAiSummary = async () => {
    if ((!quizId && !resolvedAccessCode) || isRefreshingSummary || !activeQuestionId) {
      //console.log('Skipping refreshAiSummary: quizId or accessCode missing, or already refreshing.'); 
      return;
    }

    setIsRefreshingSummary(true);
    try {
      const endpoint = quizId
        ? `${API_BASE_URL}/api/quizzes/${quizId}/analytics/refresh/?question_id=${encodeURIComponent(activeQuestionId)}&action=generate_summary`
        : `${API_BASE_URL}/api/analytics/live/?pin=${encodeURIComponent(resolvedAccessCode)}&refresh=1&question_id=${encodeURIComponent(activeQuestionId)}&action=generate_summary`;

      const response = await authFetch(endpoint, {
        method: quizId ? 'POST' : 'GET',
        headers: quizId ? {
          'Content-Type': 'application/json',
        } : undefined,
      });

      if (!response.ok) {
        throw new Error('Unable to refresh AI summary');
      }

      const payload = await response.json();
      const normalizedInsights = normalizeInsightPayload(payload);
      const totalCount = payload.total_submissions
        ?? payload.submissions_count
        ?? (Array.isArray(payload.responses) ? payload.responses.length : 0)
        ?? 0;

      if (activeQuestionId) {
        const activeQuestionKey = String(activeQuestionId);
        setAiSummariesByQuestion((prev) => ({
          ...prev,
          [activeQuestionKey]: {
            gistList: normalizedInsights.gist,
            misconceptions: normalizedInsights.misconceptions,
            keyThemes: normalizedInsights.keyThemes,
            updatedAt: new Date().toISOString(),
          },
        }));
      }
      setAiSource((prev) => mergeAiSource(prev, payload.ai_source));
      setAnalytics((prev) => ({
        ...payload,
        word_cloud_image_data_uri: String(payload.word_cloud_image_data_uri || '').trim()
          || String(prev?.word_cloud_image_data_uri || '').trim()
          || '',
      }));
      setSubmissionCount(Number(totalCount) || 0);
      setLastUpdated(new Date().toISOString());
      setError('');
    } catch (err) {
      setError(err.message || 'Unable to refresh AI summary');
    } finally {
      setIsRefreshingSummary(false);
    }
  };

  const generateWordCloud = async () => {
    if ((!quizId && !resolvedAccessCode) || isRefreshingSummary || !activeQuestionId) {
      return;
    }

    setIsRefreshingSummary(true);
    try {
      const endpoint = quizId
        ? `${API_BASE_URL}/api/quizzes/${quizId}/analytics/refresh/?question_id=${encodeURIComponent(activeQuestionId)}&action=generate_cloud`
        : `${API_BASE_URL}/api/analytics/live/?pin=${encodeURIComponent(resolvedAccessCode)}&question_id=${encodeURIComponent(activeQuestionId)}&action=generate_cloud`;

      const response = await authFetch(endpoint, {
        method: quizId ? 'POST' : 'GET',
        headers: quizId ? {
          'Content-Type': 'application/json',
        } : undefined,
      });

      if (!response.ok) {
        throw new Error('Unable to generate word cloud');
      }

      const payload = await response.json();
      const totalCount = payload.total_submissions
        ?? payload.submissions_count
        ?? (Array.isArray(payload.responses) ? payload.responses.length : 0)
        ?? 0;

      setWordCloudData(payload.word_cloud_data || payload.word_cloud || payload.wordCloud || []);
      setAnalytics((prev) => ({
        ...payload,
        word_cloud_image_data_uri: String(payload.word_cloud_image_data_uri || '').trim()
          || String(prev?.word_cloud_image_data_uri || '').trim()
          || '',
      }));
      setSubmissionCount(Number(totalCount) || 0);
      setLastUpdated(new Date().toISOString());
      setError('');
    } catch (err) {
      setError(err.message || 'Unable to generate word cloud');
    } finally {
      setIsRefreshingSummary(false);
    }
  };

  const wordCloud = useMemo(() => {
    return normalizeWordCloud(wordCloudData);
  }, [wordCloudData]);

  const individualSubmissions = Array.isArray(analytics?.individual_submissions) ? analytics.individual_submissions : [];
  const promptHistory = Array.isArray(analytics?.custom_prompt_history)
    ? [...analytics.custom_prompt_history].reverse()
    : [];
  const scopedPromptHistory = promptHistory.filter((item) => String(item?.question_id || '') === String(activeQuestionId || ''));
  const visiblePromptHistory = chatMessages.length ? chatMessages : scopedPromptHistory;
  const activeQuestion = questionOptions.find((question) => String(question.id) === String(activeQuestionId));
  const activeQuestionPromptText = String(
    activeQuestion?.question_text || activeQuestion?.question_title || analytics?.question_prompt || ''
  ).trim();
  const activeQuestionTypeCategory = normalizeQuestionType(
    analytics?.active_question_type || activeQuestion?.question_type
  );
  const isShortTextQuestion = activeQuestionTypeCategory === 'short_text';
  const isEssayQuestion = activeQuestionTypeCategory === 'essay';
  const isMultipleChoiceQuestion = activeQuestionTypeCategory === 'choice';
  const isTrueFalseQuestion = activeQuestionTypeCategory === 'true_false';
  const isMatchingQuestion = activeQuestionTypeCategory === 'matching';
  const activeQuestionSummary = activeQuestionId
    ? aiSummariesByQuestion[String(activeQuestionId)] || null
    : null;
  const activeSummaryPoints = toSummaryArray(
    activeQuestionSummary?.gistList || [],
    'Generate Quick Summary to see an instructor-ready snapshot for this question.'
  );

  const choiceMetrics = useMemo(() => {
    const counts = {};
    individualSubmissions.forEach((submission) => {
      const badge = String(submission?.choice_badge || 'N/A').trim();
      if (!badge || badge === 'N/A') {
        return;
      }

      badge.split(',').map((item) => item.trim()).filter(Boolean).forEach((choice) => {
        counts[choice] = (counts[choice] || 0) + 1;
      });
    });

    const entries = Object.entries(counts)
      .map(([choice, count]) => ({ choice, count }))
      .sort((a, b) => a.choice.localeCompare(b.choice));

    const totalSelections = entries.reduce((sum, item) => sum + Number(item.count || 0), 0);

    const chartData = entries.map((item) => ({
      name: `Option ${item.choice}`,
      value: Number(item.count || 0),
      choice: item.choice,
      percentage: totalSelections > 0 ? (Number(item.count || 0) / totalSelections) * 100 : 0,
    }));

    return {
      entries,
      totalSelections,
      chartData,
    };
  }, [individualSubmissions]);

  const trueFalseMetrics = useMemo(() => {
    const tallies = { True: 0, False: 0 };
    const activeId = String(activeQuestionId || '');

    individualSubmissions.forEach((submission) => {
      let label = null;

      if (activeId && Array.isArray(submission?.answers)) {
        const currentAnswer = submission.answers.find(
          (answer) => String(answer?.question_id || '') === activeId
        );

        if (currentAnswer) {
          label = resolveTrueFalseLabel(currentAnswer.answer_text);
        }
      }

      if (!label) {
        const choiceTokens = String(submission?.choice_badge || '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean);
        if (choiceTokens.length > 0) {
          label = resolveTrueFalseLabel(choiceTokens[0]);
        }
      }

      if (label && Object.prototype.hasOwnProperty.call(tallies, label)) {
        tallies[label] += 1;
      }
    });

    const totalSelections = tallies.True + tallies.False;
    const chartData = ['True', 'False'].map((label) => ({
      name: label,
      value: Number(tallies[label] || 0),
      percentage: totalSelections > 0 ? ((Number(tallies[label] || 0) / totalSelections) * 100) : 0,
      color: TRUE_FALSE_COLORS[label],
    }));

    return {
      totalSelections,
      chartData,
    };
  }, [individualSubmissions, activeQuestionId]);

  const matchingSummary = useMemo(() => {
    const summary = analytics?.matching_summary;
    if (!summary || typeof summary !== 'object') {
      return null;
    }

    const rows = Array.isArray(summary.rows) ? summary.rows : [];
    const totalSubmissions = Number(summary.total_submissions || submissionCount || 0);
    return {
      rows,
      totalSubmissions,
    };
  }, [analytics, submissionCount]);

  const toggleExpandedRow = (submissionId) => {
    setExpandedRows((prev) => ({
      ...prev,
      [submissionId]: !prev[submissionId],
    }));
  };

  const handleSendPrompt = async () => {
    const trimmedPrompt = assistantPrompt.trim();
    if ((!quizId && !resolvedAccessCode) || !trimmedPrompt || isSendingPrompt) {
      return;
    }

    setIsSendingPrompt(true);
    setAssistantError('');

    try {
      const response = await authFetch(`${API_BASE_URL}/api/analytics/chat/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quiz_id: quizId || undefined,
          access_code: resolvedAccessCode || undefined,
          question_id: activeQuestionId || undefined,
          active_question_id: activeQuestionId || undefined,
          prompt: trimmedPrompt,
          prompt_text: trimmedPrompt,
          mode: 'chat',
          is_summary: false,
        }),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload?.error || 'Unable to generate AI response at the moment.');
      }

      const payload = await response.json();
      const assistantReply = String(
        payload?.response || payload?.reply || payload?.response_text || ''
      ).trim();

      const chatMessage = {
        id: payload?.id || null,
        question_id: payload?.question_id || activeQuestionId || null,
        prompt_text: trimmedPrompt,
        response_text: assistantReply || 'No response generated yet.',
        is_announcement: Boolean(payload?.is_announcement),
        created_at: payload?.created_at || new Date().toISOString(),
      };

      setChatMessages((prev) => [chatMessage, ...prev]);
      setAnalytics((prev) => ({
        ...(prev || {}),
        custom_prompt_history: [chatMessage, ...(prev?.custom_prompt_history || [])],
      }));
      setAssistantPrompt('');
    } catch (err) {
      setAssistantError(err.message || 'Unable to generate AI response at the moment.');
    } finally {
      setIsSendingPrompt(false);
    }
  };

  return (
    <div className="w-full rounded-3xl border border-border bg-gradient-to-br from-background via-background to-cyan-500/5 p-6 text-foreground shadow-[0_25px_65px_rgba(2,6,23,0.18)] dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 dark:shadow-[0_25px_65px_rgba(2,6,23,0.65)] md:p-8">
      <section className="mb-6 rounded-3xl border border-border/90 bg-card/70 p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-foreground md:text-3xl">Live Lecture Analytics</h2>
            <p className="mt-2 text-sm text-muted-foreground">See how your class is understanding the material as they type.</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${sessionStatus === 'ACTIVE' ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-700 dark:text-emerald-200' : sessionStatus === 'COMPLETED' ? 'border-rose-500/60 bg-rose-500/15 text-rose-700 dark:text-rose-200' : 'border-amber-500/60 bg-amber-500/15 text-amber-700 dark:text-amber-200'}`}>
                Status: {String(sessionStatus || 'READY')}
              </span>
              <span className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${aiSource === 'claude' ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-700 dark:text-cyan-200' : 'border-slate-600 bg-secondary/80 text-muted-foreground'}`}>
                AI Source: {aiSource === 'claude' ? 'Claude' : 'Local Insight'}
              </span>
            </div>
          </div>

          <div className="grid w-full max-w-sm grid-cols-2 gap-3">
            <div className="rounded-2xl border border-input bg-background/70 p-3 text-center">
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Submissions</p>
              <p className="mt-1 text-2xl font-bold text-foreground">{submissionCount}</p>
            </div>
            <div className="rounded-2xl border border-input bg-background/70 p-3 text-center">
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Timer</p>
              <p className="mt-1 text-lg font-bold text-cyan-700 dark:text-cyan-200">{sessionStatus === 'ACTIVE' ? formatRemainingTime(remainingSeconds) : '00:00'}</p>
            </div>
            <div className="col-span-2 rounded-2xl border border-input bg-background/70 p-3 text-center">
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Last Updated</p>
              <p className="mt-1 text-xs text-muted-foreground">{lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : 'Waiting for live updates'}</p>
            </div>
          </div>
        </div>

        {!staticMode ? (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleStartSession}
              disabled={isStartingSession || sessionStatus === 'ACTIVE'}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/50 bg-emerald-500/15 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700 transition-all hover:-translate-y-0.5 hover:bg-emerald-500/25 dark:text-emerald-100 disabled:cursor-not-allowed disabled:opacity-55"
            >
              {isStartingSession ? <Spinner label="Starting live quiz session" /> : null}
              {isStartingSession ? 'Starting...' : 'Start Quiz Live'}
            </button>
            <button
              type="button"
              onClick={handleStopSession}
              disabled={isStoppingSession || sessionStatus !== 'ACTIVE'}
              className="inline-flex items-center gap-2 rounded-xl border border-rose-500/50 bg-rose-500/15 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-rose-700 transition-all hover:-translate-y-0.5 hover:bg-rose-500/25 dark:text-rose-100 disabled:cursor-not-allowed disabled:opacity-55"
            >
              {isStoppingSession ? <Spinner label="Stopping live quiz session" /> : null}
              {isStoppingSession ? 'Stopping...' : 'Stop Quiz'}
            </button>
          </div>
        ) : null}
      </section>

      {loading && !analytics ? (
        <div className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner label="Connecting to live analytics" />
          <span>Connecting to live analytics...</span>
        </div>
      ) : null}

      {error ? (
        <div className="mb-5 rounded-xl border border-rose-400/35 bg-rose-900/30 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      {analytics ? (
        <>
          <section className="mb-6 rounded-3xl border border-border/90 bg-card/70 p-5 md:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Active Question Filter</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {questionOptions.map((question) => {
                const isActive = String(question.id) === String(activeQuestionId);
                return (
                  <button
                    key={question.id}
                    type="button"
                    onClick={() => setActiveQuestionId(question.id)}
                    className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-all ${isActive ? 'border-cyan-500/70 bg-cyan-500/20 text-cyan-800 shadow-[0_0_20px_rgba(34,211,238,0.18)] dark:text-cyan-100' : 'border-input bg-background text-muted-foreground hover:-translate-y-0.5 hover:border-cyan-500/40 hover:text-cyan-700 dark:hover:text-cyan-200'}`}
                  >
                    {question.label || question.question_title || `Question ${question.id}`}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 rounded-2xl border border-input/80 bg-background/70 p-4 sm:p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300">Active Question Prompt</p>
              <h3 className="mt-2 text-sm leading-7 text-foreground sm:text-base">
                {activeQuestionPromptText ? (
                  <LatexText text={activeQuestionPromptText} />
                ) : (
                  'Prompt unavailable for the selected question.'
                )}
              </h3>
            </div>

            {isShortTextQuestion ? (
              <div className="mt-5 rounded-2xl border border-cyan-500/25 bg-cyan-500/10 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700 dark:text-cyan-100">Live Word Cloud</p>
                  <button
                    type="button"
                    onClick={generateWordCloud}
                    disabled={isRefreshingSummary}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-500/45 bg-cyan-500/12 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700 transition-all hover:-translate-y-0.5 hover:bg-cyan-500/20 dark:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    <span className={isRefreshingSummary ? 'animate-spin' : ''}>☁️</span>
                    Generate Word Cloud
                  </button>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">Generate cloud only for the highlighted question tab.</p>
              </div>
            ) : null}
          </section>

          <section className="mb-6 rounded-3xl border border-border/90 bg-card/70 p-5 md:p-6">
            {isShortTextQuestion ? (
              <div className="space-y-4">
                <article className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold text-cyan-700 dark:text-cyan-100">Word Cloud Output</h3>
                    <button
                      type="button"
                      onClick={() => setIsWordCloudMaximized(true)}
                      disabled={!wordCloud.length}
                      className="px-3 py-1.5 text-xs font-semibold text-cyan-400 bg-card border border-border rounded-lg hover:bg-secondary transition-all flex items-center space-x-1 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <span>Maximize Cloud</span>
                    </button>
                  </div>
                  {wordCloud.length ? (
                    <div className="mt-4 overflow-hidden rounded-2xl border border-cyan-400/30 bg-gradient-to-br from-slate-900 via-slate-950 to-[#120b2f] p-1 shadow-[0_20px_60px_rgba(8,145,178,0.22)]">
                      <WordCloudComponent data={wordCloud} width={980} height={460} className="min-h-[280px]" />
                    </div>
                  ) : (
                    <div className="mt-4 rounded-2xl border border-border bg-background/70 p-4">
                      <p className="text-sm text-muted-foreground">Click Generate Word Cloud to render this question tab's keywords.</p>
                    </div>
                  )}
                </article>

                <button
                  type="button"
                  onClick={() => setIsResponsesPanelOpen(true)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-500/45 bg-cyan-500/15 px-4 py-3 text-sm font-semibold tracking-[0.04em] text-cyan-700 transition-all hover:-translate-y-0.5 hover:bg-cyan-500/25 dark:text-cyan-100"
                >
                  See Individual Student Answers
                </button>
              </div>
            ) : null}

            {isEssayQuestion ? (
              <div className="space-y-4">
                <article className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold text-cyan-700 dark:text-cyan-100">🧠 Quick AI Class Summary</h3>
                    <button
                      type="button"
                      onClick={refreshAiSummary}
                      disabled={isRefreshingSummary}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-500/45 bg-cyan-500/12 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700 transition-all hover:-translate-y-0.5 hover:bg-cyan-500/20 dark:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-55"
                    >
                      {isRefreshingSummary ? <Spinner label="Generating quick summary" /> : null}
                      Generate Quick Summary
                    </button>
                  </div>
                  <ul className="mt-4 space-y-2 text-sm text-foreground">
                    {activeSummaryPoints.slice(0, 5).map((gist, i) => (
                      <li key={`${activeQuestionId || 'none'}-essay-summary-${i}`} className="flex items-start gap-2">
                        <span className="mt-1 text-cyan-300">•</span>
                        <span>{gist}</span>
                      </li>
                    ))}
                  </ul>
                </article>

                {!staticMode ? (
                  <article className="rounded-2xl border border-border/90 bg-card/70 p-4">
                    <div className="mb-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-cyan-300">INSTRUCTOR ASSISTANT</p>
                      <h4 className="mt-2 text-lg font-semibold text-foreground">Ask About Student Answers</h4>
                      <p className="mt-2 text-xs text-muted-foreground">Scoped to active tab: {activeQuestion?.label || `Question ${activeQuestionId || '-'}`}</p>
                    </div>

                    {visiblePromptHistory.length ? (
                      <div className="max-h-72 space-y-3 overflow-y-auto rounded-xl border border-border bg-background/70 p-3">
                        {visiblePromptHistory.map((item) => (
                        <div key={item.id || item.created_at} className="space-y-2">
                          <div className="rounded-xl border border-input bg-card/80 p-3 text-sm text-foreground">
                            <p className="mb-1 text-[10px] uppercase tracking-[0.2em] text-cyan-300">Instructor Prompt</p>
                            <p>{item.prompt_text}</p>
                          </div>
                          <div className="rounded-xl border border-violet-500/25 bg-violet-500/10 p-3 text-sm text-violet-800 dark:text-violet-100">
                            <p className="mb-1 text-[10px] uppercase tracking-[0.2em] text-violet-300">AI Response</p>
                            {hasPedagogicalSections(item.response_text) ? (() => {
                              const formatted = parsePedagogicalSections(item.response_text);
                              return (
                                <div className="space-y-3 text-violet-800 dark:text-violet-100">
                                  <div>
                                    <p className="font-semibold text-violet-200">Submission Breakdown:</p>
                                    <p className="whitespace-pre-wrap">{formatted.submissionBreakdown}</p>
                                  </div>
                                  <div>
                                    <p className="font-semibold text-violet-200">Immediate Recommendation:</p>
                                    <p className="whitespace-pre-wrap">{formatted.immediateRecommendation}</p>
                                  </div>
                                  <div>
                                    <p className="font-semibold text-violet-200">Suggested Follow-Up Question:</p>
                                    <p className="whitespace-pre-wrap">{formatted.suggestedFollowUpQuestion}</p>
                                  </div>
                                </div>
                              );
                            })() : (
                              <p className="whitespace-pre-wrap text-violet-800 dark:text-violet-100">{stripTechnicalFragments(item.response_text)}</p>
                            )}
                          </div>
                        </div>
                        ))}
                      </div>
                    ) : null}

                    <div className="mt-3 space-y-2">
                      <input
                        type="text"
                        value={assistantPrompt}
                        onChange={(event) => setAssistantPrompt(event.target.value)}
                        placeholder="Ask a classroom question..."
                        className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none focus:border-cyan-400"
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
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 transition-all hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isSendingPrompt ? <Spinner label="Generating AI response" /> : null}
                        {isSendingPrompt ? 'Generating response...' : 'Send Prompt'}
                      </button>
                      {assistantError ? (
                        <p className="text-xs text-rose-300">{assistantError}</p>
                      ) : null}
                    </div>
                  </article>
                ) : null}

                <button
                  type="button"
                  onClick={() => setIsResponsesPanelOpen(true)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-500/45 bg-cyan-500/15 px-4 py-3 text-sm font-semibold tracking-[0.04em] text-cyan-700 transition-all hover:-translate-y-0.5 hover:bg-cyan-500/25 dark:text-cyan-100"
                >
                  See Individual Student Answers
                </button>
              </div>
            ) : null}

            {isMultipleChoiceQuestion ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-input bg-background/60 p-4">
                  <h3 className="text-lg font-semibold text-foreground">Live Answer Distribution</h3>
                  <p className="mt-2 text-sm text-muted-foreground">Real-time pie chart for the active multiple-choice question.</p>

                  {choiceMetrics.chartData.length ? (
                    <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1fr_0.8fr] xl:items-start">
                      <div className="h-[300px] w-full overflow-hidden rounded-2xl border border-input bg-background/80 p-2">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={choiceMetrics.chartData}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              innerRadius={55}
                              outerRadius={105}
                              paddingAngle={2}
                              stroke="#0f172a"
                              strokeWidth={2}
                            >
                              {choiceMetrics.chartData.map((entry, index) => (
                                <Cell key={`slice-${entry.choice}-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip content={<ChoicePieTooltip totalSelections={choiceMetrics.totalSelections} />} />
                            <Legend
                              verticalAlign="bottom"
                              align="center"
                              iconType="circle"
                              formatter={(value, entry) => {
                                const point = entry?.payload;
                                const count = Number(point?.value || 0);
                                const percent = choiceMetrics.totalSelections > 0
                                  ? ((count / choiceMetrics.totalSelections) * 100).toFixed(1)
                                  : '0.0';
                                return `${value}: ${count} (${percent}%)`;
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>

                      <div className="rounded-xl border border-input bg-card/70 p-3 text-sm text-foreground">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Summary</p>
                        <p className="mt-2">Total selections: <span className="font-semibold text-foreground">{choiceMetrics.totalSelections}</span></p>
                        <p className="mt-1">Submissions: <span className="font-semibold text-foreground">{submissionCount}</span></p>
                        <div className="mt-3 space-y-2">
                          {choiceMetrics.chartData.map((entry, index) => (
                            <div key={`legend-${entry.choice}`} className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2">
                                <span
                                  className="h-2.5 w-2.5 rounded-full"
                                  style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
                                />
                                <span>{entry.name}</span>
                              </div>
                              <span>{entry.value} ({entry.percentage.toFixed(1)}%)</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-input bg-card/60 p-4">
                      <p className="text-sm text-muted-foreground">No choice selections received yet for this question.</p>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setIsResponsesPanelOpen(true)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-500/45 bg-cyan-500/15 px-4 py-3 text-sm font-semibold tracking-[0.04em] text-cyan-700 transition-all hover:-translate-y-0.5 hover:bg-cyan-500/25 dark:text-cyan-100"
                >
                  See Individual Student Answers
                </button>
              </div>
            ) : null}

            {isTrueFalseQuestion ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-input bg-background/60 p-4">
                  <h3 className="text-lg font-semibold text-foreground">Live True/False Distribution</h3>
                  <p className="mt-2 text-sm text-muted-foreground">Real-time agreement split for the active True/False question.</p>

                  {trueFalseMetrics.totalSelections > 0 ? (
                    <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1fr_0.8fr] xl:items-start">
                      <div className="h-[300px] w-full overflow-hidden rounded-2xl border border-input bg-background/80 p-2">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={trueFalseMetrics.chartData}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              innerRadius={55}
                              outerRadius={105}
                              paddingAngle={2}
                              stroke="#0f172a"
                              strokeWidth={2}
                            >
                              {trueFalseMetrics.chartData.map((entry) => (
                                <Cell key={`tf-slice-${entry.name}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip content={<ChoicePieTooltip totalSelections={trueFalseMetrics.totalSelections} />} />
                            <Legend
                              verticalAlign="bottom"
                              align="center"
                              iconType="circle"
                              formatter={(value, entry) => {
                                const point = entry?.payload;
                                const count = Number(point?.value || 0);
                                const percent = trueFalseMetrics.totalSelections > 0
                                  ? ((count / trueFalseMetrics.totalSelections) * 100).toFixed(1)
                                  : '0.0';
                                return `${value}: ${count} (${percent}%)`;
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>

                      <div className="rounded-xl border border-input bg-card/70 p-3 text-sm text-foreground">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Summary</p>
                        <p className="mt-2">Total selections: <span className="font-semibold text-foreground">{trueFalseMetrics.totalSelections}</span></p>
                        <p className="mt-1">Submissions: <span className="font-semibold text-foreground">{submissionCount}</span></p>
                        <div className="mt-3 space-y-2">
                          {trueFalseMetrics.chartData.map((entry) => (
                            <div key={`tf-legend-${entry.name}`} className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2">
                                <span
                                  className="h-2.5 w-2.5 rounded-full"
                                  style={{ backgroundColor: entry.color }}
                                />
                                <span>{entry.name}</span>
                              </div>
                              <span>{entry.value} ({entry.percentage.toFixed(1)}%)</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-input bg-card/60 p-4">
                      <p className="text-sm text-muted-foreground">No True/False selections received yet for this question.</p>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setIsResponsesPanelOpen(true)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-500/45 bg-cyan-500/15 px-4 py-3 text-sm font-semibold tracking-[0.04em] text-cyan-700 transition-all hover:-translate-y-0.5 hover:bg-cyan-500/25 dark:text-cyan-100"
                >
                  See Individual Student Answers
                </button>
              </div>
            ) : null}

            {isMatchingQuestion ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-input bg-background/60 p-4">
                  <h3 className="text-lg font-semibold text-foreground">Matching Pair Breakdown</h3>
                  <p className="mt-2 text-sm text-muted-foreground">Each segment shows one left-side prompt and the real-time distribution of matching selections.</p>

                  {matchingSummary?.rows?.length ? (
                    <div className="mt-4 grid grid-cols-1 gap-4">
                      {matchingSummary.rows.map((row, rowIndex) => {
                        const sortedBreakdown = Array.isArray(row.selection_breakdown)
                          ? [...row.selection_breakdown].sort((a, b) => Number(b.count || 0) - Number(a.count || 0))
                          : [];
                        const topDistractorId = sortedBreakdown.find((entry) => !entry.is_correct && Number(entry.count || 0) > 0)?.right_id || null;
                        const correctedPercent = clampPercent(row.correct_percentage);

                        return (
                          <article key={`matching-row-${row.left_id}`} className="rounded-2xl border border-input bg-card/55 p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300">Match {rowIndex + 1} • {row.left_id}</p>
                                <h4 className="mt-2 text-sm leading-7 text-foreground sm:text-base"><LatexText text={row.left_text || row.left_id} /></h4>
                                {row.left_image_url ? (
                                  <div className="mt-3 overflow-hidden rounded-lg border border-input bg-card/60 p-2">
                                    <img
                                      src={row.left_image_url}
                                      alt={`${row.left_id} prompt`}
                                      className="h-auto max-h-[100px] w-full object-contain"
                                    />
                                  </div>
                                ) : null}
                              </div>

                              <div className="rounded-xl border border-emerald-400/35 bg-emerald-500/10 px-3 py-2 text-right">
                                <p className="text-[10px] uppercase tracking-[0.16em] text-emerald-300">Accuracy</p>
                                <p className="mt-1 text-lg font-semibold text-emerald-200">{correctedPercent.toFixed(1)}% Correct</p>
                                <p className="text-xs text-muted-foreground">{row.correct_count || 0}/{matchingSummary.totalSubmissions || 0} students</p>
                              </div>
                            </div>

                            <div className="mt-4 space-y-2">
                              {sortedBreakdown.map((entry) => {
                                const percent = clampPercent(entry.percentage);
                                const isTopDistractor = !entry.is_correct && entry.right_id === topDistractorId;
                                return (
                                  <div key={`matching-bar-${row.left_id}-${entry.right_id}`} className="rounded-xl border border-input bg-background/70 p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div className="min-w-0">
                                        <p className={`text-xs font-semibold ${entry.is_correct ? 'text-emerald-300' : isTopDistractor ? 'text-amber-300' : 'text-rose-300'}`}>
                                          {entry.right_id}{entry.is_correct ? ' • Correct' : isTopDistractor ? ' • Top Distractor' : ' • Distractor'}
                                        </p>
                                        <p className="mt-1 text-xs text-muted-foreground"><LatexText text={entry.text || entry.right_id} /></p>
                                      </div>
                                      <p className="text-xs font-semibold text-foreground">{percent.toFixed(1)}% ({entry.count || 0})</p>
                                    </div>

                                    <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-secondary">
                                      <div
                                        className={`h-full rounded-full bg-gradient-to-r ${matchingBarColor({ isCorrect: entry.is_correct, isTopDistractor })}`}
                                        style={{ width: `${percent}%` }}
                                      />
                                    </div>

                                    {entry.image_url ? (
                                      <div className="mt-2 overflow-hidden rounded-lg border border-input bg-card/60 p-2">
                                        <img
                                          src={entry.image_url}
                                          alt={`${entry.right_id} option`}
                                          className="h-auto max-h-[100px] w-full object-contain"
                                        />
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          </article>
                        );
                      })}

                      <div className="rounded-xl border border-input bg-card/70 p-3 text-sm text-foreground">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Summary</p>
                        <p className="mt-2">Submissions: <span className="font-semibold text-foreground">{matchingSummary.totalSubmissions || 0}</span></p>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-input bg-card/60 p-4">
                      <p className="text-sm text-muted-foreground">No matching responses received yet for this question.</p>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setIsResponsesPanelOpen(true)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-500/45 bg-cyan-500/15 px-4 py-3 text-sm font-semibold tracking-[0.04em] text-cyan-700 transition-all hover:-translate-y-0.5 hover:bg-cyan-500/25 dark:text-cyan-100"
                >
                  See Individual Student Answers
                </button>
              </div>
            ) : null}

            {(isShortTextQuestion || isMultipleChoiceQuestion || isTrueFalseQuestion || isMatchingQuestion) ? (
              <article className="mt-4 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold text-cyan-700 dark:text-cyan-100">🧠 Quick AI Class Summary</h3>
                  <button
                    type="button"
                    onClick={refreshAiSummary}
                    disabled={isRefreshingSummary}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-500/45 bg-cyan-500/12 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700 transition-all hover:-translate-y-0.5 hover:bg-cyan-500/20 dark:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    {isRefreshingSummary ? <Spinner label="Generating quick summary" /> : null}
                    Generate Quick Summary
                  </button>
                </div>
                <ul className="mt-4 space-y-2 text-sm text-foreground">
                  {activeSummaryPoints.slice(0, 5).map((gist, i) => (
                    <li key={`${activeQuestionId || 'none'}-summary-${i}`} className="flex items-start gap-2">
                      <span className="mt-1 text-cyan-300">•</span>
                      <span>{gist}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ) : null}

            {!isShortTextQuestion && !isEssayQuestion && !isMultipleChoiceQuestion && !isTrueFalseQuestion && !isMatchingQuestion ? (
              <div className="rounded-2xl border border-input bg-background/60 p-4 text-sm text-muted-foreground">
                Select a question to view the question-type specific analytics modules.
              </div>
            ) : null}
          </section>

          {!staticMode && (isShortTextQuestion || isMultipleChoiceQuestion || isTrueFalseQuestion || isMatchingQuestion) ? (
            <section className="mb-6 rounded-3xl border border-border/90 bg-card/70 p-5 md:p-6">
              <div className="mb-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-cyan-300">INSTRUCTOR ASSISTANT</p>
                <h4 className="mt-2 text-lg font-semibold text-foreground">Ask About Student Answers</h4>
                <p className="mt-2 text-xs text-muted-foreground">Scoped to active tab: {activeQuestion?.label || `Question ${activeQuestionId || '-'}`}</p>
              </div>

              {visiblePromptHistory.length ? (
                <div className="max-h-72 space-y-3 overflow-y-auto rounded-xl border border-border bg-background/70 p-3">
                  {visiblePromptHistory.map((item) => (
                  <div key={item.id || item.created_at} className="space-y-2">
                    <div className="rounded-xl border border-input bg-card/80 p-3 text-sm text-foreground">
                      <p className="mb-1 text-[10px] uppercase tracking-[0.2em] text-cyan-300">Instructor Prompt</p>
                      <p>{item.prompt_text}</p>
                    </div>
                    <div className="rounded-xl border border-violet-500/25 bg-violet-500/10 p-3 text-sm text-violet-800 dark:text-violet-100">
                      <p className="mb-1 text-[10px] uppercase tracking-[0.2em] text-violet-300">AI Response</p>
                      {hasPedagogicalSections(item.response_text) ? (() => {
                        const formatted = parsePedagogicalSections(item.response_text);
                        return (
                          <div className="space-y-3 text-violet-800 dark:text-violet-100">
                            <div>
                              <p className="font-semibold text-violet-200">Submission Breakdown:</p>
                              <p className="whitespace-pre-wrap">{formatted.submissionBreakdown}</p>
                            </div>
                            <div>
                              <p className="font-semibold text-violet-200">Immediate Recommendation:</p>
                              <p className="whitespace-pre-wrap">{formatted.immediateRecommendation}</p>
                            </div>
                            <div>
                              <p className="font-semibold text-violet-200">Suggested Follow-Up Question:</p>
                              <p className="whitespace-pre-wrap">{formatted.suggestedFollowUpQuestion}</p>
                            </div>
                          </div>
                        );
                      })() : (
                        <p className="whitespace-pre-wrap text-violet-800 dark:text-violet-100">{stripTechnicalFragments(item.response_text)}</p>
                      )}
                    </div>
                  </div>
                  ))}
                </div>
              ) : null}

              <div className="mt-3 space-y-2">
                <input
                  type="text"
                  value={assistantPrompt}
                  onChange={(event) => setAssistantPrompt(event.target.value)}
                  placeholder="Ask a classroom question..."
                  className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none focus:border-cyan-400"
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
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 transition-all hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSendingPrompt ? <Spinner label="Generating AI response" /> : null}
                  {isSendingPrompt ? 'Generating response...' : 'Send Prompt'}
                </button>
                {assistantError ? (
                  <p className="text-xs text-rose-300">{assistantError}</p>
                ) : null}
              </div>
            </section>
          ) : null}

        </>
      ) : null}

      <Dialog open={isResponsesPanelOpen} onOpenChange={setIsResponsesPanelOpen}>
        <DialogContent className="h-[90vh] w-[95vw] max-w-4xl overflow-hidden p-0">
          <DialogHeader className="border-b border-border px-6 py-5">
            <DialogTitle>Individual Submissions</DialogTitle>
            <p className="text-xs text-muted-foreground">Updates every 4 seconds from the live analytics feed.</p>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {individualSubmissions.length ? individualSubmissions.map((submission) => {
                const submittedTime = submission.submitted_at ? new Date(submission.submitted_at).toLocaleTimeString() : 'Unknown time';
                const isExpanded = Boolean(expandedRows[submission.submission_id]);

                return (
                  <div key={submission.submission_id} className="rounded-2xl border border-border bg-background/50">
                    <button
                      type="button"
                      onClick={() => toggleExpandedRow(submission.submission_id)}
                      className="w-full px-4 py-3 text-left flex flex-wrap items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-foreground">{submission.student_name || 'Anonymous Student'}</span>
                        <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground border border-input rounded-full px-2 py-0.5">{submittedTime}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] uppercase tracking-[0.18em] text-cyan-300 border border-cyan-500/30 bg-cyan-500/10 rounded-full px-2 py-0.5">Choice: {submission.choice_badge || 'N/A'}</span>
                        {isExpanded ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
                      </div>
                    </button>

                    {isExpanded ? (
                      <div className="px-4 pb-4">
                        <div className="bg-background/60 p-3 rounded-xl max-h-72 overflow-y-auto space-y-3">
                          {Array.isArray(submission.answers) && submission.answers.length > 0 ? submission.answers.map((ans, index) => (
                            <div key={`${submission.submission_id}-${ans.question_id || index}`} className="p-3 rounded-xl border border-border bg-card/70">
                              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                Question: {ans.question_title || 'Unknown Question'}
                              </p>
                              <p className="mt-2 text-sm font-medium text-cyan-300 bg-background p-3 rounded-lg border border-border/60">
                                Student Response:{' '}
                                <span className="text-foreground">{String(ans.answer_text || '').trim() || 'No response provided'}</span>
                              </p>
                            </div>
                          )) : (
                            <div className="bg-background/60 p-3 rounded-xl text-muted-foreground text-sm italic whitespace-pre-wrap">
                              {submission.response_text}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              }) : (
                <div className="rounded-xl border border-border bg-background/60 p-4 text-sm text-muted-foreground">
                  No individual submissions have arrived yet.
                </div>
              )}
            </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isWordCloudMaximized} onOpenChange={setIsWordCloudMaximized}>
        <DialogContent className="h-[95vh] max-w-[95vw] p-4 sm:p-6">
          <div className="h-full w-full">
            {wordCloud.length ? (
              <WordCloudComponent
                data={wordCloud}
                width={maximizedCloudWidth}
                height={maximizedCloudHeight}
                className="h-full w-full"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded-2xl border border-border bg-background/70">
                <p className="text-sm text-muted-foreground">Generate a word cloud first to view it in expanded mode.</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}