import React, { useMemo, useState } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select';

function MathText({ value }) {
  if (typeof value !== 'string') return null;

  if (!value.includes('$$')) {
    return <span>{value}</span>;
  }

  const parts = value.split('$$');
  return (
    <span>
      {parts.map((part, index) => {
        if (index % 2 === 1) {
          try {
            return (
              <span
                key={index}
                className="mx-1 inline-block align-middle"
                dangerouslySetInnerHTML={{ __html: katex.renderToString(part, { throwOnError: false }) }}
              />
            );
          } catch {
            return <span key={index}>{part}</span>;
          }
        }
        return <span key={index}>{part}</span>;
      })}
    </span>
  );
}

export default function QuestionCanvas({ quiz, studentName, onSubmit }) {
  const [answers, setAnswers] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);

  const questions = useMemo(() => quiz?.questions || [], [quiz]);
  const currentQuestion = questions[currentIndex];

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
    const payloadAnswers = questions.map((question) => ({
      question_id: question.id,
      question_type: question.question_type,
      answer: answers[question.id] ?? '',
    }));

    await onSubmit({
      quiz: quiz.id,
      student_name: studentName,
      answers: payloadAnswers,
    });
  };

  if (!currentQuestion) {
    return <div className="min-h-screen bg-background px-4 py-10 text-foreground">No questions available.</div>;
  }

  const renderInput = () => {
    const value = answers[currentQuestion.id] ?? '';
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

    const updateMatchingAnswer = (leftId, rightId) => {
      updateAnswer(currentQuestion.id, {
        ...(value && typeof value === 'object' && !Array.isArray(value) ? value : {}),
        [leftId]: rightId,
      });
    };

    switch (currentQuestion.question_type) {
      case 'multiple_choice_question':
        return (
          <div className="space-y-3">
            {(currentQuestion.interaction_data?.options || []).map((option, index) => (
              <label key={index} className="flex cursor-pointer items-center gap-3 rounded-2xl border border-input bg-card/70 px-4 py-3 text-sm text-foreground">
                <input
                  type="radio"
                  name={currentQuestion.id}
                  checked={value === option}
                  onChange={() => updateAnswer(currentQuestion.id, option)}
                  className="h-4 w-4 border-slate-500 bg-background text-cyan-500"
                />
                <span><MathText value={option} /></span>
              </label>
            ))}
          </div>
        );
      case 'true_false_question':
        return (
          <div className="space-y-3">
            {['True', 'False'].map((option) => (
              <label key={option} className="flex cursor-pointer items-center gap-3 rounded-2xl border border-input bg-card/70 px-4 py-3 text-sm text-foreground">
                <input
                  type="radio"
                  name={currentQuestion.id}
                  checked={value === option}
                  onChange={() => updateAnswer(currentQuestion.id, option)}
                  className="h-4 w-4 border-slate-500 bg-background text-cyan-500"
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
        );
      case 'Essay':
      case 'Essay Question':
      case 'essay_question':
        return (
          <textarea
            rows={8}
            value={value}
            onChange={(e) => updateAnswer(currentQuestion.id, e.target.value)}
            className="min-h-[220px] w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none focus:border-cyan-400"
            placeholder="Write your response here..."
          />
        );
      case 'one_word_question':
      case 'fill_in_the_blank_question':
      case 'Fill In the Blank':
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
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="rounded-xl border border-input bg-card/70 p-3 space-y-3">
              {leftItems.map((leftItem) => (
                <div key={`left-${leftItem.id}`} className="rounded-lg border border-input bg-background/60 p-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{leftItem.id}</p>
                  <p className="mt-1 text-sm text-foreground"><MathText value={leftItem.text || leftItem.id} /></p>
                  {leftItem.image_url ? (
                    <div className="mt-2 overflow-hidden rounded-lg border border-input bg-card/60 p-2">
                      <img src={leftItem.image_url} alt={`${leftItem.id} reference`} className="pointer-events-none select-none h-auto max-h-[100px] w-full object-contain" />
                    </div>
                  ) : null}
                  <Select
                    value={String(matchingValue[leftItem.id] || '')}
                    onValueChange={(selectedValue) => updateMatchingAnswer(leftItem.id, selectedValue)}
                  >
                    <SelectTrigger className="mt-2 w-full rounded-lg bg-background text-sm">
                      <SelectValue placeholder="Select option" />
                    </SelectTrigger>
                    <SelectContent>
                      {rightOptions.map((option) => (
                        <SelectItem key={`map-${leftItem.id}-${option.id}`} value={option.id}>{option.id}: {option.text || 'Untitled option'}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-input bg-card/70 p-3 space-y-3">
              {rightOptions.map((option) => (
                <div key={`right-${option.id}`} className="rounded-lg border border-input bg-background/60 p-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{option.id}</p>
                  <p className="mt-1 text-sm text-foreground"><MathText value={option.text || option.id} /></p>
                  {option.image_url ? (
                    <div className="mt-2 overflow-hidden rounded-lg border border-input bg-card/60 p-2">
                      <img src={option.image_url} alt={`${option.id} reference`} className="pointer-events-none select-none h-auto max-h-[100px] w-full object-contain" />
                    </div>
                  ) : null}
                </div>
              ))}
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
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">Question {currentIndex + 1} of {questions.length}</p>
            <h2 className="mt-2 text-2xl font-semibold text-foreground"><MathText value={currentQuestion.question_title} /></h2>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-background/70 p-5">
          <p className="text-lg leading-8 text-foreground"><MathText value={currentQuestion.question_text} /></p>
          <div className="mt-6">{renderInput()}</div>
        </div>

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
              className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950"
            >
              Submit Exam
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
