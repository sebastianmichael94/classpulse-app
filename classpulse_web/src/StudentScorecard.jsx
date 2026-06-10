import React from 'react';

export default function StudentScorecard({ score, totalPoints, studentName, quizTitle, onResetMock }) {
  const percentage = Math.round((score / totalPoints) * 100) || 0;

  return (
    <div className="w-full max-w-md bg-white border-2 border-slate-300 rounded-xl p-6 shadow-md text-slate-900 text-center">
      <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3 border border-emerald-300">
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
      </div>

      <h3 className="text-xl font-bold text-slate-800">Submission Receipt Confirmed</h3>
      <p className="text-xs text-slate-500 font-mono uppercase tracking-wider font-bold mt-0.5">Module 2: Client Scorecard</p>
      
      <div className="my-6 border-y-2 border-slate-100 py-4 text-left space-y-2 text-sm font-medium text-slate-700">
        <p>🏫 <span className="text-slate-400">Quiz Context:</span> <span className="text-slate-900 font-bold">{quizTitle || 'Default Sandbox Quiz'}</span></p>
        <p>👤 <span className="text-slate-400">Student Identity:</span> <span className="text-slate-900 font-bold">{studentName || 'Anonymous Identity'}</span></p>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 mb-4">
        <span className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Automated Grade Matrix</span>
        <div className="text-4xl font-black text-slate-800 tracking-tight">
          {score} <span className="text-xl text-slate-400 font-normal">/ {totalPoints} Pts</span>
        </div>
        <div className={`mt-2 text-xs font-mono font-bold inline-block px-2.5 py-0.5 rounded-full border ${
          percentage >= 75 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'
        }`}>
          Performance Index: {percentage}%
        </div>
      </div>

      <button onClick={onResetMock} className="text-xs font-bold text-slate-500 hover:text-indigo-600 underline tracking-wide font-mono uppercase block mx-auto">
        🔄 Simulate New Student Loop
      </button>
    </div>
  );
}