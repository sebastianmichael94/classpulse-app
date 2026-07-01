import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';

export default function ProfessorDashboard({ activeQuiz, onPublish, questionCount, isPublishing, publishError }) {
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const canvasRef = useRef(null);

  const generatedQuizUrl = `http://localhost:5173/quiz/${encodeURIComponent(activeQuiz?.title || 'live-session')}`;
  const accessCode = activeQuiz?.accessCode || "5821";

  // Use a native hook callback loop to safely render the vector pixels
  useEffect(() => {
    if (!isPreviewMode && canvasRef.current) {
      QRCode.toCanvas(
        canvasRef.current,
        generatedQuizUrl,
        {
          width: 140,
          margin: 1,
          color: {
            dark: '#0F172A',  // Slate 900
            light: '#FFFFFF'  // High contrast white background
          }
        },
        (error) => {
          if (error) console.error('QR Generation failed:', error);
        }
      );
    }
  }, [generatedQuizUrl, isPreviewMode]);

  return (
    <div className="w-full max-w-4xl bg-white border-2 border-slate-300 rounded-xl p-6 md:p-8 shadow-md text-slate-900">
      
      {/* Control Banner */}
      <div className="flex flex-wrap justify-between items-center border-b-2 border-slate-200 pb-4 mb-6 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Professor Command Console</h2>
          <p className="text-xs text-slate-500 font-mono font-bold uppercase tracking-wider">Status: Draft Mode</p>
        </div>
        
        <div className="flex gap-2 bg-slate-100 p-1 rounded-lg border border-slate-200">
          <button 
            type="button"
            onClick={() => setIsPreviewMode(false)}
            className={`px-4 py-1.5 text-xs font-mono font-bold rounded-md transition-all ${!isPreviewMode ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            GATEWAY DESIGN
          </button>
          <button 
            type="button"
            onClick={() => setIsPreviewMode(true)}
            className={`px-4 py-1.5 text-xs font-mono font-bold rounded-md transition-all ${isPreviewMode ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            👀 LIVE PREVIEW
          </button>
        </div>
      </div>

      {!isPreviewMode ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          
          {/* Form Context Info Left column */}
          <div className="md:col-span-2 space-y-6">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
              <span className="block text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest mb-1">Active Quiz Matrix</span>
              <h3 className="text-lg font-bold text-slate-800">{activeQuiz?.title || "Untitled Component Spec"}</h3>
              <p className="text-sm text-slate-600 mt-1 italic">"{activeQuiz?.instructions || "No custom instructions supplied."}"</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <div className="text-xs font-mono bg-slate-200 inline-block px-2.5 py-1 rounded-md text-slate-700 font-bold">
                  ⏱ Time Limit: {activeQuiz?.timeLimit || 15} Minutes
                </div>
                <div className="text-xs font-mono bg-indigo-50 inline-block px-2.5 py-1 rounded-md text-indigo-700 font-bold border border-indigo-200">
                  🧩 {questionCount || 0} Compiled Questions
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Laptop Access Link</h4>
              <input 
                type="text" 
                readOnly 
                value={generatedQuizUrl}
                className="w-full px-3 py-2 bg-slate-100 border-2 border-slate-200 text-slate-600 font-mono text-xs rounded-lg select-all outline-none"
              />
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button 
                onClick={() => onPublish()}
                disabled={isPublishing}
                className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-400 text-white font-mono font-bold py-3 px-8 rounded-lg shadow text-xs uppercase tracking-wider transition-colors"
              >
                {isPublishing ? 'Publishing…' : '🚀 Generate & Publish Quiz'}
              </button>
            </div>
            {publishError ? (
              <p className="mt-3 text-sm text-rose-600">{publishError}</p>
            ) : null}
          </div>

          {/* QR & Code Matrix Right Column */}
          <div className="flex flex-col items-center justify-center border-t-2 md:border-t-0 md:border-l-2 border-slate-200 pt-6 md:pt-0 md:pl-6 text-center">
            <span className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">Mobile Scanner Gateway</span>
            
            {/* The Native HTML Canvas Target Frame */}
            <div className="bg-white border-2 border-slate-300 p-2 rounded-xl shadow-sm overflow-hidden flex items-center justify-center">
              <canvas ref={canvasRef} />
            </div>
            
            <div className="mt-5 w-full bg-slate-900 text-white rounded-xl py-3 px-4">
              <span className="block text-[10px] font-mono tracking-widest text-slate-400 uppercase">Access Code Entry</span>
              <span className="text-2xl font-black font-mono tracking-widest text-[#4FD1C5]">{accessCode}</span>
            </div>
          </div>

        </div>
      ) : (
        /* Preview Mode Section */
        <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl p-6 space-y-4">
          <div className="bg-white border border-slate-200 p-6 rounded-lg shadow-sm text-center max-w-sm mx-auto space-y-4">
            <h4 className="font-bold text-base text-slate-800">Security Verification Required</h4>
            <p className="text-xs text-slate-500">Scan verified link or enter the 4-digit code provided by your instructor to begin.</p>
            <input type="text" placeholder="0 0 0 0" maxLength="4" className="w-full text-center tracking-widest font-mono text-xl font-bold border-2 border-slate-300 p-2 bg-slate-50 rounded-lg bg-slate-100" disabled />
          </div>
        </div>
      )}

    </div>
  );
}