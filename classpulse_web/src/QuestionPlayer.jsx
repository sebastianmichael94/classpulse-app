import { useEffect, useMemo, useRef, useState } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

const BRACKET_TOKEN_REGEX = /\[([^\]]+)\]/g;
const POLL_INTERVAL_MS = 4000;

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
                className="inline-block align-middle mx-1"
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
    ['Essay Question', 'Fill In the Blank', 'Fill In Multiple Blanks', 'essay_question', 'fill_in_the_blank_question', 'one_word_question'].includes(questionType)
  );

  const isPeerEnabledForCurrent = Boolean(currentQuestion?.allow_peer_upvoting) && isTextBasedPeerType(currentQuestion?.question_type);

  const updateAnswer = (questionId, value) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const toggleMultipleAnswerOption = (questionId, option) => {
    setAnswers((prev) => {
      const currentValue = Array.isArray(prev[questionId]) ? prev[questionId] : [];
      const exists = currentValue.includes(option);
      return {
        ...prev,
        [questionId]: exists ? currentValue.filter((item) => item !== option) : [...currentValue, option],
      };
    });
  };

  const updateStructuredAnswer = (questionId, key, value) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: {
        ...(typeof prev[questionId] === 'object' && prev[questionId] !== null ? prev[questionId] : {}),
        [key]: value,
      },
    }));
  };

  const extractBlankTokens = (text) => {
    const tokens = [];
    const seen = {};
    const rawText = String(text || '');
    let match = BRACKET_TOKEN_REGEX.exec(rawText);
    while (match) {
      const baseKey = String(match[1] || '').trim() || 'blank';
      seen[baseKey] = (seen[baseKey] || 0) + 1;
      const tokenKey = seen[baseKey] > 1 ? `${baseKey}_${seen[baseKey]}` : baseKey;
      tokens.push(tokenKey);
      match = BRACKET_TOKEN_REGEX.exec(rawText);
    }
    BRACKET_TOKEN_REGEX.lastIndex = 0;
    return tokens;
  };

  const splitTemplateSegments = (text) => {
    const segments = [];
    const rawText = String(text || '');
    let cursor = 0;
    let match = BRACKET_TOKEN_REGEX.exec(rawText);
    const seen = {};

    while (match) {
      if (match.index > cursor) {
        segments.push({ type: 'text', value: rawText.slice(cursor, match.index) });
      }

      const baseKey = String(match[1] || '').trim() || 'blank';
      seen[baseKey] = (seen[baseKey] || 0) + 1;
      const tokenKey = seen[baseKey] > 1 ? `${baseKey}_${seen[baseKey]}` : baseKey;
      segments.push({ type: 'blank', key: tokenKey });
      cursor = match.index + match[0].length;
      match = BRACKET_TOKEN_REGEX.exec(rawText);
    }

    if (cursor < rawText.length) {
      segments.push({ type: 'text', value: rawText.slice(cursor) });
    }

    BRACKET_TOKEN_REGEX.lastIndex = 0;
    return segments;
  };

  const shouldSkipPayload = (questionType) => ['Text (no question)'].includes(questionType);

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
      const response = await fetch(`http://127.0.0.1:8000/api/quizzes/${quiz.id}/questions/${questionId}/responses/?student_name=${encodeURIComponent(studentName || '')}`);
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
      const response = await fetch(`http://127.0.0.1:8000/api/quizzes/${quiz.id}/questions/${currentQuestion.id}/responses/`, {
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
      const response = await fetch(`http://127.0.0.1:8000/api/responses/${responseId}/upvote/`, {
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
      .filter((question) => !shouldSkipPayload(question.question_type))
      .map((question) => {
        const answerValue = answers[question.id];
        if (question.question_type === 'Multiple Answers') {
          return {
            question_id: question.id,
            question_type: question.question_type,
            answer: Array.isArray(answerValue) ? answerValue : [],
          };
        }

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

    if (questionType === 'Text (no question)') {
      return null;
    }

    switch (questionType) {
      case 'Multiple Choice':
      case 'multiple_choice_question':
      case 'True/False':
      case 'true_false_question': {
        const radioOptions = questionType === 'True/False' || questionType === 'true_false_question'
          ? ['True', 'False']
          : interactionData.options || [];
        return (
          <div className="space-y-3">
            {radioOptions.map((option, index) => (
              <label key={index} className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-sm text-slate-200">
                <input
                  type="radio"
                  name={currentQuestion.id}
                  checked={value === option}
                  onChange={() => updateAnswer(currentQuestion.id, option)}
                  className="h-4 w-4 border-slate-500 bg-slate-950 text-cyan-500"
                />
                <span><MathText value={option} /></span>
              </label>
            ))}
          </div>
        );
      }
      case 'Multiple Answers': {
        const selectedOptions = Array.isArray(value) ? value : [];
        return (
          <div className="space-y-3">
            {(interactionData.options || []).map((option, index) => (
              <label key={option} className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-sm text-slate-200">
                <input
                  type="checkbox"
                  checked={selectedOptions.includes(option)}
                  onChange={() => toggleMultipleAnswerOption(currentQuestion.id, option)}
                  className="h-4 w-4 rounded border-slate-500 bg-slate-950 text-cyan-500"
                />
                <span><MathText value={option || `Option ${index + 1}`} /></span>
              </label>
            ))}
          </div>
        );
      }
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
      case 'Formula Question':
      case 'formula_question':
      case 'Numerical Answer':
        return (
          <div className="space-y-3">
            <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4 text-sm text-slate-300">
              <MathText value={currentQuestion.question_text} />
            </div>
            <input
              type="number"
              value={value}
              onChange={(e) => updateAnswer(currentQuestion.id, e.target.value)}
              className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-400"
              placeholder="Enter numeric response"
            />
          </div>
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
      case 'Fill In Multiple Blanks': {
        const structuredValue = typeof value === 'object' && value !== null ? value : {};
        const segments = splitTemplateSegments(currentQuestion.question_text);
        return (
          <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4 text-sm text-slate-200 leading-9">
            <div className="flex flex-wrap items-center gap-2">
              {segments.map((segment, index) => (
                segment.type === 'text' ? (
                  <span key={`text-${index}`}><MathText value={segment.value} /></span>
                ) : (
                  <input
                    key={`blank-${segment.key}-${index}`}
                    type="text"
                    value={structuredValue[segment.key] || ''}
                    onChange={(e) => updateStructuredAnswer(currentQuestion.id, segment.key, e.target.value)}
                    className="min-w-[130px] rounded-lg border border-cyan-700/50 bg-slate-950 px-3 py-1.5 text-sm text-cyan-100 outline-none focus:border-cyan-400"
                    placeholder={segment.key}
                  />
                )
              ))}
            </div>
          </div>
        );
      }
      case 'Multiple Dropdowns': {
        const structuredValue = typeof value === 'object' && value !== null ? value : {};
        const segments = splitTemplateSegments(currentQuestion.question_text);
        const fallbackOptions = Array.isArray(interactionData.options) ? interactionData.options : [];
        return (
          <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4 text-sm text-slate-200 leading-9">
            <div className="flex flex-wrap items-center gap-2">
              {segments.map((segment, index) => {
                if (segment.type === 'text') {
                  return <span key={`text-${index}`}><MathText value={segment.value} /></span>;
                }

                const tokenOptions = Array.isArray(interactionData.blank_options?.[segment.key])
                  ? interactionData.blank_options[segment.key]
                  : fallbackOptions;

                return (
                  <select
                    key={`blank-${segment.key}-${index}`}
                    value={structuredValue[segment.key] || ''}
                    onChange={(e) => updateStructuredAnswer(currentQuestion.id, segment.key, e.target.value)}
                    className="min-w-[150px] rounded-lg border border-cyan-700/50 bg-slate-950 px-3 py-1.5 text-sm text-cyan-100 outline-none focus:border-cyan-400"
                  >
                    <option value="">Select</option>
                    {tokenOptions.map((option, optionIndex) => (
                      <option key={`${segment.key}-${optionIndex}`} value={option}>{option}</option>
                    ))}
                  </select>
                );
              })}
            </div>
          </div>
        );
      }
      case 'Matching': {
        const structuredValue = typeof value === 'object' && value !== null ? value : {};
        const premises = Array.isArray(interactionData.premises) ? interactionData.premises : extractBlankTokens(currentQuestion.question_text);
        const targets = Array.isArray(interactionData.targets) ? interactionData.targets : [];

        return (
          <div className="space-y-3">
            {premises.map((premise, index) => (
              <div key={`${premise}-${index}`} className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-3 items-center rounded-2xl border border-slate-700 bg-slate-900/70 px-4 py-3">
                <span className="text-sm text-slate-200"><MathText value={premise} /></span>
                <select
                  value={structuredValue[premise] || ''}
                  onChange={(e) => updateStructuredAnswer(currentQuestion.id, premise, e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400"
                >
                  <option value="">Select match</option>
                  {targets.map((target, targetIndex) => (
                    <option key={`${premise}-${targetIndex}`} value={target}>{target}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        );
      }
      case 'File Upload Question': {
        const fileMeta = typeof value === 'object' && value !== null ? value : null;
        return (
          <div className="space-y-3">
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-cyan-600/50 bg-slate-900/50 px-6 py-10 text-center transition-colors hover:border-cyan-400">
              <span className="text-sm font-semibold text-cyan-200">Drop a file or click to browse</span>
              <span className="mt-1 text-xs text-slate-400">Accepted by browser picker; filename is attached to submission payload.</span>
              <input
                type="file"
                className="hidden"
                onChange={(event) => {
                  const selectedFile = event.target.files?.[0];
                  if (!selectedFile) {
                    updateAnswer(currentQuestion.id, null);
                    return;
                  }
                  updateAnswer(currentQuestion.id, {
                    name: selectedFile.name,
                    size: selectedFile.size,
                    type: selectedFile.type || 'application/octet-stream',
                  });
                }}
              />
            </label>
            {fileMeta?.name ? (
              <p className="text-xs text-cyan-300">Selected file: {fileMeta.name}</p>
            ) : null}
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
                className="max-w-full h-auto rounded-2xl border border-slate-800 shadow-lg mb-4 object-contain mx-auto"
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
