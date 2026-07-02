import React, { useState } from 'react';

export default function QuizCreator({ onSaveQuestion }) {
  const [title, setTitle] = useState('');
  const [questionText, setQuestionText] = useState('');
  const [type, setType] = useState('multiple_choice_question');
  
  const [options, setOptions] = useState(['', '']);
  const [correctOption, setCorrectOption] = useState(0);

  const [formula, setFormula] = useState('');
  const [variableMin, setVariableMin] = useState('1');
  const [variableMax, setVariableMax] = useState('10');

  const handleTypeChange = (newType) => {
    setType(newType);
    if (newType === 'true_false_question') {
      setOptions(['True', 'False']);
      setCorrectOption(0);
    } else if (newType === 'multiple_choice_question') {
      setOptions(['', '']);
      setCorrectOption(0);
    }
  };

  const handleAddOption = () => setOptions([...options, '']);
  
  const handleOptionChange = (index, value) => {
    const updated = [...options];
    updated[index] = value;
    setOptions(updated);
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();

    const configuration = {
      title,
      question_text: questionText,
      question_type: type,
      interaction_data: {}
    };

    if (type === 'multiple_choice_question' || type === 'true_false_question') {
      configuration.interaction_data = {
        options,
        correct_index: correctOption
      };
    } else if (type === 'formula_question') {
      configuration.interaction_data = {
        formula,
        variables: {
          x: { min: parseFloat(variableMin), max: parseFloat(variableMax) }
        }
      };
    }

    onSaveQuestion(configuration);
    setTitle('');
    setQuestionText('');
    setType('multiple_choice_question');
    setOptions(['', '']);
    setCorrectOption(0);
    setFormula('');
    setVariableMin('1');
    setVariableMax('10');
  };

  return (
    <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8 shadow-2xl text-slate-100 transition-all duration-300">
      
      <div className="mb-6 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-violet-500 animate-pulse" />
          <h2 className="text-lg font-semibold text-slate-200 tracking-tight">Step 2: Question Canvas Compiler</h2>
        </div>
        <p className="text-xs text-slate-400 mt-1">Compile individual algorithmic or plain-text evaluation matrices to the active array queue.</p>
      </div>

      <form onSubmit={handleFormSubmit} className="space-y-6">
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Question Identity Label</label>
            <input 
              type="text" 
              value={title} 
              onChange={(e) => setTitle(e.target.value)} 
              placeholder="e.g., Question 1: CAP Theorem Balance" 
              className="w-full px-4 py-3 bg-slate-950 border border-slate-800 text-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 font-medium text-sm placeholder-slate-600 transition-all" 
              required 
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Structural Component Matrix</label>
            <select 
              value={type} 
              onChange={(e) => handleTypeChange(e.target.value)}
              className="w-full px-4 py-3 bg-slate-950 border border-slate-800 text-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 font-medium text-sm cursor-pointer transition-all"
            >
              <option value="multiple_choice_question">Multiple Choice Matrix</option>
              <option value="true_false_question">True / False Constant</option>
              <option value="essay_question">Free-Form Qualitative Essay</option>
              <option value="formula_question">Algorithmic LaTeX Formula</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Question Prompt String (Supports LaTeX $$...$$)</label>
          <textarea 
            rows="3" 
            value={questionText} 
            onChange={(e) => setQuestionText(e.target.value)} 
            placeholder={type === 'formula_question' ? "What is the result when evaluating $$f(x) = x^2 + 5$$?" : "Type the structural assessment question prompt here..."} 
            className="w-full p-4 bg-slate-950 border border-slate-800 text-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-sm font-medium resize-none placeholder-slate-600 transition-all" 
            required 
          />
        </div>

        {type === 'multiple_choice_question' && (
          <div className="bg-slate-950 border border-slate-850 p-5 rounded-xl space-y-4 shadow-inner">
            <span className="block text-xs font-semibold text-indigo-400 tracking-wider">MULTIPLE CHOICE VARIATION MATRIX</span>
            {options.map((option, index) => (
              <div key={index} className="flex items-center gap-4 group">
                <input 
                  type="radio" 
                  name="correct_choice" 
                  checked={correctOption === index} 
                  onChange={() => setCorrectOption(index)} 
                  className="w-4 h-4 text-indigo-600 border-slate-800 focus:ring-offset-slate-950 focus:ring-indigo-500 cursor-pointer bg-slate-900" 
                />
                <input 
                  type="text" 
                  value={option} 
                  onChange={(e) => handleOptionChange(index, e.target.value)} 
                  placeholder={`Choice Verification Index ${String.fromCharCode(65 + index)}`} 
                  className="flex-1 px-4 py-2.5 bg-slate-900 border border-slate-800 text-slate-100 rounded-xl text-sm font-medium focus:outline-none focus:border-indigo-500 placeholder-slate-600 transition-all" 
                  required 
                />
              </div>
            ))}
            <button 
              type="button" 
              onClick={handleAddOption} 
              className="text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors inline-flex items-center gap-1 mt-1"
            >
              + Append Dynamic Choice Variant
            </button>
          </div>
        )}

        {type === 'true_false_question' && (
          <div className="bg-slate-950 border border-slate-850 p-5 rounded-xl space-y-4 shadow-inner">
            <span className="block text-xs font-semibold text-amber-400 tracking-wider">TRUE / FALSE CONSTANT KEY EVALUATION</span>
            {options.slice(0, 2).map((option, index) => (
              <div key={index} className="flex items-center gap-4 py-1.5 px-4 bg-slate-900 border border-slate-800 rounded-xl hover:border-slate-700 transition-all">
                <input 
                  type="radio" 
                  name="correct_choice" 
                  checked={correctOption === index} 
                  onChange={() => setCorrectOption(index)} 
                  className="w-4 h-4 text-amber-500 border-slate-800 bg-slate-900" 
                />
                <span className="text-sm font-medium text-slate-300">{option}</span>
              </div>
            ))}
          </div>
        )}

        {type === 'formula_question' && (
          <div className="bg-slate-950 border border-slate-850 p-5 rounded-xl space-y-4 shadow-inner">
            <span className="block text-xs font-semibold text-emerald-400 tracking-wider">VARIABLE EVALUATION PARSER CONFIGURATION</span>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-medium text-slate-400 mb-2 tracking-wide">VARIABLE `x` INCLUSIVE MIN BOUND</label>
                <input 
                  type="number" 
                  value={variableMin} 
                  onChange={(e) => setVariableMin(e.target.value)} 
                  className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 text-slate-100 rounded-xl text-sm font-medium focus:outline-none" 
                />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-slate-400 mb-2 tracking-wide">VARIABLE `x` INCLUSIVE MAX BOUND</label>
                <input 
                  type="number" 
                  value={variableMax} 
                  onChange={(e) => setVariableMax(e.target.value)} 
                  className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 text-slate-100 rounded-xl text-sm font-medium focus:outline-none" 
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-slate-400 mb-2 tracking-wide">ALGEBRAIC SYNTAX FORMULA STRING (EVAL MATRIX)</label>
              <input 
                type="text" 
                value={formula} 
                onChange={(e) => setFormula(e.target.value)} 
                placeholder="e.g., x * 5 + 12" 
                className="w-full px-4 py-3 bg-slate-900 border border-slate-800 text-slate-100 font-mono text-sm rounded-xl focus:outline-none focus:border-emerald-500 placeholder-slate-600 transition-all" 
                required 
              />
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button 
            type="submit" 
            className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-3 px-8 rounded-xl shadow-lg shadow-indigo-600/20 transition-all text-xs tracking-widest uppercase active:scale-[0.98]"
          >
            Compile Framework Element
          </button>
        </div>
      </form>
    </div>
  );
}