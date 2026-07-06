import React, { useMemo, useState } from 'react';
import axios from 'axios';
import LatexText from './LatexText';
import { API_BASE_URL, buildAuthHeaders } from './apiClient';

export default function ExamPlayer({ quiz, studentName, onSubmitSuccess }) {
  const [answers, setAnswers] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const questions = useMemo(() => quiz?.questions || [], [quiz]);
  const currentQuestion = questions[currentIndex];
  const currentQuestionImage = currentQuestion?.question_image_url || currentQuestion?.question_image || '';

  const updateAnswer = (questionId, value) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError('');

    try {
      const payload = {
        quiz: quiz.id,
        student_name: studentName,
        answers: questions.map((question) => ({
          question_id: question.id,
          question_type: question.question_type,
          answer: answers[question.id] ?? '',
        })),
      };

      const response = await axios.post(`${API_BASE_URL}/api/submissions/`, payload, {
        headers: buildAuthHeaders(),
      });
      onSubmitSuccess?.(response.data);
    } catch (err) {
      setError('Submission failed. Please try again.');
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!currentQuestion) {
    return <div className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">No questions available.</div>;
  }

  const renderInput = () => {
    const value = answers[currentQuestion.id] ?? '';
    const questionType = String(currentQuestion.question_type || '').trim();

    switch (questionType) {
      case 'Multiple Choice':
      case 'multiple_choice_question':
        return (
          <div className="space-y-3">
            {(currentQuestion.interaction_data?.options || []).map((option, index) => (
              <label key={index} className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-sm text-slate-200">
                <input
                  type="radio"
                  name={currentQuestion.id}
                  checked={value === option}
                  onChange={() => updateAnswer(currentQuestion.id, option)}
                  className="h-4 w-4 border-slate-500 bg-slate-950 text-cyan-500"
                />
                <span><LatexText text={option} /></span>
              </label>
            ))}
          </div>
        );
      case 'True/False':
      case 'true_false_question':
        return (
          <div className="space-y-3">
            {['True', 'False'].map((option) => (
              <label key={option} className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-sm text-slate-200">
                <input
                  type="radio"
                  name={currentQuestion.id}
                  checked={value === option}
                  onChange={() => updateAnswer(currentQuestion.id, option)}
                  className="h-4 w-4 border-slate-500 bg-slate-950 text-cyan-500"
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
        );
      case 'Essay Question':
        return (
          <textarea
            rows={8}
            value={value}
            onChange={(e) => updateAnswer(currentQuestion.id, e.target.value)}
            className="min-h-[220px] w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-400"
            placeholder="Type your detailed explanation here..."
          />
        );
      case 'Formula Question':
      case 'formula_question':
      case 'Numerical Answer':
        return (
          <input
            type="number"
            value={value}
            onChange={(e) => updateAnswer(currentQuestion.id, e.target.value)}
            className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-400"
            placeholder="Enter numeric response"
          />
        );
      case 'Fill In the Blank':
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => updateAnswer(currentQuestion.id, e.target.value)}
            className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-400"
            placeholder="Type your answer"
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
      <div className="mx-auto max-w-4xl rounded-3xl border border-slate-800 bg-slate-900/95 p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">Question {currentIndex + 1} of {questions.length}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
          {currentQuestionImage ? (
            <div className="mb-5 overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/50">
              <img
                src={currentQuestionImage}
                alt="Question reference"
                className="h-auto max-h-80 w-full object-contain bg-slate-950"
              />
            </div>
          ) : null}

          <h2 className="text-2xl font-semibold text-white"><LatexText text={currentQuestion.question_title} /></h2>
          <p className="text-lg leading-8 text-slate-200"><LatexText text={currentQuestion.question_text} /></p>
          <div className="mt-6">{renderInput()}</div>
        </div>

        {error ? <p className="mt-4 text-sm text-rose-400">{error}</p> : null}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={handlePrev}
            disabled={currentIndex === 0}
            className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>

          {currentIndex < questions.length - 1 ? (
            <button
              onClick={handleNext}
              className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950"
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? 'Submitting…' : 'Submit Exam'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
