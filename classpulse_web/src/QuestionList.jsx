import React from 'react';

export default function QuestionList({ questions }) {
  if (questions.length === 0) {
    return (
      <div className="w-full max-w-3xl bg-white border-2 border-dashed border-slate-300 rounded-xl p-8 text-center text-slate-500">
        <p className="font-medium">No questions yet.</p>
        <p className="text-xs mt-1">Use the builder above to add your first question.</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl bg-white border-2 border-slate-300 rounded-xl p-6 md:p-8 shadow-md text-slate-900 mt-8">
      <div className="mb-4 border-b-2 border-slate-200 pb-3">
        <h3 className="text-xl font-bold text-slate-800">Question List ({questions.length})</h3>
        <p className="text-xs text-slate-500 font-mono mt-0.5 uppercase tracking-wider">Current questions</p>
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
                q.question_type === 'essay_question' || q.question_type === 'Essay Question' || q.question_type === 'Essay' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                'bg-indigo-50 text-indigo-700 border-indigo-200'
              }`}>
                {q.question_type.replace('_', ' ')}
              </span>
            </div>

            {/* Question Text */}
            <p className="text-sm text-slate-600 italic font-medium mb-3">"{q.question_text}"</p>

            {/* Nested Configuration Details */}
            <div className="text-xs bg-white border border-slate-200 rounded-lg p-3 font-mono text-slate-700">
              <span className="block font-bold text-slate-500 text-[10px] uppercase tracking-wider mb-1">Question details:</span>
              
              {(q.question_type === 'multiple_choice_question' || q.question_type === 'true_false_question') && (
                <div>
                  <p>
                    Options: [
                    {(q.interaction_data.options || []).map((option, index) => (
                      option && typeof option === 'object'
                        ? (option.text || `Option ${index + 1}`)
                        : String(option || `Option ${index + 1}`)
                    )).join(', ')}
                    ]
                  </p>
                  <p className="text-indigo-600 font-bold mt-0.5">
                    Correct answer index: {q.interaction_data.correct_index}
                  </p>
                </div>
              )}

              {(q.question_type === 'Matching' || q.question_type === 'matching_question') && (
                <div>
                  <p>Left items: {(q.interaction_data.left_items || []).length}</p>
                  <p>Right options: {(q.interaction_data.right_options || []).length} (includes distractors)</p>
                  <p className="text-indigo-600 font-bold mt-0.5">
                    Mappings: {Object.entries(q.interaction_data.correct_mapping || {}).map(([leftId, rightId]) => `${leftId}->${rightId}`).join(', ') || 'None'}
                  </p>
                </div>
              )}

              {(q.question_type === 'essay_question' || q.question_type === 'Essay Question' || q.question_type === 'Essay') && (
                <p className="text-slate-500 italic">Open-ended question. Students can write their own answers.</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}