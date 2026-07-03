import { useState } from 'react';

const QUESTION_TYPES = [
  'Multiple Choice',
  'True/False',
  'Fill In the Blank',
  'Fill In Multiple Blanks',
  'Multiple Answers',
  'Multiple Dropdowns',
  'Matching',
  'Numerical Answer',
  'Formula Question',
  'Essay Question',
  'File Upload Question',
  'Text (no question)',
];

export default function QuizCreator({ onSaveQuestion }) {
  const [title, setTitle] = useState('');
  const [questionText, setQuestionText] = useState('');
  const [type, setType] = useState('Multiple Choice');
  
  const [options, setOptions] = useState(['', '']);
  const [correctOption, setCorrectOption] = useState(0);
  const [correctOptions, setCorrectOptions] = useState([]);

  const [formula, setFormula] = useState('');
  const [variableMin, setVariableMin] = useState('1');
  const [variableMax, setVariableMax] = useState('10');
  const [matchingPromptsText, setMatchingPromptsText] = useState('');
  const [matchingTargetsText, setMatchingTargetsText] = useState('');
  const [allowPeerUpvoting, setAllowPeerUpvoting] = useState(false);
  const [questionImageUrl, setQuestionImageUrl] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageUploadError, setImageUploadError] = useState('');

  const isOptionType = ['Multiple Choice', 'Multiple Answers', 'Multiple Dropdowns'].includes(type);
  const isPeerUpvotingType = ['Essay Question', 'Fill In the Blank', 'Fill In Multiple Blanks'].includes(type);

  const handleTypeChange = (newType) => {
    setType(newType);
    if (newType === 'True/False') {
      setOptions(['True', 'False']);
      setCorrectOption(0);
      setCorrectOptions([0]);
    } else if (['Multiple Choice', 'Multiple Answers', 'Multiple Dropdowns'].includes(newType)) {
      setOptions(['', '']);
      setCorrectOption(0);
      setCorrectOptions([]);
    }

    if (!['Essay Question', 'Fill In the Blank', 'Fill In Multiple Blanks'].includes(newType)) {
      setAllowPeerUpvoting(false);
    }
  };

  const handleAddOption = () => setOptions([...options, '']);

  const handleRemoveOption = (indexToRemove) => {
    if (options.length <= 2) return;

    setOptions((prevOptions) => prevOptions.filter((_, index) => index !== indexToRemove));
    setCorrectOption((prevCorrect) => {
      if (prevCorrect === indexToRemove) {
        return Math.max(0, indexToRemove - 1);
      }
      if (prevCorrect > indexToRemove) {
        return prevCorrect - 1;
      }
      return prevCorrect;
    });
    setCorrectOptions((prev) => prev.filter((index) => index !== indexToRemove).map((index) => (index > indexToRemove ? index - 1 : index)));
  };

  const toggleCorrectOption = (optionIndex) => {
    setCorrectOptions((prev) => {
      if (prev.includes(optionIndex)) {
        return prev.filter((index) => index !== optionIndex);
      }
      return [...prev, optionIndex].sort((a, b) => a - b);
    });
  };

  const parseLines = (value) =>
    String(value || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

  const uploadQuestionImage = async (file) => {
    if (!file) {
      return;
    }

    if (!String(file.type || '').startsWith('image/')) {
      setImageUploadError('Please select a valid image file.');
      return;
    }

    setIsUploadingImage(true);
    setImageUploadError('');

    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch('http://127.0.0.1:8000/api/assets/question-image/', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Unable to upload image.');
      }

      const payload = await response.json();
      setQuestionImageUrl(payload.question_image_url || '');
    } catch (error) {
      setImageUploadError(error.message || 'Unable to upload image.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleImageInputChange = async (event) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      await uploadQuestionImage(selectedFile);
    }
  };

  const handleImageDrop = async (event) => {
    event.preventDefault();
    const droppedFile = event.dataTransfer.files?.[0];
    if (droppedFile) {
      await uploadQuestionImage(droppedFile);
    }
  };
  
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
      question_image: questionImageUrl || null,
      question_image_url: questionImageUrl || null,
      question_type: type,
      allow_peer_upvoting: allowPeerUpvoting,
      interaction_data: {}
    };

    if (type === 'Multiple Choice' || type === 'True/False') {
      configuration.interaction_data = {
        options,
        correct_index: correctOption
      };
    } else if (type === 'Multiple Answers') {
      configuration.interaction_data = {
        options,
        correct_indices: correctOptions,
      };
    } else if (type === 'Multiple Dropdowns') {
      configuration.interaction_data = {
        options,
      };
    } else if (type === 'Matching') {
      configuration.interaction_data = {
        premises: parseLines(matchingPromptsText),
        targets: parseLines(matchingTargetsText),
      };
    } else if (type === 'Formula Question') {
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
    setType('Multiple Choice');
    setOptions(['', '']);
    setCorrectOption(0);
    setCorrectOptions([]);
    setFormula('');
    setVariableMin('1');
    setVariableMax('10');
    setMatchingPromptsText('');
    setMatchingTargetsText('');
    setAllowPeerUpvoting(false);
    setQuestionImageUrl('');
    setImageUploadError('');
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
              {QUESTION_TYPES.map((questionType) => (
                <option key={questionType} value={questionType}>{questionType}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Question Prompt String (Supports LaTeX $$...$$)</label>
          <textarea 
            rows="3" 
            value={questionText} 
            onChange={(e) => setQuestionText(e.target.value)} 
            placeholder={type === 'Formula Question' ? "What is the result when evaluating $$f(x) = x^2 + 5$$?" : "Type the structural assessment question prompt here..."} 
            className="w-full p-4 bg-slate-950 border border-slate-800 text-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-sm font-medium resize-none placeholder-slate-600 transition-all" 
            required 
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Question Diagram / Image Attachment</label>
          <div
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleImageDrop}
            className="border-2 border-dashed border-slate-700 bg-slate-950/40 rounded-xl p-5 text-center text-slate-400 hover:border-cyan-500/50 transition-all"
          >
            <p className="text-sm font-medium text-slate-300">📷 Add Diagram / Image</p>
            <p className="text-xs mt-1">Drag and drop an image here, or choose one manually.</p>
            <label className="mt-3 inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-200 cursor-pointer hover:border-cyan-400/60 hover:text-cyan-200 transition-all">
              {isUploadingImage ? 'Uploading...' : 'Select Image'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageInputChange}
                disabled={isUploadingImage}
              />
            </label>

            {questionImageUrl ? (
              <div className="mt-4 rounded-xl border border-slate-700 bg-slate-900/70 p-3">
                <img
                  src={questionImageUrl}
                  alt="Question attachment preview"
                  className="max-h-40 mx-auto rounded-lg border border-slate-700 object-contain"
                />
                <button
                  type="button"
                  onClick={() => setQuestionImageUrl('')}
                  className="mt-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 transition-all hover:bg-rose-500/20"
                >
                  Remove Image
                </button>
              </div>
            ) : null}

            {imageUploadError ? (
              <p className="mt-2 text-xs text-rose-300">{imageUploadError}</p>
            ) : null}
          </div>
        </div>

        {isPeerUpvotingType ? (
          <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-cyan-200">👥 Enable Student Peer Upvoting & Live Feed</p>
              <p className="text-xs text-slate-400 mt-1">Students can upvote classmates after submitting their own text response.</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={allowPeerUpvoting}
                onChange={(e) => setAllowPeerUpvoting(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-12 h-7 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:bg-cyan-500 transition-colors" />
              <div className="absolute left-1 top-1 h-5 w-5 rounded-full bg-white transition-transform peer-checked:translate-x-5" />
            </label>
          </div>
        ) : null}

        {isOptionType && (
          <div className="bg-slate-950 border border-slate-850 p-5 rounded-xl space-y-4 shadow-inner">
            <span className="block text-xs font-semibold text-indigo-400 tracking-wider">CHOICE CONFIGURATION MATRIX</span>
            {options.map((option, index) => (
              <div key={index} className="flex items-center gap-4 group">
                {type === 'Multiple Answers' ? (
                  <input
                    type="checkbox"
                    checked={correctOptions.includes(index)}
                    onChange={() => toggleCorrectOption(index)}
                    className="w-4 h-4 text-indigo-600 border-slate-800 focus:ring-offset-slate-950 focus:ring-indigo-500 cursor-pointer bg-slate-900 rounded"
                  />
                ) : (
                  <input
                    type="radio"
                    name="correct_choice"
                    checked={correctOption === index}
                    onChange={() => setCorrectOption(index)}
                    className="w-4 h-4 text-indigo-600 border-slate-800 focus:ring-offset-slate-950 focus:ring-indigo-500 cursor-pointer bg-slate-900"
                  />
                )}
                <input 
                  type="text" 
                  value={option} 
                  onChange={(e) => handleOptionChange(index, e.target.value)} 
                  placeholder={`Choice Verification Index ${String.fromCharCode(65 + index)}`} 
                  className="flex-1 px-4 py-2.5 bg-slate-900 border border-slate-800 text-slate-100 rounded-xl text-sm font-medium focus:outline-none focus:border-indigo-500 placeholder-slate-600 transition-all" 
                  required 
                />
                <button
                  type="button"
                  onClick={() => handleRemoveOption(index)}
                  disabled={options.length <= 2}
                  className="text-xs font-medium text-slate-500 hover:text-rose-400 transition-colors disabled:text-slate-700 disabled:cursor-not-allowed"
                  aria-label={`Delete choice ${String.fromCharCode(65 + index)}`}
                  title={options.length <= 2 ? 'At least 2 choices are required' : 'Delete choice'}
                >
                  Delete
                </button>
              </div>
            ))}
            <button 
              type="button" 
              onClick={handleAddOption} 
              className="text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors inline-flex items-center gap-1 mt-1"
            >
              + Append Dynamic Choice Variant
            </button>
            {type === 'Multiple Dropdowns' ? (
              <p className="text-[11px] text-slate-500">Use bracket tokens in prompt text like [blank1], [blank2]. These options populate each dropdown.</p>
            ) : null}
          </div>
        )}

        {type === 'True/False' && (
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

        {type === 'Matching' && (
          <div className="bg-slate-950 border border-slate-850 p-5 rounded-xl space-y-4 shadow-inner">
            <span className="block text-xs font-semibold text-cyan-400 tracking-wider">MATCHING PAIR CONFIGURATION</span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-medium text-slate-400 mb-2 tracking-wide">LEFT COLUMN PREMISES (ONE PER LINE)</label>
                <textarea
                  rows="5"
                  value={matchingPromptsText}
                  onChange={(e) => setMatchingPromptsText(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-800 text-slate-100 rounded-xl text-sm font-medium resize-none focus:outline-none"
                  placeholder="Apple\nMercury\nPacific"
                />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-slate-400 mb-2 tracking-wide">RIGHT COLUMN TARGETS (ONE PER LINE)</label>
                <textarea
                  rows="5"
                  value={matchingTargetsText}
                  onChange={(e) => setMatchingTargetsText(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-800 text-slate-100 rounded-xl text-sm font-medium resize-none focus:outline-none"
                  placeholder="Fruit\nPlanet\nOcean"
                />
              </div>
            </div>
          </div>
        )}

        {type === 'Formula Question' && (
          <div className="bg-slate-950 border border-slate-850 p-5 rounded-xl space-y-4 shadow-inner">
            <span className="block text-xs font-semibold text-emerald-400 tracking-wider">VARIABLE EVALUATION PARSER CONFIGURATION</span>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-medium text-slate-400 mb-2 tracking-wide">VARIABLE x INCLUSIVE MIN BOUND</label>
                <input 
                  type="number" 
                  value={variableMin} 
                  onChange={(e) => setVariableMin(e.target.value)} 
                  className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 text-slate-100 rounded-xl text-sm font-medium focus:outline-none" 
                />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-slate-400 mb-2 tracking-wide">VARIABLE x INCLUSIVE MAX BOUND</label>
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