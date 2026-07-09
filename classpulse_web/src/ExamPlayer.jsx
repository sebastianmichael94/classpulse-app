import React, { useMemo, useState } from 'react';
import axios from 'axios';
import LatexText from './LatexText';
import { API_BASE_URL, buildAuthHeaders } from './apiClient';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select';
import { Spinner } from './components/ui/spinner';

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

  const normalizeChoiceOptions = (rawOptions, fallbackTrueFalse = false) => {
    const options = Array.isArray(rawOptions) ? rawOptions : [];

    if (!options.length && fallbackTrueFalse) {
      return [
        { id: 'A', text: 'True', image_url: null },
        { id: 'B', text: 'False', image_url: null },
      ];
    }

    return options.map((option, index) => {
      if (option && typeof option === 'object' && !Array.isArray(option)) {
        return {
          id: String(option.id || String.fromCharCode(65 + index)).trim(),
          text: String(option.text || '').trim(),
          image_url: option.image_url ? String(option.image_url).trim() : null,
        };
      }

      return {
        id: String.fromCharCode(65 + index),
        text: String(option || '').trim(),
        image_url: null,
      };
    });
  };

  const isChoiceSelected = (selectedValue, choice) => {
    const selectedText = String(selectedValue || '').trim();
    if (!selectedText) {
      return false;
    }

    return selectedText === String(choice.id || '').trim() || selectedText === String(choice.text || '').trim();
  };

  const normalizeMatchingItems = (rawItems, prefix = 'L') => {
    const items = Array.isArray(rawItems) ? rawItems : [];
    return items.map((item, index) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        return {
          id: String(item.id || `${prefix}${index + 1}`).trim() || `${prefix}${index + 1}`,
          text: String(item.text || '').trim(),
          image_url: item.image_url ? String(item.image_url).trim() : null,
        };
      }

      return {
        id: `${prefix}${index + 1}`,
        text: String(item || '').trim(),
        image_url: null,
      };
    });
  };

  const updateMatchingAnswer = (questionId, leftId, rightId) => {
    setAnswers((prev) => {
      const existing = prev[questionId] && typeof prev[questionId] === 'object' && !Array.isArray(prev[questionId])
        ? prev[questionId]
        : {};

      return {
        ...prev,
        [questionId]: {
          ...existing,
          [leftId]: rightId,
        },
      };
    });
  };

  const handleOptionSelect = (questionId, optionValue) => {
    // Immediate local state update for responsive tap/click feedback.
    setAnswers((prev) => ({ ...prev, [questionId]: optionValue }));
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
    return <div className="min-h-screen bg-background px-4 py-10 text-foreground">No questions available.</div>;
  }

  const renderInput = () => {
    const value = answers[currentQuestion.id] ?? '';
    const questionType = String(currentQuestion.question_type || '').trim();

    switch (questionType) {
      case 'Multiple Choice':
      case 'multiple_choice_question':
      case 'True/False':
      case 'true_false_question': {
        const radioOptions = normalizeChoiceOptions(
          currentQuestion.interaction_data?.options,
          questionType === 'True/False' || questionType === 'true_false_question',
        );
        return (
          <div className="space-y-2">
            {radioOptions.map((choice, index) => {
              const selected = isChoiceSelected(value, choice);
              const selectionValue = String(choice.id || '').trim() || String(choice.text || '').trim();
              return (
              <div
                key={index}
                onClick={() => handleOptionSelect(currentQuestion.id, selectionValue)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleOptionSelect(currentQuestion.id, selectionValue);
                  }
                }}
                role="button"
                tabIndex={0}
                className={`w-full p-4 my-3 text-left rounded-xl border-2 transition-all duration-150 cursor-pointer select-none touch-manipulation ${selected ? 'border-cyan-500 bg-cyan-500/15 text-cyan-800 shadow-md shadow-cyan-500/10 dark:bg-cyan-950/40 dark:text-cyan-200 dark:shadow-cyan-950/20' : 'border-border bg-card/60 hover:border-input text-muted-foreground'}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-1 w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 transition-colors ${selected ? 'border-cyan-400 bg-cyan-500' : 'border-slate-600'}`}>
                    {selected ? <div className="w-2 h-2 rounded-full bg-background" /> : null}
                  </div>
                  <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-base md:text-lg font-medium leading-relaxed block w-full">
                      <LatexText text={choice.text || `Option ${index + 1}`} />
                    </span>
                    {choice.image_url ? (
                      <div className="w-full sm:w-36 overflow-hidden rounded-lg border border-input bg-card/60 p-2">
                        <img
                          src={choice.image_url}
                          alt={`Choice ${choice.id || index + 1} diagram`}
                          className="pointer-events-none select-none h-auto max-h-[120px] w-full object-contain"
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            );
            })}
          </div>
        );
      }
      case 'Essay':
      case 'Essay Question':
        return (
          <textarea
            rows={8}
            value={value}
            onChange={(e) => updateAnswer(currentQuestion.id, e.target.value)}
            className="min-h-[220px] w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none focus:border-cyan-400"
            placeholder="Type your detailed explanation here..."
          />
        );
      case 'Fill In the Blank':
      case 'fill_in_the_blank_question':
      case 'one_word_question':
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => updateAnswer(currentQuestion.id, e.target.value)}
            className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none focus:border-cyan-400"
            placeholder="Type your answer"
          />
        );
      case 'Matching':
      case 'matching_question': {
        const leftItems = normalizeMatchingItems(currentQuestion.interaction_data?.left_items, 'L');
        const rightOptions = normalizeMatchingItems(currentQuestion.interaction_data?.right_options, 'R');
        const matchingValue = value && typeof value === 'object' && !Array.isArray(value) ? value : {};

        return (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:items-start">
            <div className="min-w-0 rounded-2xl border border-input bg-card/65 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Left Items</p>
              <div className="mt-3 space-y-3">
                {leftItems.map((leftItem) => (
                  <div key={`left-${leftItem.id}`} className="rounded-xl border border-input bg-background/70 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{leftItem.id}</p>
                    <div className="mt-1 text-sm text-foreground">
                      <LatexText text={leftItem.text || leftItem.id} />
                    </div>
                    {leftItem.image_url ? (
                      <div className="mt-2 overflow-hidden rounded-lg border border-input bg-card/60 p-2">
                        <img
                          src={leftItem.image_url}
                          alt={`${leftItem.id} reference`}
                          className="pointer-events-none select-none h-auto max-h-[100px] w-full object-contain"
                        />
                      </div>
                    ) : null}
                    <div className="mt-3">
                      <label className="mb-1 block text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Match With</label>
                      <Select
                        value={String(matchingValue[leftItem.id] || '')}
                        onValueChange={(selectedValue) => updateMatchingAnswer(currentQuestion.id, leftItem.id, selectedValue)}
                      >
                        <SelectTrigger className="w-full rounded-lg bg-background text-sm">
                          <SelectValue placeholder="Select option" />
                        </SelectTrigger>
                        <SelectContent>
                          {rightOptions.map((option) => (
                            <SelectItem key={`map-${leftItem.id}-${option.id}`} value={option.id}>
                              {option.id}: {option.text || 'Untitled option'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="min-w-0 rounded-2xl border border-input bg-card/65 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-300">Right Options</p>
              <p className="mt-1 text-xs text-muted-foreground">Includes distractors.</p>
              <div className="mt-3 space-y-3">
                {rightOptions.map((option) => (
                  <div key={`right-${option.id}`} className="rounded-xl border border-input bg-background/70 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{option.id}</p>
                    <div className="mt-1 text-sm text-foreground">
                      <LatexText text={option.text || option.id} />
                    </div>
                    {option.image_url ? (
                      <div className="mt-2 overflow-hidden rounded-lg border border-input bg-card/60 p-2">
                        <img
                          src={option.image_url}
                          alt={`${option.id} reference`}
                          className="pointer-events-none select-none h-auto max-h-[100px] w-full object-contain"
                        />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      }
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-10 text-foreground">
      <div className="mx-auto max-w-4xl rounded-3xl border border-border bg-card/95 p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">Question {currentIndex + 1} of {questions.length}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-background/70 p-5">
          {currentQuestionImage ? (
            <div className="mb-5 overflow-hidden rounded-2xl border border-input bg-card/50">
              <img
                src={currentQuestionImage}
                alt="Question reference"
                className="pointer-events-none select-none h-auto max-h-80 w-full object-contain bg-background"
              />
            </div>
          ) : null}

          <h2 className="text-2xl font-semibold text-foreground"><LatexText text={currentQuestion.question_title} /></h2>
          <p className="text-lg leading-8 text-foreground"><LatexText text={currentQuestion.question_text} /></p>
          <div className="mt-6">{renderInput()}</div>
        </div>

        {error ? <p className="mt-4 text-sm text-rose-400">{error}</p> : null}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={handlePrev}
            disabled={currentIndex === 0}
            className="rounded-xl border border-input bg-secondary px-4 py-2 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-50"
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
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? <Spinner label="Submitting exam" /> : null}
              {isSubmitting ? 'Submitting…' : 'Submit Exam'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
