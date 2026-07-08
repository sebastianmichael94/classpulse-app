import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';

export default function ProfessorDashboard({ activeQuiz, draftQuestions = [], onPublish, onLaunchQuiz, questionCount, isPublishing, publishError, publishedQuizzes = [] }) {
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const canvasRef = useRef(null);
  const modalCanvasRef = useRef(null);

  const committedQuestions = Array.isArray(activeQuiz?.questions) ? activeQuiz.questions : [];
  const normalizedDraftQuestions = Array.isArray(draftQuestions) ? draftQuestions : [];
  const normalizedQuestions = normalizedDraftQuestions.length > 0 ? normalizedDraftQuestions : committedQuestions;
  const effectiveQuestionCount = questionCount > 0 ? questionCount : normalizedQuestions.length;
  const accessCode = activeQuiz?.access_code || activeQuiz?.accessCode || '';
  const generatedQuizUrl = accessCode
    ? `https://classpulse-app-blond.vercel.app/quiz/${encodeURIComponent(accessCode)}`
    : 'https://classpulse-app-blond.vercel.app/student';

  const renderPreviewInput = (question) => {
    const interaction = question?.interaction_data || {};
    const type = String(question?.question_type || '').trim();

    switch (type) {
      case 'Multiple Choice':
      case 'multiple_choice_question':
      case 'True/False':
      case 'true_false_question': {
        const rawOptions = interaction.options || [];
        const previewOptions = rawOptions.length
          ? rawOptions.map((option, index) => (
              option && typeof option === 'object'
                ? (option.text || `Choice ${index + 1}`)
                : (option || `Choice ${index + 1}`)
            ))
          : ['True', 'False'];
        return (
          <div className="mt-4 space-y-2">
            {previewOptions.map((option, index) => (
              <div key={index} className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-300">
                {option || `Choice ${index + 1}`}
              </div>
            ))}
          </div>
        );
      }
      case 'Essay':
      case 'Essay Question':
      case 'essay_question':
      case 'Fill In the Blank':
      case 'fill_in_the_blank_question':
      case 'one_word_question':
        return (
          <textarea
            rows={4}
            readOnly
            placeholder="Type your detailed explanation here..."
            className="mt-4 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-slate-400"
          />
        );
      case 'Matching':
      case 'matching_question': {
        const leftItems = Array.isArray(interaction.left_items) ? interaction.left_items : [];
        const rightOptions = Array.isArray(interaction.right_options) ? interaction.right_options : [];
        return (
          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-cyan-300">Left Items</p>
              <div className="mt-2 space-y-2">
                {leftItems.map((item, index) => (
                  <div key={`preview-left-${index}`} className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-xs text-slate-300">
                    {item?.id || `L${index + 1}`}: {item?.text || 'Untitled'}
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-indigo-300">Right Options</p>
              <div className="mt-2 space-y-2">
                {rightOptions.map((item, index) => (
                  <div key={`preview-right-${index}`} className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-xs text-slate-300">
                    {item?.id || `R${index + 1}`}: {item?.text || 'Untitled'}
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      }
      default:
        return (
          <textarea
            rows={3}
            readOnly
            placeholder="Student response area"
            className="mt-4 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-slate-500"
          />
        );
    }
  };

  useEffect(() => {
    const renderQr = (targetCanvas, widthHint) => {
      if (!targetCanvas) {
        return;
      }

      const containerWidth = targetCanvas.parentElement?.clientWidth || 0;
      const responsiveWidth = Math.max(120, Math.min(1200, containerWidth || Number(widthHint || 220)));

      QRCode.toCanvas(
        targetCanvas,
        generatedQuizUrl,
        {
          width: responsiveWidth,
          margin: 1,
          color: {
            dark: '#020617',
            light: '#FFFFFF'
          }
        },
        (error) => {
          if (error) console.error('QR Blueprint loop error:', error);
        }
      );
    };

    if (!isPreviewMode) {
      renderQr(canvasRef.current, 220);
    }

    if (isZoomed) {
      renderQr(modalCanvasRef.current, 900);
    }
  }, [generatedQuizUrl, isPreviewMode, isZoomed]);

  useEffect(() => {
    if (!isZoomed) {
      return undefined;
    }

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsZoomed(false);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isZoomed]);

  return (
    <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8 shadow-2xl text-slate-100 transition-all duration-300">
      
      <div className="flex flex-wrap justify-between items-center border-b border-slate-800 pb-4 mb-6 gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100">Instructor Dashboard</h2>
          <p className="text-xs text-slate-400 font-mono mt-0.5">Live class controls</p>
        </div>
        
        <div className="flex gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button 
            type="button"
            onClick={() => setIsPreviewMode(false)}
            className={`px-4 py-2 text-xs font-medium rounded-lg transition-all ${!isPreviewMode ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
          >
            BUILD MODE
          </button>
          <button 
            type="button"
            onClick={() => setIsPreviewMode(true)}
            className={`px-4 py-2 text-xs font-medium rounded-lg transition-all ${isPreviewMode ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
          >
            STUDENT PREVIEW
          </button>
        </div>
      </div>

      {!isPreviewMode ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          
          <div className="md:col-span-2 space-y-6">
            <div className="bg-slate-950 border border-slate-850 rounded-xl p-5 shadow-inner">
              <span className="block text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest mb-1.5">Current Quiz</span>
              <h3 className="text-base font-bold text-slate-200">{activeQuiz?.title || "Untitled Quiz"}</h3>
              <p className="text-xs text-slate-400 mt-1.5 italic font-medium">"{activeQuiz?.instructions || "No instructions yet."}"</p>
              
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="text-xs font-mono bg-slate-900 border border-slate-800 px-3 py-1 rounded-lg text-slate-300 font-medium">
                  ⏱ Time: {activeQuiz?.time_limit_minutes || activeQuiz?.timeLimit || 15} mins
                </span>
                <span className="text-xs font-mono bg-indigo-950/40 border border-indigo-900/50 px-3 py-1 rounded-lg text-indigo-400 font-medium">
                  🧩 {effectiveQuestionCount || 0} Total Questions
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Student Join Link</h4>
              <input 
                type="text" 
                readOnly 
                value={generatedQuizUrl}
                className="w-full px-4 py-3 bg-slate-950 border border-slate-850 text-slate-400 font-mono text-xs rounded-xl select-all outline-none border border-slate-800 focus:border-slate-700 transition-all"
              />
            </div>

            <div className="pt-4 border-t border-slate-800 flex justify-end">
              <button 
                onClick={() => onPublish()}
                disabled={isPublishing}
                className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-700/50 text-white font-medium py-3 px-8 rounded-xl shadow-lg shadow-emerald-600/10 text-xs uppercase tracking-wider transition-all active:scale-[0.98]"
              >
                {isPublishing ? 'Publishing Quiz...' : 'Confirm and Publish Quiz'}
              </button>
            </div>
            {publishError ? (
              <p className="mt-2 text-xs text-rose-400 bg-rose-950/20 border border-rose-900/30 p-3 rounded-xl">{publishError}</p>
            ) : null}

            {publishedQuizzes.length > 0 ? (
              <div className="pt-4 border-t border-slate-800">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Recently Published</h4>
                <div className="space-y-2">
                  {publishedQuizzes.slice(0, 3).map((quiz) => (
                    <div key={quiz.id} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <span className="text-sm text-slate-200 truncate block">{quiz.title}</span>
                        <span className="text-xs font-mono text-emerald-400">PIN {quiz.access_code || '----'}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onLaunchQuiz?.(quiz)}
                        className="ml-3 rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-cyan-200 transition-all hover:bg-cyan-500/20"
                      >
                        Start Live Session
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex flex-col items-center justify-center border-t md:border-t-0 md:border-l border-slate-800 pt-6 md:pt-0 md:pl-8 text-center">
            <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Class Access</span>
            
            <div className="w-full max-w-[240px] aspect-square mx-auto flex items-center justify-center p-2 bg-white rounded-xl shadow-inner">
              <canvas ref={canvasRef} className="w-full h-full object-contain" />
            </div>

            <button
              type="button"
              onClick={() => setIsZoomed(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-cyan-300 transition-all hover:border-cyan-500/60 hover:text-cyan-200"
            >
              Maximize QR
            </button>
            
            <div className="mt-6 w-full bg-slate-950 border border-slate-850 rounded-xl py-3 px-4 shadow-inner">
              <span className="block text-[10px] font-mono tracking-widest text-slate-500 uppercase">Access PIN</span>
              <span className="text-3xl font-black font-mono tracking-widest text-emerald-400 mt-1 block">{accessCode}</span>
            </div>
          </div>

        </div>
      ) : (
        <div className="bg-slate-950 border-2 border-dashed border-slate-800 rounded-2xl p-6 md:p-8">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl shadow-2xl text-left w-full space-y-4">
            <h4 className="font-semibold text-sm text-slate-200 tracking-tight">Student Preview</h4>
            {normalizedQuestions.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-5 text-sm text-slate-400">
                No questions yet. Add a question to preview the student view.
              </div>
            ) : (
              <div className="max-h-[60vh] space-y-4 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950 p-5 pr-3">
                {normalizedQuestions.map((question, index) => (
                  <div key={question.id || `preview-${index}`} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">Question {index + 1} of {normalizedQuestions.length}</p>
                    <p className="mt-2 text-base font-semibold text-slate-100">{question.question_title || `Question ${index + 1}`}</p>
                    <p className="mt-2 text-sm text-slate-300">{question.question_text || 'No question text yet.'}</p>
                    {renderPreviewInput(question)}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {isZoomed ? (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-md p-6"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setIsZoomed(false);
            }
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Expanded QR code"
        >
          <div className="relative w-full max-w-[85vmin] aspect-square bg-white p-6 rounded-2xl shadow-2xl flex items-center justify-center transition-all transform scale-100">
            <button
              type="button"
              onClick={() => setIsZoomed(false)}
              className="absolute right-4 top-4 h-10 w-10 rounded-full border border-slate-300 bg-white text-slate-600 transition-colors hover:text-rose-500 hover:border-rose-300"
              aria-label="Close expanded QR"
            >
              X
            </button>

            <canvas ref={modalCanvasRef} className="w-full h-full object-contain" />
          </div>

          <p className="mt-6 text-xl font-medium text-cyan-400 tracking-wide bg-slate-900/60 px-6 py-2 rounded-full border border-slate-800">
            Scan to Join • Click anywhere to dismiss
          </p>
        </div>
      ) : null}

    </div>
  );
}