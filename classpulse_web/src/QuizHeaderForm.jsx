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
    <div className="w-full max-w-3xl bg-white border-2 border-slate-300 rounded-xl p-6 md:p-8 shadow-md text-slate-900">
      <div className="mb-4 border-b-2 border-slate-200 pb-3">
        <h2 className="text-xl font-bold text-slate-800">Module 1: Overarching Quiz Metadata</h2>
        <p className="text-xs text-slate-500 font-mono font-bold uppercase tracking-wider">Parent Container Definition</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Quiz Master Title</label>
            <input 
              type="text" 
              value={title} 
              onChange={(e) => setTitle(e.target.value)} 
              placeholder="e.g., Chapter 4: Distributed System Architectures" 
              className="w-full px-3 py-2 border-2 border-slate-300 text-slate-900 rounded-lg bg-slate-50 font-medium text-sm focus:outline-none focus:border-indigo-600"
              required 
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Time Limit (Minutes)</label>
            <input 
              type="number" 
              value={timeLimit} 
              onChange={(e) => setTimeLimit(e.target.value)} 
              className="w-full px-3 py-2 border-2 border-slate-300 text-slate-900 rounded-lg bg-slate-50 font-medium text-sm focus:outline-none focus:border-indigo-600"
              required 
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Instructions / Meta Notes</label>
          <textarea 
            rows="2" 
            value={instructions} 
            onChange={(e) => setInstructions(e.target.value)} 
            placeholder="Provide any grading notes or context for Dr. Reshma's class here..." 
            className="w-full p-3 border-2 border-slate-300 text-slate-900 rounded-lg bg-slate-50 text-sm font-medium resize-none focus:outline-none focus:border-indigo-600"
          />
        </div>

        <div className="flex justify-end">
          <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-mono font-bold py-2 px-6 rounded-lg text-xs uppercase tracking-wider transition-colors shadow">
            Lock Quiz Envelope
          </button>
        </div>
      </form>
    </div>
  );
}