import { useEffect, useMemo, useRef, useState } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { API_BASE_URL } from './apiClient';

const POLL_INTERVAL_MS = 4000;

function MathText({ value }) {
  if (typeof value !== 'string') return null;

  const parts = value.split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+\$)/g).filter(Boolean);
  return (
    <span>
      {parts.map((part, index) => {
        const isBlockMath = part.startsWith('$$') && part.endsWith('$$');
        const isInlineMath = part.startsWith('$') && part.endsWith('$') && !isBlockMath;

        if (isBlockMath || isInlineMath) {
          try {
            const mathExpression = isBlockMath ? part.slice(2, -2) : part.slice(1, -1);
            return (
              <span
                key={index}
                className="inline-block align-middle mx-1"
                dangerouslySetInnerHTML={{ __html: katex.renderToString(mathExpression, { throwOnError: false, displayMode: isBlockMath }) }}
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

export default function QuestionPlayer({ quiz, studentName, onSubmit }) {
  const [answers, setAnswers] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [peerFeedByQuestion, setPeerFeedByQuestion] = useState({});
  const [peerSubmittedByQuestion, setPeerSubmittedByQuestion] = useState({});
  const [peerLoadingByQuestion, setPeerLoadingByQuestion] = useState({});
  const [peerErrorByQuestion, setPeerErrorByQuestion] = useState({});
  const [upvotingResponseId, setUpvotingResponseId] = useState(null);
  const pollingRef = useRef(null);

  const questions = useMemo(() => quiz?.questions || [], [quiz]);
  const currentQuestion = questions[currentIndex];

  const isTextBasedPeerType = (questionType) => (
    ['Essay', 'Essay Question', 'Fill In the Blank', 'essay_question', 'fill_in_the_blank_question', 'one_word_question'].includes(questionType)
  );

  const isPeerEnabledForCurrent = Boolean(currentQuestion?.allow_peer_upvoting) && isTextBasedPeerType(currentQuestion?.question_type);

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

  const updateAnswer = (questionId, value) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleOptionSelect = (questionId, optionValue) => {
    // Immediate local state mutation for instant visual selection feedback.
    setAnswers((prev) => ({ ...prev, [questionId]: optionValue }));
  };

  const resolvePeerResponseText = (answerValue) => {
    if (typeof answerValue === 'string') {
      return answerValue.trim();
    }

    if (answerValue && typeof answerValue === 'object' && !Array.isArray(answerValue)) {
      return Object.values(answerValue)
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .join(' | ')
        .trim();
    }

    return '';
  };

  const fetchPeerFeed = async (questionId) => {
    if (!quiz?.id || !questionId) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/quizzes/${quiz.id}/questions/${questionId}/responses/?student_name=${encodeURIComponent(studentName || '')}`);
      if (!response.ok) {
        throw new Error('Unable to load live feed responses.');
      }

      const payload = await response.json();
      const responses = Array.isArray(payload?.responses) ? payload.responses : [];
      const filtered = responses
        .filter((item) => String(item.student_name || '').trim() !== String(studentName || '').trim())
        .sort((a, b) => {
          if ((b.upvote_count || 0) !== (a.upvote_count || 0)) {
            return (b.upvote_count || 0) - (a.upvote_count || 0);
          }
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
        });

      setPeerFeedByQuestion((prev) => ({ ...prev, [questionId]: filtered }));
      setPeerErrorByQuestion((prev) => ({ ...prev, [questionId]: '' }));
    } catch (error) {
      setPeerErrorByQuestion((prev) => ({ ...prev, [questionId]: error.message || 'Unable to load live feed responses.' }));
    }
  };

  const handleSubmitOwnPeerResponse = async () => {
    if (!currentQuestion?.id || !isPeerEnabledForCurrent) {
      return;
    }

    const answerValue = answers[currentQuestion.id];
    const responseText = resolvePeerResponseText(answerValue);
    if (!responseText) {
      setPeerErrorByQuestion((prev) => ({ ...prev, [currentQuestion.id]: 'Add your own response before entering the live feed.' }));
      return;
    }

    setPeerLoadingByQuestion((prev) => ({ ...prev, [currentQuestion.id]: true }));
    try {
      const response = await fetch(`${API_BASE_URL}/api/quizzes/${quiz.id}/questions/${currentQuestion.id}/responses/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          student_name: studentName,
          response_text: responseText,
        }),
      });

      if (!response.ok) {
        throw new Error('Unable to submit your response to live feed.');
      }

      setPeerSubmittedByQuestion((prev) => ({ ...prev, [currentQuestion.id]: true }));
      setPeerErrorByQuestion((prev) => ({ ...prev, [currentQuestion.id]: '' }));
      await fetchPeerFeed(currentQuestion.id);
    } catch (fetchError) {
      setPeerErrorByQuestion((prev) => ({ ...prev, [currentQuestion.id]: fetchError.message || 'Unable to submit your response to live feed.' }));
    } finally {
      setPeerLoadingByQuestion((prev) => ({ ...prev, [currentQuestion.id]: false }));
    }
  };

  const handleUpvote = async (responseId) => {
    if (!responseId || upvotingResponseId) {
      return;
    }

    setUpvotingResponseId(responseId);
    try {
      const response = await fetch(`${API_BASE_URL}/api/responses/${responseId}/upvote/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ student_name: studentName }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || 'Unable to submit upvote.');
      }

      if (currentQuestion?.id) {
        await fetchPeerFeed(currentQuestion.id);
      }
    } catch (fetchError) {
      if (currentQuestion?.id) {
        setPeerErrorByQuestion((prev) => ({ ...prev, [currentQuestion.id]: fetchError.message || 'Unable to submit upvote.' }));
      }
    } finally {
      setUpvotingResponseId(null);
    }
  };

  useEffect(() => {
    if (pollingRef.current) {
      window.clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    if (!currentQuestion?.id || !isPeerEnabledForCurrent || !peerSubmittedByQuestion[currentQuestion.id]) {
      return undefined;
    }

    fetchPeerFeed(currentQuestion.id);
    pollingRef.current = window.setInterval(() => {
      fetchPeerFeed(currentQuestion.id);
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollingRef.current) {
        window.clearInterval(pollingRef.current);
      }
    };
  }, [currentQuestion?.id, isPeerEnabledForCurrent, peerSubmittedByQuestion, studentName]);

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  };

  const handleSubmit = async () => {
    const payloadAnswers = questions
      .map((question) => {
        const answerValue = answers[question.id];
        return {
          question_id: question.id,
          question_type: question.question_type,
          answer: answerValue ?? '',
        };
      });

    await onSubmit({
      quiz: quiz.id,
      student_name: studentName,
      answers: payloadAnswers,
    });
  };

  if (!currentQuestion) {
    return <div className="text-slate-400">No questions available.</div>;
  }

  const renderInput = () => {
    const value = answers[currentQuestion.id] ?? '';
    const interactionData = currentQuestion.interaction_data || {};
    const questionType = currentQuestion.question_type;

    switch (questionType) {
      case 'Multiple Choice':
      case 'multiple_choice_question':
      case 'True/False':
      case 'true_false_question': {
        const radioOptions = normalizeChoiceOptions(
          interactionData.options,
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
                className={`w-full p-4 my-3 text-left rounded-xl border-2 transition-all duration-150 cursor-pointer select-none touch-manipulation ${selected ? 'border-cyan-500 bg-cyan-950/40 text-cyan-200 shadow-md shadow-cyan-950/20' : 'border-slate-800 bg-slate-900/60 hover:border-slate-700 text-slate-300'}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-1 w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 transition-colors ${selected ? 'border-cyan-400 bg-cyan-500' : 'border-slate-600'}`}>
                    {selected ? <div className="w-2 h-2 rounded-full bg-slate-950" /> : null}
                  </div>
                  <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-base md:text-lg font-medium leading-relaxed block w-full">
                      <MathText value={choice.text || `Option ${index + 1}`} />
                    </span>
                    {choice.image_url ? (
                      <div className="w-full sm:w-36 overflow-hidden rounded-lg border border-slate-700 bg-slate-900/60 p-2">
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
      case 'essay_question':
        return (
          <textarea
            rows={8}
            value={value}
            onChange={(e) => updateAnswer(currentQuestion.id, e.target.value)}
            className="min-h-[220px] w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-400"
            placeholder="Write your response here..."
          />
        );
      case 'Fill In the Blank':
      case 'one_word_question':
      case 'fill_in_the_blank_question':
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => updateAnswer(currentQuestion.id, e.target.value)}
            className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-400"
            placeholder="Type your answer"
          />
        );
      case 'Matching':
      case 'matching_question': {
        const leftItems = normalizeMatchingItems(interactionData.left_items, 'L');
        const rightOptions = normalizeMatchingItems(interactionData.right_options, 'R');
        const matchingValue = value && typeof value === 'object' && !Array.isArray(value) ? value : {};

        return (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-slate-700 bg-slate-900/65 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Left Items</p>
              <div className="mt-3 space-y-3">
                {leftItems.map((leftItem) => (
                  <div key={`left-${leftItem.id}`} className="rounded-xl border border-slate-700 bg-slate-950/70 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{leftItem.id}</p>
                    <div className="mt-1 text-sm text-slate-100">
                      <MathText value={leftItem.text || leftItem.id} />
                    </div>
                    {leftItem.image_url ? (
                      <div className="mt-2 overflow-hidden rounded-lg border border-slate-700 bg-slate-900/60 p-2">
                        <img
                          src={leftItem.image_url}
                          alt={`${leftItem.id} reference`}
                          className="pointer-events-none select-none h-auto max-h-[100px] w-full object-contain"
                        />
                      </div>
                    ) : null}
                    <div className="mt-3">
                      <label className="mb-1 block text-[10px] uppercase tracking-[0.16em] text-slate-400">Match With</label>
                      <select
                        value={String(matchingValue[leftItem.id] || '')}
                        onChange={(event) => updateMatchingAnswer(currentQuestion.id, leftItem.id, event.target.value)}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                      >
                        <option value="">Select option</option>
                        {rightOptions.map((option) => (
                          <option key={`map-${leftItem.id}-${option.id}`} value={option.id}>
                            {option.id}: {option.text || 'Untitled option'}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-700 bg-slate-900/65 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-300">Right Options</p>
              <p className="mt-1 text-xs text-slate-400">Includes distractors.</p>
              <div className="mt-3 space-y-3">
                {rightOptions.map((option) => (
                  <div key={`right-${option.id}`} className="rounded-xl border border-slate-700 bg-slate-950/70 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{option.id}</p>
                    <div className="mt-1 text-sm text-slate-100">
                      <MathText value={option.text || option.id} />
                    </div>
                    {option.image_url ? (
                      <div className="mt-2 overflow-hidden rounded-lg border border-slate-700 bg-slate-900/60 p-2">
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

  const renderedInput = renderInput();
  const currentPeerFeed = currentQuestion?.id ? (peerFeedByQuestion[currentQuestion.id] || []) : [];
  const hasSubmittedPeerResponse = Boolean(currentQuestion?.id && peerSubmittedByQuestion[currentQuestion.id]);
  const peerLoading = Boolean(currentQuestion?.id && peerLoadingByQuestion[currentQuestion.id]);
  const peerError = currentQuestion?.id ? peerErrorByQuestion[currentQuestion.id] : '';

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
      <div className="mx-auto max-w-4xl rounded-3xl border border-slate-800 bg-slate-900/95 p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">Question {currentIndex + 1} of {questions.length}</p>
            <h2 className="mt-2 text-2xl font-semibold text-white"><MathText value={currentQuestion.question_title} /></h2>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
          {currentQuestion.question_image_url ? (
            <div className="mb-4">
              <img
                src={currentQuestion.question_image_url}
                alt="Question visual diagram"
                className="pointer-events-none select-none max-w-full h-auto rounded-2xl border border-slate-800 shadow-lg mb-4 object-contain mx-auto"
              />
            </div>
          ) : null}
          <p className="text-lg leading-8 text-slate-200"><MathText value={currentQuestion.question_text} /></p>
          {renderedInput ? <div className="mt-6">{renderedInput}</div> : null}

          {isPeerEnabledForCurrent ? (
            <div className="mt-6 rounded-xl border border-cyan-500/30 bg-cyan-950/10 p-4 space-y-4">
              {!hasSubmittedPeerResponse ? (
                <div className="space-y-2">
                  <p className="text-sm text-cyan-200">Submit your own answer privately first to unlock Classroom Live Feed.</p>
                  <button
                    type="button"
                    onClick={handleSubmitOwnPeerResponse}
                    disabled={peerLoading}
                    className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition-all hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {peerLoading ? 'Submitting...' : 'Submit My Response'}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">Classroom Live Feed</p>
                    <span className="text-xs text-slate-400">Popular responses rise to the top</span>
                  </div>

                  <div className="max-h-72 overflow-y-auto space-y-2">
                    {currentPeerFeed.length ? currentPeerFeed.map((responseItem) => (
                      <div key={responseItem.id} className="rounded-xl border border-slate-700 bg-slate-900/80 p-3">
                        <p className="text-sm text-slate-200 whitespace-pre-wrap">{responseItem.response_text}</p>
                        <div className="mt-3 flex items-center justify-between">
                          <span className="text-xs text-slate-400">by {responseItem.student_name || 'Student'}</span>
                          <button
                            type="button"
                            disabled={Boolean(responseItem.has_upvoted) || upvotingResponseId === responseItem.id}
                            onClick={() => handleUpvote(responseItem.id)}
                            className="rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-200 transition-all hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            👍 Upvote ({responseItem.upvote_count || 0})
                          </button>
                        </div>
                      </div>
                    )) : (
                      <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-3 text-sm text-slate-400">
                        No peer responses yet. This feed will update every 4 seconds.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {peerError ? <p className="text-xs text-rose-300">{peerError}</p> : null}
            </div>
          ) : null}
        </div>

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
