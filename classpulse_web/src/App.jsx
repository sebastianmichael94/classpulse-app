import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import LandingPage from './LandingPage';
import Login from './Login';
import Register from './Register';
import StudentGateway from './StudentGateway';
import ExamPlayer from './ExamPlayer';
import StudentScorecard from './StudentScorecard';
import QuizHeaderForm from './QuizHeaderForm';
import QuizCreator from './QuizCreator';
import ProfessorDashboard from './ProfessorDashboard';
import LiveAnalytics from './LiveAnalytics';
import ProfessorHistoryVault from './ProfessorHistoryVault';
import {
  AUTH_SESSION_KEY,
  API_BASE_URL,
  authFetch,
  buildAuthHeaders,
  initializeHttpAuthFromStorage,
  readAuthSession,
  setupAxiosAuthInterceptor,
} from './apiClient';

const STUDENT_SESSION_KEY = 'classpulse.activeStudentSession';
const ACTIVE_QUIZ_KEY = 'classpulse.activeQuizId';
const ACTIVE_QUIZ_PAYLOAD_KEY = 'classpulse.activeQuizPayload';

setupAxiosAuthInterceptor();
initializeHttpAuthFromStorage();

function normalizeQuizPayload(quiz) {
  if (!quiz) {
    return null;
  }

  const normalizedQuestions = Array.isArray(quiz.questions)
    ? quiz.questions.map((question, index) => ({
        id: question.id || `${quiz.id || 'draft'}-${index}`,
        order_index: question.order_index ?? index + 1,
        question_title: question.question_title || question.questionTitle || 'Untitled Question',
        question_text: question.question_text || question.questionText || '',
        question_image: question.question_image || question.questionImage || null,
        question_image_url: question.question_image_url || question.questionImageUrl || question.question_image || question.questionImage || null,
        question_type: question.question_type || question.questionType || 'Multiple Choice',
        interaction_data: question.interaction_data || question.interactionData || {},
        allow_peer_upvoting: Boolean(question.allow_peer_upvoting),
      }))
    : [];

  return {
    ...quiz,
    access_code: quiz.access_code ?? quiz.accessCode ?? '',
    time_limit_minutes: quiz.time_limit_minutes ?? quiz.timeLimit ?? 15,
    questions: normalizedQuestions,
  };
}

function readStoredStudentSession() {
  try {
    const rawValue = localStorage.getItem(STUDENT_SESSION_KEY);
    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue);
    if (!parsed?.quiz || !parsed?.studentName || !parsed?.quizId) {
      return null;
    }

    return {
      ...parsed,
      quiz: normalizeQuizPayload(parsed.quiz),
    };
  } catch {
    return null;
  }
}

function writeStoredStudentSession({ quiz, studentName }) {
  const normalizedQuiz = normalizeQuizPayload(quiz);
  const payload = {
    quiz: normalizedQuiz,
    studentName,
    quizId: normalizedQuiz?.id,
    savedAt: new Date().toISOString(),
  };

  localStorage.setItem(STUDENT_SESSION_KEY, JSON.stringify(payload));
}

function clearStoredStudentSession() {
  localStorage.removeItem(STUDENT_SESSION_KEY);
}

function readStoredActiveQuizId() {
  try {
    const value = localStorage.getItem(ACTIVE_QUIZ_KEY);
    return value ? String(value).trim() : null;
  } catch {
    return null;
  }
}

function writeStoredActiveQuizId(quizId) {
  const normalizedQuizId = String(quizId || '').trim();
  if (!normalizedQuizId) {
    return;
  }

  localStorage.setItem(ACTIVE_QUIZ_KEY, normalizedQuizId);
}

function clearStoredActiveQuizId() {
  localStorage.removeItem(ACTIVE_QUIZ_KEY);
}

function readStoredActiveQuizPayload() {
  try {
    const rawValue = localStorage.getItem(ACTIVE_QUIZ_PAYLOAD_KEY);
    if (!rawValue) {
      return null;
    }

    return normalizeQuizPayload(JSON.parse(rawValue));
  } catch {
    return null;
  }
}

function writeStoredActiveQuizPayload(quiz) {
  const normalizedQuiz = normalizeQuizPayload(quiz);
  if (!normalizedQuiz?.id) {
    return;
  }

  localStorage.setItem(ACTIVE_QUIZ_PAYLOAD_KEY, JSON.stringify(normalizedQuiz));
}

function clearStoredActiveQuizPayload() {
  localStorage.removeItem(ACTIVE_QUIZ_PAYLOAD_KEY);
}

function ExamRoute({ activeQuiz, studentName, onSubmitSuccess, isSessionHydrating }) {
  const { quizId } = useParams();

  if (isSessionHydrating) {
    return <div className="min-h-screen bg-slate-50 text-slate-600 flex items-center justify-center dark:bg-slate-950 dark:text-slate-300">Restoring active exam session...</div>;
  }

  if (!activeQuiz || String(activeQuiz?.id) !== String(quizId)) {
    return <Navigate to="/student" replace />;
  }

  return <ExamPlayer quiz={activeQuiz} studentName={studentName} onSubmitSuccess={onSubmitSuccess} />;
}

function getInitialAuthState() {
  const session = readAuthSession();
  const isAuthenticated = Boolean(session?.token);

  return {
    session,
    isAuthenticated,
    user: session?.user || null,
  };
}

function AppRoutes() {
  const navigate = useNavigate();
  const location = useLocation();
  const [authState, setAuthState] = useState(() => getInitialAuthState());
  const liveToken = String(localStorage.getItem('token') || '').trim();
  let liveUser = null;
  try {
    liveUser = JSON.parse(localStorage.getItem('user') || 'null');
  } catch {
    liveUser = null;
  }

  const liveSession = readAuthSession();
  const effectiveUser = liveSession?.user || liveUser || authState.user;
  const effectiveToken = liveSession?.token || liveToken || authState.session?.token;
  const userRole = effectiveUser?.role;
  const isProfessor = userRole === 'professor' && Boolean(effectiveToken);
  const [activeQuiz, setActiveQuiz] = useState(() => readStoredActiveQuizPayload());
  const [studentName, setStudentName] = useState('');
  const [submissionResult, setSubmissionResult] = useState(null);
  const [isSessionHydrating, setIsSessionHydrating] = useState(true);
  const [quizHeader, setQuizHeader] = useState({ title: '', timeLimit: 15, instructions: '' });
  const [activeQuestionList, setActiveQuestionList] = useState([]);
  const [publishedQuizId, setPublishedQuizId] = useState(() => readStoredActiveQuizId());
  const [publishedQuizzes, setPublishedQuizzes] = useState([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState('');
  const [activeTab, setActiveTab] = useState('welcome');

  useEffect(() => {
    const fetchQuizHistory = async () => {
      if (!isProfessor) {
        setPublishedQuizzes([]);
        return;
      }

      try {
        const response = await axios.get(`${API_BASE_URL}/api/quizzes/`, {
          headers: buildAuthHeaders(),
        });

        const payload = response?.data;
        const historyItems = Array.isArray(payload)
          ? payload
          : (Array.isArray(payload?.results) ? payload.results : []);

        const normalizedHistory = historyItems
          .map((quiz) => normalizeQuizPayload(quiz))
          .filter(Boolean);

        setPublishedQuizzes(normalizedHistory);
      } catch (err) {
        console.error('Failed to load quiz history', err);
      }
    };

    fetchQuizHistory();
  }, [isProfessor]);

  useEffect(() => {
    initializeHttpAuthFromStorage();
    const nextAuthState = getInitialAuthState();

    setAuthState((prev) => {
      const previousToken = String(prev?.session?.token || '');
      const nextToken = String(nextAuthState?.session?.token || '');
      const previousRole = String(prev?.user?.role || '');
      const nextRole = String(nextAuthState?.user?.role || '');

      if (
        prev?.isAuthenticated === nextAuthState.isAuthenticated
        && previousToken === nextToken
        && previousRole === nextRole
      ) {
        return prev;
      }

      return nextAuthState;
    });
  }, [location.pathname]);

  useEffect(() => {
    const handleStorageSync = (event) => {
      if (event.key && event.key !== AUTH_SESSION_KEY && event.key !== ACTIVE_QUIZ_KEY && event.key !== ACTIVE_QUIZ_PAYLOAD_KEY) {
        return;
      }

      initializeHttpAuthFromStorage();
      setAuthState(getInitialAuthState());

      if (!event.key || event.key === ACTIVE_QUIZ_KEY) {
        setPublishedQuizId(readStoredActiveQuizId());
      }

      if (!event.key || event.key === ACTIVE_QUIZ_PAYLOAD_KEY) {
        setActiveQuiz(readStoredActiveQuizPayload());
      }
    };

    window.addEventListener('storage', handleStorageSync);
    window.addEventListener('classpulse-auth-updated', handleStorageSync);
    return () => {
      window.removeEventListener('storage', handleStorageSync);
      window.removeEventListener('classpulse-auth-updated', handleStorageSync);
    };
  }, []);

  useEffect(() => {
    const storedSession = readStoredStudentSession();
    const storedProfessorQuiz = readStoredActiveQuizPayload();

    if (storedSession?.quiz && storedSession?.studentName) {
      setActiveQuiz(storedSession.quiz);
      setStudentName(storedSession.studentName);
    } else if (storedProfessorQuiz) {
      setActiveQuiz(storedProfessorQuiz);
    }

    setIsSessionHydrating(false);
  }, []);

  useEffect(() => {
    const recoverProfessorQuiz = async () => {
      if (!isProfessor || !publishedQuizId) {
        return;
      }

      if (activeQuiz && String(activeQuiz?.id) === String(publishedQuizId)) {
        return;
      }

      try {
        const response = await authFetch(`${API_BASE_URL}/api/quizzes/${publishedQuizId}/`);
        if (!response.ok) {
          throw new Error('Unable to restore active quiz context.');
        }

        const payload = await response.json();
        const normalizedQuiz = normalizeQuizPayload(payload);
        setActiveQuiz(normalizedQuiz);
        writeStoredActiveQuizPayload(normalizedQuiz);
        setActiveTab('host');
      } catch {
        clearStoredActiveQuizId();
        clearStoredActiveQuizPayload();
        setPublishedQuizId(null);
      }
    };

    recoverProfessorQuiz();
  }, [isProfessor, publishedQuizId, activeQuiz]);

  useEffect(() => {
    const recoverLatestProfessorQuizFromHistory = async () => {
      if (!isProfessor || publishedQuizId || activeQuiz?.id) {
        return;
      }

      try {
        const historyResponse = await authFetch(`${API_BASE_URL}/api/professor/quizzes/history/`);
        if (!historyResponse.ok) {
          return;
        }

        const historyPayload = await historyResponse.json().catch(() => ({}));
        const historyItems = Array.isArray(historyPayload?.history) ? historyPayload.history : [];
        const candidate = historyItems.find((quiz) => {
          const status = String(quiz?.status || '').toUpperCase();
          return status === 'READY' || status === 'ACTIVE';
        });

        if (!candidate?.id) {
          return;
        }

        const quizResponse = await authFetch(`${API_BASE_URL}/api/quizzes/${candidate.id}/`);
        if (!quizResponse.ok) {
          return;
        }

        const quizPayload = await quizResponse.json();
        const normalizedQuiz = normalizeQuizPayload(quizPayload);
        setActiveQuiz(normalizedQuiz);
        setPublishedQuizId(String(normalizedQuiz.id));
        writeStoredActiveQuizId(String(normalizedQuiz.id));
        writeStoredActiveQuizPayload(normalizedQuiz);
        setActiveTab('host');
      } catch {
        // Graceful no-op: history recovery is a best-effort safety net.
      }
    };

    recoverLatestProfessorQuizFromHistory();
  }, [isProfessor, publishedQuizId, activeQuiz?.id]);

  const handleQuizLoaded = ({ quiz, studentName: enteredName }) => {
    const normalizedQuiz = normalizeQuizPayload(quiz);
    setActiveQuiz(normalizedQuiz);
    setStudentName(enteredName);
    writeStoredStudentSession({ quiz: normalizedQuiz, studentName: enteredName });
  };

  const handleSubmissionSuccess = (result) => {
    clearStoredStudentSession();
    setSubmissionResult(result);
    navigate('/scorecard');
  };

  const handleReset = () => {
    clearStoredStudentSession();
    setActiveQuiz(null);
    setSubmissionResult(null);
    setStudentName('');
  };

  const handleLiveQuizSessionStateChange = ({ quizId, status, startedAt, durationMinutes }) => {
    const normalizedQuizId = String(quizId || '').trim();
    const normalizedStatus = String(status || '').trim().toUpperCase();

    if (!normalizedQuizId) {
      return;
    }

    let nextQuizPayload = null;
    setActiveQuiz((prev) => {
      if (!prev || String(prev?.id) !== normalizedQuizId) {
        return prev;
      }

      nextQuizPayload = {
        ...prev,
        status: normalizedStatus,
        quiz_status: normalizedStatus,
        started_at: startedAt === undefined ? prev.started_at : startedAt,
        duration_minutes: durationMinutes === undefined ? prev.duration_minutes : durationMinutes,
      };

      return nextQuizPayload;
    });

    setPublishedQuizId(normalizedQuizId);
  setActiveTab('host');

    if (normalizedStatus === 'ACTIVE') {
      writeStoredActiveQuizId(normalizedQuizId);
      if (nextQuizPayload) {
        writeStoredActiveQuizPayload(nextQuizPayload);
      }
      return;
    }

    if (normalizedStatus === 'COMPLETED' || normalizedStatus === 'STOPPED') {
      if (String(readStoredActiveQuizId() || '') === normalizedQuizId) {
        clearStoredActiveQuizId();
        clearStoredActiveQuizPayload();
      }
    }
  };

  const handleHeaderSave = (headerData) => {
    setQuizHeader(headerData);
    setActiveQuiz((prev) => ({
      ...(prev || {}),
      title: headerData.title,
      time_limit_minutes: Number(headerData.timeLimit || 15),
      instructions: headerData.instructions,
      questions: prev?.questions || activeQuestionList,
    }));
  };

  const handleSaveQuestion = (questionConfig, editIndex = null) => {
    const normalizedQuestion = {
      order_index: 1,
      question_title: questionConfig.question_title || questionConfig.title || 'Untitled Question',
      question_text: questionConfig.question_text || questionConfig.questionText || '',
      question_image: questionConfig.question_image || null,
      question_image_url: questionConfig.question_image_url || questionConfig.question_image || null,
      question_type: questionConfig.question_type || questionConfig.type || 'Multiple Choice',
      interaction_data: questionConfig.interaction_data || {},
      allow_peer_upvoting: Boolean(questionConfig.allow_peer_upvoting),
    };

    setActiveQuestionList((prev) => {
      const next = [...prev];
      if (Number.isInteger(editIndex) && editIndex >= 0 && editIndex < next.length) {
        next[editIndex] = {
          ...next[editIndex],
          ...normalizedQuestion,
        };
      } else {
        next.push(normalizedQuestion);
      }

      return next.map((item, index) => ({
        ...item,
        order_index: index + 1,
      }));
    });
  };

  const handleDeleteQuestion = (deleteIndex) => {
    setActiveQuestionList((prev) => (
      prev
        .filter((_, index) => index !== deleteIndex)
        .map((item, index) => ({
          ...item,
          order_index: index + 1,
        }))
    ));
  };

  const handleReorderQuestion = (fromIndex, toIndex) => {
    setActiveQuestionList((prev) => {
      if (
        fromIndex === toIndex
        || fromIndex < 0
        || toIndex < 0
        || fromIndex >= prev.length
        || toIndex >= prev.length
      ) {
        return prev;
      }

      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);

      return next.map((item, index) => ({
        ...item,
        order_index: index + 1,
      }));
    });
  };

  const handlePublish = async () => {
    if (!quizHeader.title || activeQuestionList.length === 0) {
      setPublishError('Add a quiz title and at least one compiled question before publishing.');
      return;
    }

    setIsPublishing(true);
    setPublishError('');

    try {
      const payload = {
        title: quizHeader.title,
        time_limit_minutes: Number(quizHeader.timeLimit || 15),
        duration_minutes: Number(quizHeader.timeLimit || 15),
        instructions: quizHeader.instructions || '',
        status: 'READY',
        questions: activeQuestionList.map((question, index) => ({
          order_index: index + 1,
          question_title: question.question_title || question.title,
          question_text: question.question_text || question.questionText,
          question_image: question.question_image || question.question_image_url || null,
          question_type: question.question_type || question.type,
          interaction_data: question.interaction_data || {},
          allow_peer_upvoting: Boolean(question.allow_peer_upvoting),
        })),
      };

      const response = await axios.post(`${API_BASE_URL}/api/quizzes/`, payload, {
        headers: buildAuthHeaders(),
      });
      const publishedQuiz = normalizeQuizPayload(response.data);
      setPublishedQuizId(publishedQuiz.id);
      setActiveQuiz(publishedQuiz);
      writeStoredActiveQuizId(publishedQuiz.id);
      writeStoredActiveQuizPayload(publishedQuiz);
      setPublishedQuizzes((prev) => {
        const withoutCurrent = prev.filter((quiz) => String(quiz.id) !== String(publishedQuiz.id));
        return [publishedQuiz, ...withoutCurrent];
      });
      setActiveQuestionList([]);
    } catch (error) {
      console.error(error);
      setPublishError(error?.response?.data?.detail || 'Publishing failed.');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleLaunchQuizFromHistory = async (quizRecord) => {
    const quizId = String(quizRecord?.id || '').trim();
    if (!quizId) {
      return;
    }

    try {
      const response = await authFetch(`${API_BASE_URL}/api/quizzes/${quizId}/`);
      if (!response.ok) {
        throw new Error('Unable to open this saved quiz right now.');
      }

      const payload = await response.json();
      const normalizedQuiz = normalizeQuizPayload(payload);
      if (!normalizedQuiz?.id) {
        throw new Error('Quiz payload is incomplete.');
      }

      setActiveQuiz(normalizedQuiz);
      setPublishedQuizId(String(normalizedQuiz.id));
      writeStoredActiveQuizId(String(normalizedQuiz.id));
      writeStoredActiveQuizPayload(normalizedQuiz);
      setActiveTab('host');

      const startResponse = await authFetch(`${API_BASE_URL}/api/quizzes/start/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quiz_id: normalizedQuiz.id,
          access_code: normalizedQuiz.access_code || undefined,
        }),
      });

      if (startResponse.ok) {
        const startPayload = await startResponse.json().catch(() => ({}));
        handleLiveQuizSessionStateChange({
          quizId: startPayload.quiz_id || normalizedQuiz.id,
          status: startPayload.status || 'ACTIVE',
          startedAt: startPayload.started_at || new Date().toISOString(),
          durationMinutes: Number(startPayload.duration_minutes || normalizedQuiz.duration_minutes || normalizedQuiz.time_limit_minutes || 10) || 10,
        });
      }

      navigate('/instructor', { replace: true });
    } catch (err) {
      setPublishError(err.message || 'Unable to launch this quiz.');
    }
  };

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/auth" element={<Navigate to="/login" replace />} />
      <Route
        path="/instructor"
        element={isProfessor ? (
          <div className="flex w-full min-h-screen bg-slate-50 text-slate-900 font-sans dark:bg-slate-950 dark:text-slate-100">
            <aside className="w-64 min-h-screen bg-slate-900 border-r border-slate-800 p-6 flex flex-col space-y-2 flex-shrink-0 text-slate-100">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-400">Instructor Workspace</p>
                <h2 className="mt-2 text-xl font-semibold text-white">Dr. Reshma Panel</h2>
              </div>

              <button
                type="button"
                onClick={() => setActiveTab('welcome')}
                className={`w-full rounded-xl border px-3 py-3 text-left text-sm font-semibold transition-all ${activeTab === 'welcome' ? 'border-cyan-400/30 bg-cyan-500 text-slate-950' : 'border-slate-800 bg-slate-950/70 text-slate-300 hover:text-white hover:bg-slate-900'}`}
              >
                Welcome Home
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('host')}
                className={`w-full rounded-xl border px-3 py-3 text-left text-sm font-semibold transition-all ${activeTab === 'host' ? 'border-cyan-400/30 bg-cyan-500 text-slate-950' : 'border-slate-800 bg-slate-950/70 text-slate-300 hover:text-white hover:bg-slate-900'}`}
              >
                Host a New Quiz
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className={`w-full rounded-xl border px-3 py-3 text-left text-sm font-semibold transition-all ${activeTab === 'history' ? 'border-cyan-400/30 bg-cyan-500 text-slate-950' : 'border-slate-800 bg-slate-950/70 text-slate-300 hover:text-white hover:bg-slate-900'}`}
              >
                Hosted Quizzes History
              </button>
            </aside>

            <main className="flex-1 p-8 bg-slate-50 dark:bg-slate-950 overflow-y-auto min-h-screen transition-colors duration-200">
              <div className="mx-auto flex max-w-7xl flex-col gap-6">
                {activeTab === 'welcome' ? (
                  <section className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
                    <p className="text-xs uppercase tracking-[0.3em] text-cyan-500 dark:text-cyan-300">Instructor Greeting</p>
                    <h1 className="mt-3 text-3xl font-semibold text-slate-900 md:text-4xl dark:text-slate-100">Welcome back, Dr. Reshma Menon</h1>
                    <p className="mt-3 max-w-2xl text-sm text-slate-500 dark:text-slate-400">Start a fresh classroom session or jump into historical analytics with one click.</p>

                    <div className="mt-8 grid gap-4 md:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => setActiveTab('host')}
                        className="p-6 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl hover:border-cyan-500 transition-all text-left block w-full"
                      >
                        <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-500 dark:text-cyan-300">Quick Action</p>
                        <p className="text-lg font-bold text-slate-800 dark:text-slate-200 mt-2">Host a Live Session</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Build, publish, and launch your next quiz instantly.</p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveTab('history')}
                        className="p-6 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl hover:border-cyan-500 transition-all text-left block w-full"
                      >
                        <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-500 dark:text-cyan-300">Quick Action</p>
                        <p className="text-lg font-bold text-slate-800 dark:text-slate-200 mt-2">Review Past Analytics</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Open archived quizzes and relaunch sessions with metrics.</p>
                      </button>
                    </div>
                  </section>
                ) : null}

                {activeTab === 'host' ? (
                  <>
                    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-2xl">
                      <p className="text-xs font-mono uppercase tracking-[0.3em] text-cyan-400">Live Class Controller</p>
                      <h1 className="mt-2 text-3xl font-semibold text-slate-900 dark:text-white">Professor Control Center</h1>
                      <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400">Use the Quiz Publishing Panel to finalize questions and monitor live classroom analytics as submissions arrive.</p>
                    </div>
                    <QuizHeaderForm onSaveHeader={handleHeaderSave} />
                    <QuizCreator
                      onSaveQuestion={handleSaveQuestion}
                      questionList={activeQuestionList}
                      onDeleteQuestion={handleDeleteQuestion}
                      onReorderQuestion={handleReorderQuestion}
                    />
                    <ProfessorDashboard
                      activeQuiz={activeQuiz || quizHeader}
                      draftQuestions={activeQuestionList}
                      onPublish={handlePublish}
                      onLaunchQuiz={handleLaunchQuizFromHistory}
                      questionCount={activeQuestionList.length}
                      isPublishing={isPublishing}
                      publishError={publishError}
                      publishedQuizzes={publishedQuizzes}
                    />
                    <LiveAnalytics
                      quizId={publishedQuizId || activeQuiz?.id}
                      accessCode={activeQuiz?.access_code || activeQuiz?.accessCode || ''}
                      onSessionStateChange={handleLiveQuizSessionStateChange}
                      initialSessionStatus={activeQuiz?.status || activeQuiz?.quiz_status || 'READY'}
                      initialStartedAt={activeQuiz?.started_at || null}
                      initialDurationMinutes={activeQuiz?.duration_minutes || activeQuiz?.time_limit_minutes || activeQuiz?.timeLimit || 10}
                    />
                  </>
                ) : null}

                {activeTab === 'history' ? (
                  <ProfessorHistoryVault onLaunchQuiz={handleLaunchQuizFromHistory} />
                ) : null}
              </div>
            </main>
          </div>
        ) : (
          <Navigate to="/login?role=professor" replace />
        )}
      />
      <Route path="/professor" element={<Navigate to="/instructor" replace />} />
      <Route
        path="/live-analytics"
        element={isProfessor ? <Navigate to="/instructor" replace /> : <Navigate to="/login?role=professor" replace />}
      />
      <Route path="/student" element={<StudentGateway onQuizLoaded={handleQuizLoaded} />} />
      <Route path="/quiz/:id" element={<StudentGateway onQuizLoaded={handleQuizLoaded} />} />
      <Route
        path="/player/:quizId"
        element={(
          <ExamRoute
            activeQuiz={activeQuiz}
            studentName={studentName}
            onSubmitSuccess={handleSubmissionSuccess}
            isSessionHydrating={isSessionHydrating}
          />
        )}
      />
      <Route
        path="/scorecard"
        element={(
          submissionResult ? (
            <div className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900 flex items-center justify-center dark:bg-slate-950 dark:text-slate-100">
              <StudentScorecard
                score={submissionResult.score}
                totalPoints={submissionResult.total_possible}
                studentName={submissionResult.student_name}
                quizTitle={activeQuiz?.title || 'Quiz'}
                quizId={submissionResult.quiz || activeQuiz?.id}
                onResetMock={handleReset}
              />
            </div>
          ) : (
            <Navigate to="/student" replace />
          )
        )}
      />
    </Routes>
  );
}

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((currentTheme) => (currentTheme === 'dark' ? 'light' : 'dark'));

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-200">
      <button
        onClick={toggleTheme}
        className="fixed top-4 right-4 z-50 px-3 py-1.5 rounded-full border text-xs font-semibold backdrop-blur-md transition-all duration-200 dark:bg-slate-900/80 dark:text-slate-200 dark:border-slate-800 dark:hover:bg-slate-800 bg-white/90 text-slate-800 border-slate-200 hover:bg-slate-100 shadow-sm"
      >
        {theme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode'}
      </button>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </div>
  );
}