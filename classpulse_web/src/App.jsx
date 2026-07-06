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
    return <div className="min-h-screen bg-slate-950 text-slate-300 flex items-center justify-center">Restoring active exam session...</div>;
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
  const userRole = authState.user?.role;
  const isProfessor = userRole === 'professor';
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
  const [professorView, setProfessorView] = useState('live');

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
    return () => {
      window.removeEventListener('storage', handleStorageSync);
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
        setProfessorView('live');
      } catch {
        clearStoredActiveQuizId();
        clearStoredActiveQuizPayload();
        setPublishedQuizId(null);
      }
    };

    recoverProfessorQuiz();
  }, [isProfessor, publishedQuizId, activeQuiz]);

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
    setProfessorView('live');

    if (normalizedStatus === 'ACTIVE') {
      writeStoredActiveQuizId(normalizedQuizId);
      if (nextQuizPayload) {
        writeStoredActiveQuizPayload(nextQuizPayload);
      }
      return;
    }

    if (normalizedStatus === 'READY' || normalizedStatus === 'COMPLETED' || normalizedStatus === 'STOPPED') {
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

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/auth" element={<Navigate to="/login" replace />} />
      <Route
        path="/instructor"
        element={isProfessor ? (
          <div className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
            <div className="mx-auto flex max-w-7xl flex-col gap-6">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl">
                <p className="text-xs font-mono uppercase tracking-[0.3em] text-cyan-400">Live Class Controller</p>
                <h1 className="mt-2 text-3xl font-semibold text-white">Professor Control Center</h1>
                <p className="mt-2 max-w-2xl text-sm text-slate-400">Use the Quiz Publishing Panel to finalize questions and monitor live classroom analytics as submissions arrive.</p>

                <div className="mt-4 inline-flex rounded-xl border border-slate-700 bg-slate-950 p-1">
                  <button
                    type="button"
                    onClick={() => setProfessorView('live')}
                    className={`px-4 py-2 text-xs font-semibold uppercase tracking-wide rounded-lg transition-all ${professorView === 'live' ? 'bg-cyan-500 text-slate-950' : 'text-slate-300 hover:text-white'}`}
                  >
                    Live Console
                  </button>
                  <button
                    type="button"
                    onClick={() => setProfessorView('vault')}
                    className={`px-4 py-2 text-xs font-semibold uppercase tracking-wide rounded-lg transition-all ${professorView === 'vault' ? 'bg-cyan-500 text-slate-950' : 'text-slate-300 hover:text-white'}`}
                  >
                    📁 Assessment Vault & History
                  </button>
                </div>
              </div>

              {professorView === 'live' ? (
                <>
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
              ) : (
                <ProfessorHistoryVault />
              )}
            </div>
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
            <div className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100 flex items-center justify-center">
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
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}