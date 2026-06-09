import React, { useState } from 'react';

export default function QuestionPlayer({ question, onSubmitAnswer }) {
  const [mcqSelection, setMcqSelection] = useState(null);
  const [textResponse, setTextResponse] = useState('');

  const handleFormSubmit = (e) => {
    e.preventDefault();
    
    // Construct a unified response payload structure
    const payload = {
      question_id: question.id,
      type: question.type,
      // Backend expects dynamic data inside answer_data based on our JSONField architecture
      answer_data: question.type === 'MCQ' 
        ? { selected_index: mcqSelection, text_value: question.options[mcqSelection] }
        : { text_value: textResponse }
    };

    onSubmitAnswer(payload);
  };

  return (
    <div className="w-full max-w-2xl bg-[#111827] border border-[#1F2937] rounded-3xl p-6 md:p-10 shadow-xl">
      {/* Component Metadata Tag */}
      <div className="mb-4">
        <span className="text-xs font-mono bg-indigo-950 text-indigo-300 border border-indigo-800 px-3 py-1 rounded-full uppercase tracking-wider">
          {question.type === 'MCQ' ? 'Multiple Choice Question' : 'Short Answer Response'}
        </span>
      </div>

      {/* Question Text */}
      <h3 className="text-xl md:text-2xl font-semibold text-white leading-relaxed">
        {question.text}
      </h3>

      {/* Conditionally Render Input Controls based on Question Type */}
      <form onSubmit={handleFormSubmit} className="mt-8 space-y-5">
        
        {question.type === 'MCQ' && (
          <div className="space-y-3">
            {question.options?.map((option, index) => (
              <button
                key={index}
                type="button"
                onClick={() => setMcqSelection(index)}
                className={`w-full text-left px-5 py-4 rounded-xl border transition-all duration-150 flex items-center ${
                  mcqSelection === index
                    ? 'bg-indigo-950 border-[#4FD1C5] text-white shadow-md'
                    : 'bg-[#0A0E17] border-[#1F2937] text-slate-300 hover:border-slate-700'
                }`}
              >
                <span className={`w-6 h-6 rounded-full border mr-4 flex items-center justify-center font-mono text-xs ${
                  mcqSelection === index ? 'border-[#4FD1C5] bg-[#4FD1C5] text-[#0A0E17] font-bold' : 'border-slate-600'
                }`}>
                  {String.fromCharCode(65 + index)}
                </span>
                <span className="text-sm md:text-base font-medium">{option}</span>
              </button>
            ))}
          </div>
        )}

        {question.type === 'SHORT_ANSWER' && (
          <div>
            <textarea
              rows="4"
              value={textResponse}
              onChange={(e) => setTextResponse(e.target.value)}
              placeholder="Type your short answer response here..."
              className="w-full p-4 bg-[#0A0E17] border border-[#1F2937] text-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#4FD1C5] font-sans placeholder-slate-600 text-sm md:text-base resize-none"
              required
            />
          </div>
        )}

        {/* Dynamic Submission Disabling State Logic */}
        <div className="pt-4 flex justify-end">
          <button
            type="submit"
            disabled={question.type === 'MCQ' ? mcqSelection === null : !textResponse.trim()}
            className="w-full md:w-auto bg-[#4FD1C5] hover:bg-[#38B2AC] disabled:bg-slate-800 disabled:text-slate-500 text-[#0A0E17] font-bold py-3 px-8 rounded-xl transition-all shadow-md tracking-wide text-sm uppercase font-mono"
          >
            Submit Answer
          </button>
        </div>
      </form>
    </div>
  );
}