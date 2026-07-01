import React, { useState } from 'react';

export default function QuizCreator({ onSaveQuestion }) {
  const [title, setTitle] = useState('');
  const [questionText, setQuestionText] = useState('');
  const [type, setType] = useState('multiple_choice_question');
  
  // MCQ/True-False Options State
  const [options, setOptions] = useState(['', '']);
  const [correctOption, setCorrectOption] = useState(0);

  // Formula Question State
  const [formula, setFormula] = useState('');
  const [variableMin, setVariableMin] = useState('1');
  const [variableMax, setVariableMax] = useState('10');

  // Intercept type changes to automatically prepopulate True/False structures
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
    <div className="w-full max-w-3xl bg-white border-2 border-slate-300 rounded-xl p-6 md:p-8 shadow-md text-slate-900">
      
      <div className="mb-6 border-b-2 border-slate-200 pb-4">
        <h2 className="text-2xl font-bold text-slate-800">Canvas-Engine Question Builder</h2>
        <p className="text-xs text-slate-500 font-mono mt-1 font-bold uppercase tracking-wider">Module: Sandbox Compiler</p>
      </div>

      <form onSubmit={handleFormSubmit} className="space-y-6">
        
        {/* Row 1: Title & Type Selection */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Question Title</label>
            <input 
              type="text" 
              value={title} 
              onChange={(e) => setTitle(e.target.value)} 
              placeholder="e.g., Quiz 1: Scale Constraint" 
              className="w-full px-4 py-2 border-2 border-slate-300 text-slate-900 rounded-lg focus:outline-none focus:border-indigo-600 bg-slate-50 font-medium" 
              required 
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Canvas Question Type</label>
            <select 
              value={type} 
              onChange={(e) => handleTypeChange(e.target.value)}
              className="w-full px-4 py-2 border-2 border-slate-300 text-slate-900 rounded-lg focus:outline-none focus:border-indigo-600 bg-slate-50 font-medium cursor-pointer"
            >
              <option value="multiple_choice_question">Multiple Choice</option>
              <option value="true_false_question">True/False</option>
              <option value="essay_question">Essay Question</option>
              <option value="formula_question">Formula Question</option>
            </select>
          </div>
        </div>

        {/* Row 2: Prompt Input */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Question Text / Stem</label>
          <textarea 
            rows="3" 
            value={questionText} 
            onChange={(e) => setQuestionText(e.target.value)} 
            placeholder={type === 'formula_question' ? "What is 5 multiplied by `x`?" : "Type the core academic question prompt here..."} 
            className="w-full p-4 border-2 border-slate-300 text-slate-900 rounded-lg focus:outline-none focus:border-indigo-600 bg-slate-50 text-base font-medium resize-none" 
            required 
          />
        </div>

        {/* Dynamic Parameter Settings Layout panels */}
        {type === 'multiple_choice_question' && (
          <div className="bg-slate-100 border-2 border-slate-200 p-5 rounded-xl space-y-4">
            <span className="block text-xs font-bold text-indigo-700 tracking-wider">MULTIPLE CHOICE OPTIONS</span>
            {options.map((option, index) => (
              <div key={index} className="flex items-center gap-4">
                <input 
                  type="radio" 
                  name="correct_choice" 
                  checked={correctOption === index} 
                  onChange={() => setCorrectOption(index)} 
                  className="w-5 h-5 text-indigo-600 border-slate-400 cursor-pointer" 
                />
                <input 
                  type="text" 
                  value={option} 
                  onChange={(e) => handleOptionChange(index, e.target.value)} 
                  placeholder={`Choice ${String.fromCharCode(65 + index)}`} 
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-900 bg-white rounded-lg text-sm font-medium focus:outline-none focus:border-indigo-500" 
                  required 
                />
              </div>
            ))}
            <button 
              type="button" 
              onClick={handleAddOption} 
              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 underline block mt-2"
            >
              + ADD CUSTOM OPTION ROW
            </button>
          </div>
        )}

        {type === 'true_false_question' && (
          <div className="bg-slate-100 border-2 border-slate-200 p-5 rounded-xl space-y-4">
            <span className="block text-xs font-bold text-amber-700 tracking-wider">TRUE / FALSE CONFIGURATION (Select the correct truth value)</span>
            {options.slice(0, 2).map((option, index) => (
              <div key={index} className="flex items-center gap-4 py-2">
                <input 
                  type="radio" 
                  name="correct_choice" 
                  checked={correctOption === index} 
                  onChange={() => setCorrectOption(index)} 
                  className="w-5 h-5 text-amber-600 border-slate-400 cursor-pointer" 
                />
                <span className="text-base font-bold text-slate-800">{option}</span>
              </div>
            ))}
          </div>
        )}

        {type === 'formula_question' && (
          <div className="bg-slate-100 border-2 border-slate-200 p-5 rounded-xl space-y-4">
            <span className="block text-xs font-bold text-emerald-700 tracking-wider">ALGEBRAIC VARIABLE ENGINE</span>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-1">VARIABLE `x` MIN RANGE</label>
                <input 
                  type="number" 
                  value={variableMin} 
                  onChange={(e) => setVariableMin(e.target.value)} 
                  className="w-full px-3 py-2 border border-slate-300 bg-white text-slate-900 rounded-lg text-sm font-medium" 
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-1">VARIABLE `x` MAX RANGE</label>
                <input 
                  type="number" 
                  value={variableMax} 
                  onChange={(e) => setVariableMax(e.target.value)} 
                  className="w-full px-3 py-2 border border-slate-300 bg-white text-slate-900 rounded-lg text-sm font-medium" 
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-600 mb-1">FORMULA DEFINITION (EXCLUDING EQUAL SIGN)</label>
              <input 
                type="text" 
                value={formula} 
                onChange={(e) => setFormula(e.target.value)} 
                placeholder="e.g., 5 * x" 
                className="w-full px-3 py-2 border border-slate-300 bg-white text-slate-900 font-mono text-sm rounded-lg focus:outline-none focus:border-emerald-600" 
                required 
              />
            </div>
          </div>
        )}

        {/* Action Button */}
        <div className="flex justify-end pt-2">
          <button 
            type="submit" 
            className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-8 rounded-lg shadow transition-colors text-sm tracking-wider uppercase"
          >
            Compile Canvas Structure
          </button>
        </div>
      </form>
    </div>
  );
}