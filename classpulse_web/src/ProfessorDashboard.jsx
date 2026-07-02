import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';

export default function ProfessorDashboard({ activeQuiz, onPublish, questionCount, isPublishing, publishError }) {
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const canvasRef = useRef(null);

  const generatedQuizUrl = `http://localhost:5173/quiz/${encodeURIComponent(activeQuiz?.title || 'live-session')}`;
  const accessCode = activeQuiz?.accessCode || "5821";

  useEffect(() => {
    if (!isPreviewMode && canvasRef.current) {
      QRCode.toCanvas(
        canvasRef.current,
        generatedQuizUrl,
        {
          width: 140,
          margin: 1,
          color: {
            dark: '#020617', // Slate 950
            light: '#FFFFFF'
          }
        },
        (error) => {
          if (error) console.error('QR Blueprint loop error:', error);
        }
      );
    }
  }, [generatedQuizUrl, isPreviewMode]);

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
                  ⏱ Time Envelope: {activeQuiz?.timeLimit || 15} Mins
                </span>
                <span className="text-xs font-mono bg-indigo-950/40 border border-indigo-900/50 px-3 py-1 rounded-lg text-indigo-400 font-medium">
                  🧩 {questionCount || 0} Compiled Nodes
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
          </div>

          <div className="flex flex-col items-center justify-center border-t md:border-t-0 md:border-l border-slate-800 pt-6 md:pt-0 md:pl-8 text-center">
            <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Mobile Vector Gateway</span>
            
            <div className="bg-white p-3 rounded-2xl shadow-xl border border-slate-200 flex items-center justify-center transition-all hover:scale-[1.01]">
              <canvas ref={canvasRef} />
            </div>
            
            <div className="mt-6 w-full bg-slate-950 border border-slate-850 rounded-xl py-3 px-4 shadow-inner">
              <span className="block text-[10px] font-mono tracking-widest text-slate-500 uppercase">Access PIN Token</span>
              <span className="text-3xl font-black font-mono tracking-widest text-emerald-400 mt-1 block">{accessCode}</span>
            </div>
          </div>

        </div>
      ) : (
        <div className="bg-slate-950 border-2 border-dashed border-slate-800 rounded-2xl p-8 flex items-center justify-center">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl shadow-2xl text-center max-w-sm w-full space-y-4">
            <h4 className="font-semibold text-sm text-slate-200 tracking-tight">Security Verification Point</h4>
            <p className="text-xs text-slate-400 leading-relaxed">Scan the validation vector code or parse the active 4-digit token configuration to execute execution viewports.</p>
            <input type="text" placeholder="0 0 0 0" className="w-full text-center tracking-widest font-mono text-lg font-bold border border-slate-800 p-2.5 bg-slate-950 rounded-xl text-slate-500" disabled />
          </div>
        </div>
      )}

    </div>
  );
}