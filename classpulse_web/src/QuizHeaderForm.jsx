import React, { useState } from 'react';

export default function QuizHeaderForm({ onSaveHeader }) {
  const [title, setTitle] = useState('');
  const [timeLimit, setTimeLimit] = useState('15');
  const [instructions, setInstructions] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onSaveHeader({ title, timeLimit: parseInt(timeLimit), instructions });
  };

  return (
    <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8 shadow-2xl text-slate-100 transition-all duration-300">
      <div className="mb-6 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
          <h2 className="text-lg font-semibold text-slate-200 tracking-tight">Step 1: Quiz Basics & Timer</h2>
        </div>
        <p className="text-xs text-slate-400 mt-1">Set your quiz title, timer, and clear instructions for students.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Quiz Title</label>
            <input 
              type="text" 
              value={title} 
              onChange={(e) => setTitle(e.target.value)} 
              placeholder="e.g., Week 4 Quiz: Photosynthesis Basics" 
              className="w-full px-4 py-3 bg-slate-950 border border-slate-800 text-slate-100 rounded-xl font-medium text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 placeholder-slate-600 transition-all"
              required 
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Quiz Timer (Minutes)</label>
            <input 
              type="number" 
              value={timeLimit} 
              onChange={(e) => setTimeLimit(e.target.value)} 
              className="w-full px-4 py-3 bg-slate-950 border border-slate-800 text-slate-100 rounded-xl font-medium text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
              required 
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Class Instructions</label>
          <textarea 
            rows="3" 
            value={instructions} 
            onChange={(e) => setInstructions(e.target.value)} 
            placeholder="Add simple instructions students should follow before they start." 
            className="w-full p-4 bg-slate-950 border border-slate-800 text-slate-100 rounded-xl text-sm font-medium resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 placeholder-slate-600 transition-all"
          />
        </div>

        <div className="flex justify-end pt-2">
          <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2.5 px-6 rounded-xl text-xs uppercase tracking-widest transition-all shadow-lg shadow-indigo-600/20 active:scale-[0.98]">
            Save Quiz Basics
          </button>
        </div>
      </form>
    </div>
  );
}