import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import axios from 'axios';
import StudentQuizGateway from './StudentQuizGateway';
import QuestionPlayer from './QuestionPlayer';
import StudentScorecard from './StudentScorecard';
import QuizHeaderForm from './QuizHeaderForm';
import QuizCreator from './QuizCreator';
import ProfessorDashboard from './ProfessorDashboard';
import LiveAnalytics from './LiveAnalytics';

function AppRoutes() {
  const navigate = useNavigate();
  const [activeQuiz, setActiveQuiz] = useState(null);
  const [studentName, setStudentName] = useState('');
  const [submissionResult, setSubmissionResult] = useState(null);
  const [quizHeader, setQuizHeader] = useState({ title: '', timeLimit: 15, instructions: '' });
  const [activeQuestionList, setActiveQuestionList] = useState([]);
  const [publishedQuizId, setPublishedQuizId] = useState(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState('');

  const handleQuizLoaded = ({ quiz, studentName: enteredName }) => {
    setActiveQuiz(quiz);
    setStudentName(enteredName);
  };

  const handleSubmission = async (payload) => {
    try {
      const response = await axios.post('http://127.0.0.1:8000/api/submissions/', payload);
      setSubmissionResult(response.data);
      navigate('/scorecard');
    } catch (error) {
      console.error(error);
    }
  };

  const handleReset = () => {
    setActiveQuiz(null);
    setSubmissionResult(null);
    setStudentName('');
  };

  const handleHeaderSave = (headerData) => {
    setQuizHeader(headerData);
    setActiveQuiz((prev) => ({ ...(prev || {}), title: headerData.title, timeLimit: headerData.timeLimit, instructions: headerData.instructions }));
  };

  const handleSaveQuestion = (questionConfig) => {
    const normalizedQuestion = {
      order_index: activeQuestionList.length + 1,
      question_title: questionConfig.question_title || questionConfig.title || 'Untitled Question',
      question_text: questionConfig.question_text || questionConfig.questionText || '',
      question_type: questionConfig.question_type || questionConfig.type || 'multiple_choice_question',
      interaction_data: questionConfig.interaction_data || {},
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
          question_type: question.question_type || question.type,
          interaction_data: question.interaction_data || {},
        })),
      };

      const response = await axios.post('http://127.0.0.1:8000/api/quizzes/', payload);
      const publishedQuiz = response.data;
      setPublishedQuizId(publishedQuiz.id);
      setActiveQuiz((prev) => ({ ...(prev || {}), id: publishedQuiz.id, accessCode: publishedQuiz.access_code, title: publishedQuiz.title, timeLimit: publishedQuiz.time_limit_minutes, instructions: publishedQuiz.instructions }));
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
      <Route path="/" element={<Navigate to="/professor" replace />} />
      <Route
        path="/professor"
        element={
          <div className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
            <div className="mx-auto flex max-w-7xl flex-col gap-6">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl">
                <p className="text-xs font-mono uppercase tracking-[0.3em] text-cyan-400">ClassPulse Executive Studio</p>
                <h1 className="mt-2 text-3xl font-semibold text-white">Professor orchestration layer</h1>
                <p className="mt-2 max-w-2xl text-sm text-slate-400">Compiled questions now flow straight into the publish pipeline and live analytics update from the backend as submissions arrive.</p>
              </div>

              <QuizHeaderForm onSaveHeader={handleHeaderSave} />
              <QuizCreator onSaveQuestion={handleSaveQuestion} />
              <ProfessorDashboard
                activeQuiz={activeQuiz || quizHeader}
                onPublish={handlePublish}
                questionCount={activeQuestionList.length}
                isPublishing={isPublishing}
                publishError={publishError}
              />
              <LiveAnalytics quizId={publishedQuizId || activeQuiz?.id} />
            </div>
          </div>
        }
      />
      <Route path="/student" element={<StudentQuizGateway onQuizLoaded={handleQuizLoaded} />} />
      <Route path="/quiz/:id" element={<StudentQuizGateway onQuizLoaded={handleQuizLoaded} />} />
      <Route
        path="/player/:quizId"
        element={
          activeQuiz ? (
            <QuestionPlayer
              quiz={activeQuiz}
              studentName={studentName}
              onSubmit={handleSubmission}
            />
          ) : (
            <Navigate to="/student" replace />
          )
        }
      />
      <Route
        path="/scorecard"
        element={
          submissionResult ? (
            <div className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100 flex items-center justify-center">
              <StudentScorecard
                score={submissionResult.score}
                totalPoints={submissionResult.total_possible}
                studentName={submissionResult.student_name}
                quizTitle={activeQuiz?.title || 'Quiz'}
                onResetMock={handleReset}
              />
            </div>
          ) : (
            <Navigate to="/student" replace />
          )
        }
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