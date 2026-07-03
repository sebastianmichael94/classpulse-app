import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
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

const STUDENT_SESSION_KEY = 'classpulse.activeStudentSession';
const AUTH_SESSION_KEY = 'classpulse.authSession';

function readAuthSession() {
  try {
    const rawValue = localStorage.getItem(AUTH_SESSION_KEY);
    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue);
    if (!parsed?.token || !parsed?.user?.role) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

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

function AppRoutes() {
  const navigate = useNavigate();
  const authSession = readAuthSession();
  const userRole = authSession?.user?.role;
  const isProfessor = userRole === 'professor';
  const isStudent = userRole === 'student';
  const [activeQuiz, setActiveQuiz] = useState(null);
  const [studentName, setStudentName] = useState('');
  const [submissionResult, setSubmissionResult] = useState(null);
  const [isSessionHydrating, setIsSessionHydrating] = useState(true);
  const [quizHeader, setQuizHeader] = useState({ title: '', timeLimit: 15, instructions: '' });
  const [activeQuestionList, setActiveQuestionList] = useState([]);
  const [publishedQuizId, setPublishedQuizId] = useState(null);
  const [publishedQuizzes, setPublishedQuizzes] = useState([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState('');
  const [professorView, setProfessorView] = useState('live');

  useEffect(() => {
    const storedSession = readStoredStudentSession();

    if (storedSession?.quiz && storedSession?.studentName) {
      setActiveQuiz(storedSession.quiz);
      setStudentName(storedSession.studentName);
    }

    setIsSessionHydrating(false);
  }, []);

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

  const handleSaveQuestion = (questionConfig) => {
    const normalizedQuestion = {
      order_index: activeQuestionList.length + 1,
      question_title: questionConfig.question_title || questionConfig.title || 'Untitled Question',
      question_text: questionConfig.question_text || questionConfig.questionText || '',
      question_image: questionConfig.question_image || null,
      question_image_url: questionConfig.question_image_url || questionConfig.question_image || null,
      question_type: questionConfig.question_type || questionConfig.type || 'Multiple Choice',
      interaction_data: questionConfig.interaction_data || {},
      allow_peer_upvoting: Boolean(questionConfig.allow_peer_upvoting),
    };

    setActiveQuestionList((prev) => [...prev, normalizedQuestion]);
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
        instructions: quizHeader.instructions || '',
        status: 'PUBLISHED',
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

      const authSession = readAuthSession();
      const authHeaders = authSession?.token ? { Authorization: `Token ${authSession.token}` } : undefined;
      const response = await axios.post('http://127.0.0.1:8000/api/quizzes/', payload, {
        headers: authHeaders,
      });
      const publishedQuiz = normalizeQuizPayload(response.data);
      setPublishedQuizId(publishedQuiz.id);
      setActiveQuiz(publishedQuiz);
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
                <p className="text-xs font-mono uppercase tracking-[0.3em] text-cyan-400">ClassPulse Executive Studio</p>
                <h1 className="mt-2 text-3xl font-semibold text-white">Professor orchestration layer</h1>
                <p className="mt-2 max-w-2xl text-sm text-slate-400">Compiled questions now flow straight into the publish pipeline and live analytics update from the backend as submissions arrive.</p>

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
                  <QuizCreator onSaveQuestion={handleSaveQuestion} />
                  <ProfessorDashboard
                    activeQuiz={activeQuiz || quizHeader}
                    onPublish={handlePublish}
                    questionCount={activeQuestionList.length}
                    isPublishing={isPublishing}
                    publishError={publishError}
                    publishedQuizzes={publishedQuizzes}
                  />
                  <LiveAnalytics quizId={publishedQuizId || activeQuiz?.id} />
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
      <Route path="/student" element={isStudent ? <StudentGateway onQuizLoaded={handleQuizLoaded} /> : <Navigate to="/login?role=student" replace />} />
      <Route path="/quiz/:id" element={isStudent ? <StudentGateway onQuizLoaded={handleQuizLoaded} /> : <Navigate to="/login?role=student" replace />} />
      <Route
        path="/player/:quizId"
        element={isStudent ? (
          <ExamRoute
            activeQuiz={activeQuiz}
            studentName={studentName}
            onSubmitSuccess={handleSubmissionSuccess}
            isSessionHydrating={isSessionHydrating}
          />
        ) : (
          <Navigate to="/login?role=student" replace />
        )}
      />
      <Route
        path="/scorecard"
        element={isStudent ? (
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
        ) : (
          <Navigate to="/login?role=student" replace />
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