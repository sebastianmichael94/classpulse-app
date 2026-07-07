import { useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE_URL, authFetch } from './apiClient';
import WordCloudComponent from './WordCloudComponent';

const POLL_INTERVAL_MS = 4000;

function normalizeWordCloud(input) {
  if (Array.isArray(input)) {
    return input
      .map((item) => ({
        text: String(item?.text || item?.word || '').trim().toLowerCase(),
        value: Number(item?.value || item?.count || 0),
      }))
      .filter((item) => item.text && item.value > 0)
      .sort((a, b) => b.value - a.value || a.text.localeCompare(b.text));
  }

  if (input && typeof input === 'object') {
    return Object.entries(input)
      .map(([text, value]) => ({ text: String(text || '').trim().toLowerCase(), value: Number(value || 0) }))
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

  if (raw === 'essay question') {
    return 'essay';
  }

  if (raw === 'multiple choice') {
    return 'choice';
  }

  return 'unknown';
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
            })).filter((question) => question.id);
            setQuestionOptions(normalizedCatalog);
          }

          if (data.generated_word_cloud || forceRefresh) {
            setWordCloudData(normalizeWordCloud(data.word_cloud_data || data.word_cloud || data.wordCloud || []));
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

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsWordCloudMaximized(false);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isWordCloudMaximized]);

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

      setWordCloudData(normalizeWordCloud(payload.word_cloud_data || payload.word_cloud || payload.wordCloud || []));
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
  const activeQuestionTypeCategory = normalizeQuestionType(
    analytics?.active_question_type || activeQuestion?.question_type
  );
  const isShortTextQuestion = activeQuestionTypeCategory === 'short_text';
  const isEssayQuestion = activeQuestionTypeCategory === 'essay';
  const isMultipleChoiceQuestion = activeQuestionTypeCategory === 'choice';
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

    const maxCount = entries.reduce((max, item) => Math.max(max, item.count), 0);
    return {
      entries,
      maxCount,
    };
  }, [individualSubmissions]);

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
    <div className="w-full rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 text-slate-100 shadow-[0_25px_65px_rgba(2,6,23,0.65)] md:p-8">
      <section className="mb-6 rounded-3xl border border-slate-800/90 bg-slate-900/70 p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-white md:text-3xl">Live Lecture Analytics</h2>
            <p className="mt-2 text-sm text-slate-300">See how your class is understanding the material as they type.</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${sessionStatus === 'ACTIVE' ? 'border-emerald-400/60 bg-emerald-500/15 text-emerald-200' : sessionStatus === 'COMPLETED' ? 'border-rose-400/60 bg-rose-500/15 text-rose-200' : 'border-amber-400/60 bg-amber-500/15 text-amber-200'}`}>
                Status: {String(sessionStatus || 'READY')}
              </span>
              <span className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${aiSource === 'claude' ? 'border-cyan-400/60 bg-cyan-500/15 text-cyan-200' : 'border-slate-600 bg-slate-800/80 text-slate-300'}`}>
                AI Source: {aiSource === 'claude' ? 'Claude' : 'Local Insight'}
              </span>
            </div>
          </div>

          <div className="grid w-full max-w-sm grid-cols-2 gap-3">
            <div className="rounded-2xl border border-slate-700 bg-slate-950/70 p-3 text-center">
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Submissions</p>
              <p className="mt-1 text-2xl font-bold text-white">{submissionCount}</p>
            </div>
            <div className="rounded-2xl border border-slate-700 bg-slate-950/70 p-3 text-center">
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Timer</p>
              <p className="mt-1 text-lg font-bold text-cyan-200">{sessionStatus === 'ACTIVE' ? formatRemainingTime(remainingSeconds) : '00:00'}</p>
            </div>
            <div className="col-span-2 rounded-2xl border border-slate-700 bg-slate-950/70 p-3 text-center">
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Last Updated</p>
              <p className="mt-1 text-xs text-slate-300">{lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : 'Waiting for live updates'}</p>
            </div>
          </div>
        </div>

        {!staticMode ? (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleStartSession}
              disabled={isStartingSession || sessionStatus === 'ACTIVE'}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/50 bg-emerald-500/15 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100 transition-all hover:-translate-y-0.5 hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-55"
            >
              <span className={isStartingSession ? 'animate-spin' : ''}>▶️</span>
              {isStartingSession ? 'Starting...' : '▶️ Start Quiz Live'}
            </button>
            <button
              type="button"
              onClick={handleStopSession}
              disabled={isStoppingSession || sessionStatus !== 'ACTIVE'}
              className="inline-flex items-center gap-2 rounded-xl border border-rose-400/50 bg-rose-500/15 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-rose-100 transition-all hover:-translate-y-0.5 hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-55"
            >
              <span className={isStoppingSession ? 'animate-spin' : ''}>🛑</span>
              {isStoppingSession ? 'Stopping...' : '🛑 Stop Quiz'}
            </button>
          </div>
        ) : null}
      </section>

      {loading && !analytics ? (
        <p className="text-sm text-slate-400">Connecting to live analytics...</p>
      ) : null}

      {error ? (
        <div className="mb-5 rounded-xl border border-rose-400/35 bg-rose-900/30 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      {analytics ? (
        <>
          <section className="mb-6 rounded-3xl border border-slate-800/90 bg-slate-900/70 p-5 md:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-300">Active Question Filter</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {questionOptions.map((question) => {
                const isActive = String(question.id) === String(activeQuestionId);
                return (
                  <button
                    key={question.id}
                    type="button"
                    onClick={() => setActiveQuestionId(question.id)}
                    className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-all ${isActive ? 'border-cyan-400/70 bg-cyan-500/20 text-cyan-100 shadow-[0_0_20px_rgba(34,211,238,0.18)]' : 'border-slate-700 bg-slate-950 text-slate-300 hover:-translate-y-0.5 hover:border-cyan-400/40 hover:text-cyan-200'}`}
                  >
                    {question.label || question.question_title || `Question ${question.id}`}
                  </button>
                );
              })}
            </div>

            {isShortTextQuestion ? (
              <div className="mt-5 rounded-2xl border border-cyan-500/25 bg-cyan-500/10 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">Live Word Cloud</p>
                  <button
                    type="button"
                    onClick={generateWordCloud}
                    disabled={isRefreshingSummary}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-400/45 bg-cyan-500/12 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100 transition-all hover:-translate-y-0.5 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    <span className={isRefreshingSummary ? 'animate-spin' : ''}>☁️</span>
                    Generate Word Cloud
                  </button>
                </div>
                <p className="mt-2 text-sm text-slate-300">Generate cloud only for the highlighted question tab.</p>
              </div>
            ) : null}
          </section>

          <section className="mb-6 rounded-3xl border border-slate-800/90 bg-slate-900/70 p-5 md:p-6">
            {isShortTextQuestion ? (
              <div className="space-y-4">
                <article className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold text-cyan-100">Word Cloud Output</h3>
                    <button
                      type="button"
                      onClick={() => setIsWordCloudMaximized(true)}
                      disabled={!wordCloud.length}
                      className="px-3 py-1.5 text-xs font-semibold text-cyan-400 bg-slate-900 border border-slate-800 rounded-lg hover:bg-slate-800 transition-all flex items-center space-x-1 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <span>Maximize Cloud</span>
                    </button>
                  </div>
                  {wordCloud.length ? (
                    <div className="mt-4 overflow-hidden rounded-2xl border border-slate-700 bg-slate-950/80">
                      <WordCloudComponent data={wordCloud} width={980} height={460} className="min-h-[280px]" />
                    </div>
                  ) : (
                    <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                      <p className="text-sm text-slate-400">Click Generate Word Cloud to render this question tab's keywords.</p>
                    </div>
                  )}
                </article>

                <button
                  type="button"
                  onClick={() => setIsResponsesPanelOpen(true)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-400/45 bg-cyan-500/15 px-4 py-3 text-sm font-semibold tracking-[0.04em] text-cyan-100 transition-all hover:-translate-y-0.5 hover:bg-cyan-500/25"
                >
                  See Individual Student Answers
                </button>
              </div>
            ) : null}

            {isEssayQuestion ? (
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => setIsResponsesPanelOpen(true)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-400/45 bg-cyan-500/15 px-4 py-3 text-sm font-semibold tracking-[0.04em] text-cyan-100 transition-all hover:-translate-y-0.5 hover:bg-cyan-500/25"
                >
                  See Individual Student Answers
                </button>
              </div>
            ) : null}

            {isMultipleChoiceQuestion ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
                  <h3 className="text-lg font-semibold text-slate-100">Selection Metrics</h3>
                  <p className="mt-2 text-sm text-slate-300">Local bar chart for the active question tab.</p>
                  <div className="mt-4 space-y-3">
                    {choiceMetrics.entries.length ? choiceMetrics.entries.map((item) => (
                      <div key={item.choice}>
                        <div className="mb-1 flex items-center justify-between text-xs text-slate-300">
                          <span>Choice {item.choice}</span>
                          <span>{item.count}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500"
                            style={{ width: `${choiceMetrics.maxCount ? Math.round((item.count / choiceMetrics.maxCount) * 100) : 0}%` }}
                          />
                        </div>
                      </div>
                    )) : (
                      <p className="text-sm text-slate-400">No choice selections received yet for this question.</p>
                    )}
                  </div>
                  <div className="mt-4 rounded-xl border border-slate-700 bg-slate-900/70 p-3 text-center">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Submissions</p>
                    <p className="mt-1 text-lg font-semibold text-white">{submissionCount}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsResponsesPanelOpen(true)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-400/45 bg-cyan-500/15 px-4 py-3 text-sm font-semibold tracking-[0.04em] text-cyan-100 transition-all hover:-translate-y-0.5 hover:bg-cyan-500/25"
                >
                  See Individual Student Answers
                </button>
              </div>
            ) : null}

            {(isShortTextQuestion || isEssayQuestion || isMultipleChoiceQuestion) ? (
              <article className="mt-4 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold text-cyan-100">🧠 Quick AI Class Summary</h3>
                  <button
                    type="button"
                    onClick={refreshAiSummary}
                    disabled={isRefreshingSummary}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-400/45 bg-cyan-500/12 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100 transition-all hover:-translate-y-0.5 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    <span className={isRefreshingSummary ? 'animate-spin' : ''}>📝</span>
                    Generate Quick Summary
                  </button>
                </div>
                <ul className="mt-4 space-y-2 text-sm text-cyan-50">
                  {activeSummaryPoints.slice(0, 5).map((gist, i) => (
                    <li key={`${activeQuestionId || 'none'}-summary-${i}`} className="flex items-start gap-2">
                      <span className="mt-1 text-cyan-300">•</span>
                      <span>{gist}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ) : null}

            {!isShortTextQuestion && !isEssayQuestion && !isMultipleChoiceQuestion ? (
              <div className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4 text-sm text-slate-300">
                Select a question to view the question-type specific analytics modules.
              </div>
            ) : null}
          </section>

          {!staticMode && (isShortTextQuestion || isEssayQuestion || isMultipleChoiceQuestion) ? (
            <section className="mb-6 rounded-3xl border border-slate-800/90 bg-slate-900/70 p-5 md:p-6">
              <div className="mb-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-cyan-300">Professor Assistant</p>
                <h4 className="mt-2 text-lg font-semibold text-white">Ask About Student Answers</h4>
                <p className="mt-2 text-xs text-slate-400">Scoped to active tab: {activeQuestion?.label || `Question ${activeQuestionId || '-'}`}</p>
              </div>

              <div className="max-h-72 space-y-3 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                {visiblePromptHistory.length ? visiblePromptHistory.map((item) => (
                  <div key={item.id || item.created_at} className="space-y-2">
                    <div className="rounded-xl border border-slate-700 bg-slate-900/80 p-3 text-sm text-slate-200">
                      <p className="mb-1 text-[10px] uppercase tracking-[0.2em] text-cyan-300">Professor Prompt</p>
                      <p>{item.prompt_text}</p>
                    </div>
                    <div className="rounded-xl border border-violet-500/25 bg-violet-500/10 p-3 text-sm text-violet-100">
                      <p className="mb-1 text-[10px] uppercase tracking-[0.2em] text-violet-300">AI Response</p>
                      {hasPedagogicalSections(item.response_text) ? (() => {
                        const formatted = parsePedagogicalSections(item.response_text);
                        return (
                          <div className="space-y-3 text-violet-100">
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
                        <p className="whitespace-pre-wrap text-violet-100">{stripTechnicalFragments(item.response_text)}</p>
                      )}
                    </div>
                  </div>
                )) : (
                  <p className="text-sm text-slate-500">No scoped assistant prompts yet for this question.</p>
                )}
              </div>

              <div className="mt-3 space-y-2">
                <input
                  type="text"
                  value={assistantPrompt}
                  onChange={(event) => setAssistantPrompt(event.target.value)}
                  placeholder="Ask a classroom question..."
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
                <p className="text-xs text-slate-400 mt-1">Updates every 4 seconds from the live analytics feed.</p>
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
                        <div className="bg-slate-950/60 p-3 rounded-xl max-h-72 overflow-y-auto space-y-3">
                          {Array.isArray(submission.answers) && submission.answers.length > 0 ? submission.answers.map((ans, index) => (
                            <div key={`${submission.submission_id}-${ans.question_id || index}`} className="p-3 rounded-xl border border-slate-800 bg-slate-900/70">
                              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                                Question: {ans.question_title || 'Unknown Question'}
                              </p>
                              <p className="mt-2 text-sm font-medium text-cyan-300 bg-slate-950 p-3 rounded-lg border border-slate-800/60">
                                Student Response:{' '}
                                <span className="text-slate-100">{String(ans.answer_text || '').trim() || 'No response provided'}</span>
                              </p>
                            </div>
                          )) : (
                            <div className="bg-slate-950/60 p-3 rounded-xl text-slate-300 text-sm italic whitespace-pre-wrap">
                              {submission.response_text}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              }) : (
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-400">
                  No individual submissions have arrived yet.
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

      {isWordCloudMaximized && (
        <div
          onClick={() => setIsWordCloudMaximized(false)}
          className="fixed inset-0 top-0 left-0 w-screen h-screen z-[999] flex items-center justify-center bg-slate-950/95 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-label="Expanded word cloud"
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="w-[90vw] h-[80vh] bg-slate-900/40 border border-slate-800 p-8 rounded-2xl shadow-2xl flex items-center justify-center relative"
          >
            <button
              type="button"
              onClick={() => setIsWordCloudMaximized(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white bg-slate-950 px-3 py-1 rounded-md text-sm border border-slate-800"
            >
              Minimize
            </button>

            <div className="w-full h-full flex items-center justify-center">
              {wordCloud.length ? (
                <WordCloudComponent data={wordCloud} width={1400} height={800} />
              ) : (
                <div className="flex h-full w-full items-center justify-center rounded-2xl border border-slate-800 bg-slate-950/70">
                  <p className="text-sm text-slate-400">Generate a word cloud first to view it in expanded mode.</p>
                </div>
              )}
            </div>
          </div>

          <p className="mt-6 text-lg font-medium text-slate-400 tracking-wide bg-slate-900/80 px-6 py-2 rounded-full border border-slate-800/50">
            Live Feedback Cloud • Click anywhere to return to panel
          </p>
        </div>
      )}
    </div>
  );
}