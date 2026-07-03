import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';

export default function ProfessorDashboard({ activeQuiz, onPublish, questionCount, isPublishing, publishError, publishedQuizzes = [] }) {
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const canvasRef = useRef(null);
  const modalCanvasRef = useRef(null);

  const normalizedQuestions = Array.isArray(activeQuiz?.questions) ? activeQuiz.questions : [];
  const effectiveQuestionCount = questionCount > 0 ? questionCount : normalizedQuestions.length;
  const previewQuestion = normalizedQuestions[0] || null;
  const accessCode = activeQuiz?.access_code || activeQuiz?.accessCode || '';
  const generatedQuizUrl = accessCode
    ? `http://localhost:5173/quiz/${encodeURIComponent(accessCode)}`
    : 'http://localhost:5173/student';

  const renderPreviewInput = (question) => {
    const interaction = question?.interaction_data || {};

    switch (question?.question_type) {
      case 'multiple_choice_question':
        return (
          <div className="mt-4 space-y-2">
            {(interaction.options || []).map((option, index) => (
              <div key={index} className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-300">
                {option || `Choice ${index + 1}`}
              </div>
            ))}
          </div>
        );
      case 'true_false_question':
        return (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-300 text-center">True</div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-300 text-center">False</div>
          </div>
        );
      case 'essay_question':
        return <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950 px-3 py-5 text-sm text-slate-500">Long-form answer field preview</div>;
      case 'formula_question':
        return <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-300">Numeric response input preview</div>;
      default:
        return <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-500">Preview unavailable for this question type.</div>;
    }
  };

  useEffect(() => {
    const renderQr = (targetCanvas, width) => {
      if (!targetCanvas) {
        return;
      }

      QRCode.toCanvas(
        targetCanvas,
        generatedQuizUrl,
        {
          width,
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
      renderQr(canvasRef.current, 140);
    }

    if (isQrModalOpen) {
      renderQr(modalCanvasRef.current, 460);
    }
  }, [generatedQuizUrl, isPreviewMode, isQrModalOpen]);

  useEffect(() => {
    if (!isQrModalOpen) {
      return undefined;
    }

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsQrModalOpen(false);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isQrModalOpen]);

  return (
    <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8 shadow-2xl text-slate-100 transition-all duration-300">
      
      <div className="flex flex-wrap justify-between items-center border-b border-slate-800 pb-4 mb-6 gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100">Professor Command Console</h2>
          <p className="text-xs text-slate-400 font-mono mt-0.5">Core State: System Orchestration Dispatcher</p>
        </div>
        
        <div className="flex gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button 
            type="button"
            onClick={() => setIsPreviewMode(false)}
            className={`px-4 py-2 text-xs font-medium rounded-lg transition-all ${!isPreviewMode ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
          >
            ORCHESTRATION PIPELINE
          </button>
          <button 
            type="button"
            onClick={() => setIsPreviewMode(true)}
            className={`px-4 py-2 text-xs font-medium rounded-lg transition-all ${isPreviewMode ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
          >
            STUDENT PREVIEW MIRROR
          </button>
        </div>
      </div>

      {!isPreviewMode ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          
          <div className="md:col-span-2 space-y-6">
            <div className="bg-slate-950 border border-slate-850 rounded-xl p-5 shadow-inner">
              <span className="block text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest mb-1.5">Staged Schema Profile</span>
              <h3 className="text-base font-bold text-slate-200">{activeQuiz?.title || "Untitled Assessment Draft"}</h3>
              <p className="text-xs text-slate-400 mt-1.5 italic font-medium">"{activeQuiz?.instructions || "No explicit instructions assigned yet."}"</p>
              
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="text-xs font-mono bg-slate-900 border border-slate-800 px-3 py-1 rounded-lg text-slate-300 font-medium">
                  ⏱ Time Envelope: {activeQuiz?.time_limit_minutes || activeQuiz?.timeLimit || 15} Mins
                </span>
                <span className="text-xs font-mono bg-indigo-950/40 border border-indigo-900/50 px-3 py-1 rounded-lg text-indigo-400 font-medium">
                  🧩 {effectiveQuestionCount || 0} Compiled Nodes
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Gateway Network Anchor Uniform Link</h4>
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
                {isPublishing ? 'Transmitting Over-the-Wire...' : '🚀 Release & Publish Matrix'}
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
                      <span className="text-sm text-slate-200 truncate">{quiz.title}</span>
                      <span className="text-xs font-mono text-emerald-400">PIN {quiz.access_code || '----'}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex flex-col items-center justify-center border-t md:border-t-0 md:border-l border-slate-800 pt-6 md:pt-0 md:pl-8 text-center">
            <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Mobile Vector Gateway</span>
            
            <div className="bg-white p-3 rounded-2xl shadow-xl border border-slate-200 flex items-center justify-center transition-all hover:scale-[1.01]">
              <canvas ref={canvasRef} />
            </div>

            <button
              type="button"
              onClick={() => setIsQrModalOpen(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-cyan-300 transition-all hover:border-cyan-500/60 hover:text-cyan-200"
            >
              Maximize QR
            </button>
            
            <div className="mt-6 w-full bg-slate-950 border border-slate-850 rounded-xl py-3 px-4 shadow-inner">
              <span className="block text-[10px] font-mono tracking-widest text-slate-500 uppercase">Access PIN Token</span>
              <span className="text-3xl font-black font-mono tracking-widest text-emerald-400 mt-1 block">{accessCode}</span>
            </div>
          </div>

        </div>
      ) : (
        <div className="bg-slate-950 border-2 border-dashed border-slate-800 rounded-2xl p-8 flex items-center justify-center">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl shadow-2xl text-left max-w-xl w-full space-y-4">
            <h4 className="font-semibold text-sm text-slate-200 tracking-tight">Student Preview Mirror</h4>
            {!activeQuiz?.id || isPublishing ? (
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-5 flex items-center gap-3">
                <span className="h-4 w-4 rounded-full border-2 border-slate-600 border-t-cyan-400 animate-spin" />
                <span className="text-sm text-slate-300">Awaiting Question Schema...</span>
              </div>
            ) : normalizedQuestions.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-5 text-sm text-slate-400">Awaiting Question Schema...</div>
            ) : (
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-5">
                <p className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">Question 1 of {normalizedQuestions.length}</p>
                <p className="mt-2 text-base font-semibold text-slate-100">{previewQuestion?.question_title}</p>
                <p className="mt-2 text-sm text-slate-300">{previewQuestion?.question_text}</p>
                {renderPreviewInput(previewQuestion)}
              </div>
            )}
          </div>
        </div>
      )}

      {isQrModalOpen ? (
        <div
          className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4 transition-opacity duration-300"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setIsQrModalOpen(false);
            }
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Expanded QR code"
        >
          <div className="relative w-full max-w-2xl rounded-3xl border border-slate-700 bg-slate-900 p-6 md:p-8 text-center shadow-2xl shadow-cyan-950/20 transition-all duration-300">
            <button
              type="button"
              onClick={() => setIsQrModalOpen(false)}
              className="absolute right-4 top-4 h-10 w-10 rounded-full border border-slate-700 bg-slate-950 text-slate-300 transition-colors hover:text-rose-300 hover:border-rose-400/50"
              aria-label="Close expanded QR"
            >
              X
            </button>

            <p className="text-xs uppercase tracking-[0.35em] text-cyan-300">Live Access Gateway</p>
            <h3 className="mt-2 text-xl font-semibold text-white">Scan To Join Quiz Session</h3>

            <div className="mx-auto mt-6 w-fit rounded-2xl border border-slate-300 bg-white p-4 shadow-lg">
              <canvas ref={modalCanvasRef} />
            </div>

            <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/80 p-5">
              <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Access PIN</p>
              <p className="mt-2 text-5xl md:text-6xl font-black tracking-widest text-cyan-400">{accessCode || '----'}</p>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}