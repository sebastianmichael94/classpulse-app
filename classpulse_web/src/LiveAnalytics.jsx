import React from 'react';

export default function LiveAnalytics({ activeSubmissions, chartData }) {
  const totalAnswers = Object.values(chartData).reduce((a, b) => a + b, 0) || 1;

  return (
    <div className="w-full max-w-3xl bg-white border-2 border-slate-300 rounded-xl p-6 md:p-8 shadow-md text-slate-900">
      <div className="mb-6 border-b-2 border-slate-200 pb-3 flex flex-wrap justify-between items-end gap-2">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Module 3: Live Response Analytics Dashboard</h2>
          <p className="text-xs text-slate-500 font-mono font-bold uppercase tracking-wider">Professor Lecture Telemetry Stream</p>
        </div>
        <div className="bg-indigo-50 border border-indigo-200 px-4 py-1.5 rounded-lg text-center">
          <span className="block text-[9px] font-mono font-bold text-indigo-500 uppercase tracking-wider">Submissions Link Stream</span>
          <span className="text-base font-black text-indigo-700 font-mono">{activeSubmissions} Active</span>
        </div>
      </div>

      {/* Structured Bar Chart UI Row Mock */}
      <div className="space-y-4">
        <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Live Aggregation Ratios (Mocked Telemetry)</span>
        
        {Object.entries(chartData).map(([optionKey, count]) => {
          const ratioPercentage = Math.round((count / totalAnswers) * 100);

          return (
            <div key={optionKey} className="space-y-1">
              <div className="flex justify-between text-xs font-bold text-slate-700">
                <span>Option {optionKey}</span>
                <span>{count} Students ({ratioPercentage}%)</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-4 border border-slate-200 overflow-hidden">
                <div 
                  className="bg-indigo-600 h-full transition-all duration-500 border-r border-indigo-700" 
                  style={{ width: `${Math.max(ratioPercentage, 2)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}