import React from 'react';

export default function QuestionList({ questions }) {
  if (questions.length === 0) {
    return (
      <div className="w-full max-w-3xl bg-white border-2 border-dashed border-slate-300 rounded-xl p-8 text-center text-slate-500">
        <p className="font-medium">No questions compiled in this sandbox database session yet.</p>
        <p className="text-xs mt-1">Use the builder above to compile and serialize your first question structure.</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl bg-white border-2 border-slate-300 rounded-xl p-6 md:p-8 shadow-md text-slate-900 mt-8">
      <div className="mb-4 border-b-2 border-slate-200 pb-3">
        <h3 className="text-xl font-bold text-slate-800">Active Question Bank ({questions.length})</h3>
        <p className="text-xs text-slate-500 font-mono mt-0.5 uppercase tracking-wider">Module: Local Data Store View</p>
      </div>

      <div className="space-y-4">
        {questions.map((q, index) => (
          <div key={index} className="border border-slate-200 p-4 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors">
            {/* Header row: Title and Type Badge */}
            <div className="flex flex-wrap justify-between items-center gap-2 mb-2">
              <h4 className="font-bold text-slate-800 text-base">
                {index + 1}. {q.title || 'Untitled Question'}
              </h4>
              <span className={`text-[10px] font-mono font-bold uppercase tracking-wider px-2.5 py-1 rounded-md border ${
                q.question_type === 'formula_question' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                q.question_type === 'essay_question' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                'bg-indigo-50 text-indigo-700 border-indigo-200'
              }`}>
                {q.question_type.replace('_', ' ')}
              </span>
            </div>

            {/* Question Text */}
            <p className="text-sm text-slate-600 italic font-medium mb-3">"{q.question_text}"</p>

            {/* Nested Configuration Details */}
            <div className="text-xs bg-white border border-slate-200 rounded-lg p-3 font-mono text-slate-700">
              <span className="block font-bold text-slate-500 text-[10px] uppercase tracking-wider mb-1">Compiled Payload Meta:</span>
              
              {(q.question_type === 'multiple_choice_question' || q.question_type === 'true_false_question') && (
                <div>
                  <p>Options: [{q.interaction_data.options.join(', ')}]</p>
                  <p className="text-indigo-600 font-bold mt-0.5">Correct Index Pointer: {q.interaction_data.correct_index} (👉 {q.interaction_data.options[q.interaction_data.correct_index]})</p>
                </div>
              )}

              {q.question_type === 'essay_question' && (
                <p className="text-slate-500 italic">Open-ended layout container. Input data tracking will bypass evaluation constraints.</p>
              )}

              {q.question_type === 'formula_question' && (
                <div>
                  <p>Evaluation String Expression: f(x) = {q.interaction_data.formula}</p>
                  <p className="text-emerald-600 font-bold mt-0.5">Variable Threshold bounds: x ∈ [{q.interaction_data.variables.x.min}, {q.interaction_data.variables.x.max}]</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}