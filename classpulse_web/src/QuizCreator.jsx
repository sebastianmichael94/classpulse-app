import { useState } from 'react';
import { API_BASE_URL } from './apiClient';

const QUESTION_TYPES = [
  'Multiple Choice',
  'True/False',
  'Matching',
  'Fill In the Blank',
  'Essay',
];

const defaultChoice = (index, text = '') => ({
  id: String.fromCharCode(65 + index),
  text,
  image_url: null,
});

const TRUE_FALSE_OPTIONS = [
  defaultChoice(0, 'True'),
  defaultChoice(1, 'False'),
];

const defaultMatchingItem = (prefix, index, text = '') => ({
  id: `${prefix}${index + 1}`,
  text,
  image_url: null,
});

const withReindexedMatchingIds = (items = [], prefix = 'L') => items.map((item, index) => ({
  ...item,
  id: `${prefix}${index + 1}`,
}));

const normalizeMatchingItems = (rawItems = [], prefix = 'L') => {
  const items = Array.isArray(rawItems) ? rawItems : [];
  return withReindexedMatchingIds(items.map((item, index) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return {
        id: String(item.id || `${prefix}${index + 1}`).trim() || `${prefix}${index + 1}`,
        text: String(item.text || '').trim(),
        image_url: item.image_url ? String(item.image_url).trim() : null,
      };
    }

    return defaultMatchingItem(prefix, index, String(item || '').trim());
  }), prefix);
};

const normalizeChoiceOptions = (rawOptions = []) => {
  const options = Array.isArray(rawOptions) ? rawOptions : [];

  return options.map((option, index) => {
    if (option && typeof option === 'object' && !Array.isArray(option)) {
      const optionId = String(option.id || String.fromCharCode(65 + index)).trim() || String.fromCharCode(65 + index);
      return {
        id: optionId,
        text: String(option.text || '').trim(),
        image_url: option.image_url ? String(option.image_url).trim() : null,
      };
    }

    return defaultChoice(index, String(option || '').trim());
  });
};

const withReindexedChoiceIds = (options = []) => options.map((option, index) => ({
  ...option,
  id: String.fromCharCode(65 + index),
}));

export default function QuizCreator({ onSaveQuestion, questionList = [], onDeleteQuestion, onReorderQuestion }) {
  const [title, setTitle] = useState('');
  const [questionText, setQuestionText] = useState('');
  const [type, setType] = useState('Multiple Choice');
  
  const [options, setOptions] = useState([defaultChoice(0), defaultChoice(1)]);
  const [correctOption, setCorrectOption] = useState(0);
  const [allowPeerUpvoting, setAllowPeerUpvoting] = useState(false);
  const [questionImageUrl, setQuestionImageUrl] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageUploadError, setImageUploadError] = useState('');
  const [uploadingChoiceIndex, setUploadingChoiceIndex] = useState(null);
  const [choiceImageError, setChoiceImageError] = useState('');
  const [matchingLeftItems, setMatchingLeftItems] = useState([
    defaultMatchingItem('L', 0),
    defaultMatchingItem('L', 1),
  ]);
  const [matchingRightOptions, setMatchingRightOptions] = useState([
    defaultMatchingItem('R', 0),
    defaultMatchingItem('R', 1),
  ]);
  const [matchingCorrectMap, setMatchingCorrectMap] = useState({
    L1: 'R1',
    L2: 'R2',
  });
  const [matchingImageError, setMatchingImageError] = useState('');
  const [uploadingMatchingItem, setUploadingMatchingItem] = useState(null);
  const [editingQuestionIndex, setEditingQuestionIndex] = useState(null);

  const isOptionType = type === 'Multiple Choice';
  const isPeerUpvotingType = ['Essay', 'Essay Question', 'Fill In the Blank'].includes(type);

  const handleTypeChange = (newType) => {
    setType(newType);
    if (newType === 'True/False') {
      setOptions(withReindexedChoiceIds(TRUE_FALSE_OPTIONS));
      setCorrectOption(0);
    } else if (newType === 'Multiple Choice') {
      setOptions([defaultChoice(0), defaultChoice(1)]);
      setCorrectOption(0);
    } else if (newType === 'Matching') {
      const defaultLeft = [defaultMatchingItem('L', 0), defaultMatchingItem('L', 1)];
      const defaultRight = [defaultMatchingItem('R', 0), defaultMatchingItem('R', 1), defaultMatchingItem('R', 2)];
      setMatchingLeftItems(defaultLeft);
      setMatchingRightOptions(defaultRight);
      setMatchingCorrectMap({
        L1: 'R1',
        L2: 'R2',
      });
    }

    if (!['Essay', 'Essay Question', 'Fill In the Blank'].includes(newType)) {
      setAllowPeerUpvoting(false);
    }
  };

  const handleAddOption = () => {
    setOptions((prev) => withReindexedChoiceIds([...prev, defaultChoice(prev.length)]));
  };

  const handleRemoveOption = (indexToRemove) => {
    if (options.length <= 2) return;

    setOptions((prevOptions) => withReindexedChoiceIds(prevOptions.filter((_, index) => index !== indexToRemove)));
    setCorrectOption((prevCorrect) => {
      if (prevCorrect === indexToRemove) {
        return Math.max(0, indexToRemove - 1);
      }
      if (prevCorrect > indexToRemove) {
        return prevCorrect - 1;
      }
      return prevCorrect;
    });
  };

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

      const response = await fetch(`${API_BASE_URL}/api/assets/question-image/`, {
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

  const uploadChoiceImage = async (file, optionIndex) => {
    if (!file) {
      return;
    }

    if (!String(file.type || '').startsWith('image/')) {
      setChoiceImageError('Please select a valid image file for this option.');
      return;
    }

    setUploadingChoiceIndex(optionIndex);
    setChoiceImageError('');

    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch(`${API_BASE_URL}/api/assets/choice-image/`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Unable to upload option image.');
      }

      const payload = await response.json();
      const uploadedImageUrl = payload.image_url || '';
      setOptions((prev) => prev.map((option, index) => (
        index === optionIndex
          ? { ...option, image_url: uploadedImageUrl || null }
          : option
      )));
    } catch (error) {
      setChoiceImageError(error.message || 'Unable to upload option image.');
    } finally {
      setUploadingChoiceIndex(null);
    }
  };

  const uploadMatchingImage = async ({ file, side, itemIndex }) => {
    if (!file) {
      return;
    }

    if (!String(file.type || '').startsWith('image/')) {
      setMatchingImageError('Please select a valid image file for this item.');
      return;
    }

    setUploadingMatchingItem(`${side}-${itemIndex}`);
    setMatchingImageError('');

    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch(`${API_BASE_URL}/api/assets/choice-image/`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Unable to upload matching item image.');
      }

      const payload = await response.json();
      const uploadedImageUrl = payload.image_url || '';

      if (side === 'left') {
        setMatchingLeftItems((prev) => prev.map((item, index) => (
          index === itemIndex ? { ...item, image_url: uploadedImageUrl || null } : item
        )));
      } else {
        setMatchingRightOptions((prev) => prev.map((item, index) => (
          index === itemIndex ? { ...item, image_url: uploadedImageUrl || null } : item
        )));
      }
    } catch (error) {
      setMatchingImageError(error.message || 'Unable to upload matching item image.');
    } finally {
      setUploadingMatchingItem(null);
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
  
  const handleOptionTextChange = (index, value) => {
    setOptions((prev) => prev.map((option, optionIndex) => (
      optionIndex === index
        ? { ...option, text: value }
        : option
    )));
  };

  const handleMatchingTextChange = ({ side, index, value }) => {
    if (side === 'left') {
      setMatchingLeftItems((prev) => prev.map((item, itemIndex) => (
        itemIndex === index ? { ...item, text: value } : item
      )));
      return;
    }

    setMatchingRightOptions((prev) => prev.map((item, itemIndex) => (
      itemIndex === index ? { ...item, text: value } : item
    )));
  };

  const addMatchingLeftItem = () => {
    setMatchingLeftItems((prev) => {
      const next = withReindexedMatchingIds([...prev, defaultMatchingItem('L', prev.length)], 'L');
      setMatchingCorrectMap((prevMap) => {
        const nextMap = { ...prevMap };
        const latestLeft = next[next.length - 1];
        nextMap[latestLeft.id] = matchingRightOptions[next.length - 1]?.id || matchingRightOptions[0]?.id || '';
        return nextMap;
      });
      return next;
    });
  };

  const removeMatchingLeftItem = (indexToRemove) => {
    if (matchingLeftItems.length <= 2) {
      return;
    }

    const nextLeftItems = withReindexedMatchingIds(
      matchingLeftItems.filter((_, index) => index !== indexToRemove),
      'L',
    );
    const nextMap = {};
    nextLeftItems.forEach((leftItem, index) => {
      const previousLeft = matchingLeftItems[index >= indexToRemove ? index + 1 : index];
      const previousLeftId = previousLeft?.id;
      const mapped = previousLeftId ? matchingCorrectMap[previousLeftId] : null;
      nextMap[leftItem.id] = matchingRightOptions.some((item) => item.id === mapped)
        ? mapped
        : (matchingRightOptions[index]?.id || matchingRightOptions[0]?.id || '');
    });

    setMatchingLeftItems(nextLeftItems);
    setMatchingCorrectMap(nextMap);
  };

  const addMatchingRightOption = () => {
    setMatchingRightOptions((prev) => withReindexedMatchingIds([...prev, defaultMatchingItem('R', prev.length)], 'R'));
  };

  const removeMatchingRightOption = (indexToRemove) => {
    if (matchingRightOptions.length <= Math.max(2, matchingLeftItems.length)) {
      return;
    }

    const previous = matchingRightOptions;
    const next = withReindexedMatchingIds(previous.filter((_, index) => index !== indexToRemove), 'R');
    setMatchingRightOptions(next);
    setMatchingCorrectMap((prevMap) => {
      const nextMap = {};
      matchingLeftItems.forEach((leftItem, leftIndex) => {
        const mappedId = String(prevMap[leftItem.id] || '').trim();
        const removedOption = previous[indexToRemove];
        const removedId = removedOption?.id;
        nextMap[leftItem.id] = mappedId && mappedId !== removedId && next.some((item) => item.id === mappedId)
          ? mappedId
          : (next[leftIndex]?.id || next[0]?.id || '');
      });
      return nextMap;
    });
  };

  const resetFormState = () => {
    setTitle('');
    setQuestionText('');
    setType('Multiple Choice');
    setOptions([defaultChoice(0), defaultChoice(1)]);
    setCorrectOption(0);
    setAllowPeerUpvoting(false);
    setQuestionImageUrl('');
    setImageUploadError('');
    setChoiceImageError('');
    setUploadingChoiceIndex(null);
    setMatchingLeftItems([defaultMatchingItem('L', 0), defaultMatchingItem('L', 1)]);
    setMatchingRightOptions([defaultMatchingItem('R', 0), defaultMatchingItem('R', 1)]);
    setMatchingCorrectMap({ L1: 'R1', L2: 'R2' });
    setMatchingImageError('');
    setUploadingMatchingItem(null);
    setEditingQuestionIndex(null);
  };

  const loadQuestionForEditing = (question, index) => {
    const rawType = String(question?.question_type || 'Multiple Choice').trim();
    const nextType = rawType === 'Essay Question' ? 'Essay' : rawType;
    const interaction = question?.interaction_data || {};

    setEditingQuestionIndex(index);
    setTitle(question?.question_title || question?.title || '');
    setQuestionText(question?.question_text || question?.questionText || '');
    setType(nextType);
    setQuestionImageUrl(question?.question_image_url || question?.question_image || '');
    setAllowPeerUpvoting(Boolean(question?.allow_peer_upvoting));

    if (['Multiple Choice', 'multiple_choice_question', 'True/False', 'true_false_question'].includes(nextType)) {
      const configuredOptions = Array.isArray(interaction?.options) && interaction.options.length >= 2
        ? normalizeChoiceOptions(interaction.options)
        : (nextType === 'True/False' || nextType === 'true_false_question'
          ? TRUE_FALSE_OPTIONS
          : [defaultChoice(0), defaultChoice(1)]);
      setOptions(withReindexedChoiceIds(
        (nextType === 'True/False' || nextType === 'true_false_question')
          ? TRUE_FALSE_OPTIONS
          : configuredOptions
      ));
      setCorrectOption(Number(interaction?.correct_index ?? 0));
    } else {
      setOptions([defaultChoice(0), defaultChoice(1)]);
      setCorrectOption(0);
    }

    if (nextType === 'Matching' || nextType === 'matching_question') {
      const loadedLeftItems = normalizeMatchingItems(interaction?.left_items, 'L');
      const loadedRightOptions = normalizeMatchingItems(interaction?.right_options, 'R');
      const effectiveLeftItems = loadedLeftItems.length >= 2
        ? loadedLeftItems
        : [defaultMatchingItem('L', 0), defaultMatchingItem('L', 1)];
      const effectiveRightOptions = loadedRightOptions.length >= effectiveLeftItems.length
        ? loadedRightOptions
        : withReindexedMatchingIds([
            ...loadedRightOptions,
            ...Array.from({ length: Math.max(0, effectiveLeftItems.length - loadedRightOptions.length) }, (_, index) => defaultMatchingItem('R', loadedRightOptions.length + index)),
          ], 'R');

      const rawMapping = interaction?.correct_mapping && typeof interaction.correct_mapping === 'object'
        ? interaction.correct_mapping
        : {};
      const normalizedMap = {};
      effectiveLeftItems.forEach((leftItem, index) => {
        const leftId = leftItem.id || `L${index + 1}`;
        const fallbackRightId = effectiveRightOptions[index]?.id || effectiveRightOptions[0]?.id || '';
        const mappedRight = String(rawMapping[leftId] || '').trim();
        normalizedMap[leftId] = effectiveRightOptions.some((option) => option.id === mappedRight)
          ? mappedRight
          : fallbackRightId;
      });

      setMatchingLeftItems(effectiveLeftItems);
      setMatchingRightOptions(effectiveRightOptions);
      setMatchingCorrectMap(normalizedMap);
    }
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();

    if (type === 'Matching') {
      if (matchingLeftItems.length < 2) {
        setMatchingImageError('Add at least 2 left items for a matching question.');
        return;
      }

      if (matchingRightOptions.length < matchingLeftItems.length) {
        setMatchingImageError('Answer options must be equal to or greater than left items (to allow distractors).');
        return;
      }

      if (matchingLeftItems.some((item) => !String(item.text || '').trim())) {
        setMatchingImageError('Each left item requires text (LaTeX supported).');
        return;
      }

      if (matchingRightOptions.some((item) => !String(item.text || '').trim())) {
        setMatchingImageError('Each right option requires text (LaTeX supported).');
        return;
      }

      const everyMapped = matchingLeftItems.every((item) => {
        const mapped = String(matchingCorrectMap[item.id] || '').trim();
        return matchingRightOptions.some((option) => option.id === mapped);
      });
      if (!everyMapped) {
        setMatchingImageError('Map each left item to a valid right option.');
        return;
      }
    }

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
      const effectiveOptions = type === 'True/False'
        ? withReindexedChoiceIds(TRUE_FALSE_OPTIONS)
        : withReindexedChoiceIds(options);

      configuration.interaction_data = {
        options: effectiveOptions,
        correct_index: correctOption
      };
    } else if (type === 'Matching') {
      const normalizedLeftItems = withReindexedMatchingIds(matchingLeftItems, 'L').map((item) => ({
        id: item.id,
        text: String(item.text || '').trim(),
        image_url: item.image_url || null,
      }));
      const normalizedRightOptions = withReindexedMatchingIds(matchingRightOptions, 'R').map((item) => ({
        id: item.id,
        text: String(item.text || '').trim(),
        image_url: item.image_url || null,
      }));

      const normalizedCorrectMap = {};
      normalizedLeftItems.forEach((leftItem, index) => {
        const mappedId = String(matchingCorrectMap[leftItem.id] || '').trim();
        const fallbackRightId = normalizedRightOptions[index]?.id || normalizedRightOptions[0]?.id || '';
        normalizedCorrectMap[leftItem.id] = normalizedRightOptions.some((option) => option.id === mappedId)
          ? mappedId
          : fallbackRightId;
      });

      configuration.interaction_data = {
        left_items: normalizedLeftItems,
        right_options: normalizedRightOptions,
        correct_mapping: normalizedCorrectMap,
      };
    }

    onSaveQuestion(configuration, editingQuestionIndex);
    resetFormState();
  };

  return (
    <div className="w-full max-w-7xl bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8 shadow-2xl text-slate-100 transition-all duration-300">
      
      <div className="mb-6 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-violet-500 animate-pulse" />
          <h2 className="text-lg font-semibold text-slate-200 tracking-tight">Step 2: Write Your Questions</h2>
        </div>
        <p className="text-xs text-slate-400 mt-1">Create each question, choose its format, and add grading rubrics where needed.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <form onSubmit={handleFormSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Question Title</label>
            <input 
              type="text" 
              value={title} 
              onChange={(e) => setTitle(e.target.value)} 
              placeholder="e.g., Question 1: Main idea of today's lecture" 
              className="w-full px-4 py-3 bg-slate-950 border border-slate-800 text-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 font-medium text-sm placeholder-slate-600 transition-all" 
              required 
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Quiz Question Layout</label>
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
            placeholder="Type the question students should answer..." 
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
            <span className="block text-xs font-semibold text-indigo-400 tracking-wider">CHOICE CONFIGURATION PANEL</span>
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
                  value={option.text}
                  onChange={(e) => handleOptionTextChange(index, e.target.value)}
                  placeholder={`Choice ${option.id} text (supports LaTeX like $x^2$ or $$\\int_0^1 x dx$$)`}
                  className="flex-1 px-4 py-2.5 bg-slate-900 border border-slate-800 text-slate-100 rounded-xl text-sm font-medium focus:outline-none focus:border-indigo-500 placeholder-slate-600 transition-all" 
                  required 
                />
                <label className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 cursor-pointer hover:border-cyan-400/60 hover:text-cyan-200 transition-all">
                  {uploadingChoiceIndex === index ? 'Uploading...' : 'Upload Diagram'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingChoiceIndex !== null}
                    onChange={async (event) => {
                      const selectedFile = event.target.files?.[0];
                      if (selectedFile) {
                        await uploadChoiceImage(selectedFile, index);
                      }
                    }}
                  />
                </label>
                {option.image_url ? (
                  <button
                    type="button"
                    onClick={() => {
                      setOptions((prev) => prev.map((item, itemIndex) => (
                        itemIndex === index ? { ...item, image_url: null } : item
                      )));
                    }}
                    className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-300 transition-all hover:bg-rose-500/20"
                  >
                    Remove Image
                  </button>
                ) : null}
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
            {options.some((option) => option.image_url) ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {options.map((option, index) => (
                  option.image_url ? (
                    <div key={`preview-${index}`} className="rounded-xl border border-slate-700 bg-slate-900/70 p-3">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Choice {option.id} Diagram</p>
                      <img
                        src={option.image_url}
                        alt={`Choice ${option.id} visual`}
                        className="mx-auto max-h-28 w-full rounded-lg border border-slate-700 object-contain"
                      />
                    </div>
                  ) : null
                ))}
              </div>
            ) : null}
            {choiceImageError ? <p className="text-xs text-rose-300">{choiceImageError}</p> : null}
            <button 
              type="button" 
              onClick={handleAddOption} 
              className="text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors inline-flex items-center gap-1 mt-1"
            >
              + Add another choice
            </button>
          </div>
          )}

          {type === 'Matching' && (
          <div className="bg-slate-950 border border-slate-850 p-5 rounded-xl space-y-5 shadow-inner">
            <div>
              <span className="block text-xs font-semibold text-cyan-300 tracking-wider">MATCHING PAIR BUILDER</span>
              <p className="mt-1 text-xs text-slate-400">Build left prompts and right answer options. Right options can include extra distractors.</p>
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">Left Items</h4>
                  <button
                    type="button"
                    onClick={addMatchingLeftItem}
                    className="rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-200 transition-all hover:bg-cyan-500/20"
                  >
                    + Add Left Item
                  </button>
                </div>

                {matchingLeftItems.map((item, index) => (
                  <div key={`left-${item.id}-${index}`} className="rounded-xl border border-slate-700 bg-slate-900/70 p-3 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-300">{item.id}</span>
                      <button
                        type="button"
                        onClick={() => removeMatchingLeftItem(index)}
                        disabled={matchingLeftItems.length <= 2}
                        className="text-xs text-rose-300 disabled:text-slate-600 disabled:cursor-not-allowed"
                      >
                        Delete
                      </button>
                    </div>

                    <input
                      type="text"
                      value={item.text}
                      onChange={(event) => handleMatchingTextChange({ side: 'left', index, value: event.target.value })}
                      placeholder="Left prompt text (LaTeX supported)"
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                      required
                    />

                    <div className="flex flex-wrap items-center gap-2">
                      <label className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 cursor-pointer hover:border-cyan-400/60 hover:text-cyan-200 transition-all">
                        {uploadingMatchingItem === `left-${index}` ? 'Uploading...' : 'Upload Diagram'}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={Boolean(uploadingMatchingItem)}
                          onChange={async (event) => {
                            const selectedFile = event.target.files?.[0];
                            if (selectedFile) {
                              await uploadMatchingImage({ file: selectedFile, side: 'left', itemIndex: index });
                            }
                          }}
                        />
                      </label>

                      {item.image_url ? (
                        <button
                          type="button"
                          onClick={() => setMatchingLeftItems((prev) => prev.map((leftItem, leftIndex) => (
                            leftIndex === index ? { ...leftItem, image_url: null } : leftItem
                          )))}
                          className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 transition-all hover:bg-rose-500/20"
                        >
                          Remove Image
                        </button>
                      ) : null}
                    </div>

                    {item.image_url ? (
                      <div className="rounded-lg border border-slate-700 bg-slate-950 p-2">
                        <img src={item.image_url} alt={`${item.id} diagram`} className="mx-auto max-h-24 w-full object-contain" />
                      </div>
                    ) : null}

                    <div>
                      <label className="mb-1 block text-[10px] uppercase tracking-[0.16em] text-slate-400">Correct Match</label>
                      <select
                        value={matchingCorrectMap[item.id] || ''}
                        onChange={(event) => {
                          const selectedRightId = event.target.value;
                          setMatchingCorrectMap((prev) => ({
                            ...prev,
                            [item.id]: selectedRightId,
                          }));
                        }}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                      >
                        {matchingRightOptions.map((option) => (
                          <option key={`map-${item.id}-${option.id}`} value={option.id}>
                            {option.id}: {option.text || 'Untitled option'}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300">Answer Options (with Distractors)</h4>
                  <button
                    type="button"
                    onClick={addMatchingRightOption}
                    className="rounded-lg border border-indigo-400/40 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-semibold text-indigo-200 transition-all hover:bg-indigo-500/20"
                  >
                    + Add Option / Distractor
                  </button>
                </div>

                {matchingRightOptions.map((item, index) => (
                  <div key={`right-${item.id}-${index}`} className="rounded-xl border border-slate-700 bg-slate-900/70 p-3 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-300">{item.id}</span>
                      <button
                        type="button"
                        onClick={() => removeMatchingRightOption(index)}
                        disabled={matchingRightOptions.length <= Math.max(2, matchingLeftItems.length)}
                        className="text-xs text-rose-300 disabled:text-slate-600 disabled:cursor-not-allowed"
                      >
                        Delete
                      </button>
                    </div>

                    <input
                      type="text"
                      value={item.text}
                      onChange={(event) => handleMatchingTextChange({ side: 'right', index, value: event.target.value })}
                      placeholder="Right option text (LaTeX supported)"
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                      required
                    />

                    <div className="flex flex-wrap items-center gap-2">
                      <label className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 cursor-pointer hover:border-cyan-400/60 hover:text-cyan-200 transition-all">
                        {uploadingMatchingItem === `right-${index}` ? 'Uploading...' : 'Upload Diagram'}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={Boolean(uploadingMatchingItem)}
                          onChange={async (event) => {
                            const selectedFile = event.target.files?.[0];
                            if (selectedFile) {
                              await uploadMatchingImage({ file: selectedFile, side: 'right', itemIndex: index });
                            }
                          }}
                        />
                      </label>

                      {item.image_url ? (
                        <button
                          type="button"
                          onClick={() => setMatchingRightOptions((prev) => prev.map((rightItem, rightIndex) => (
                            rightIndex === index ? { ...rightItem, image_url: null } : rightItem
                          )))}
                          className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 transition-all hover:bg-rose-500/20"
                        >
                          Remove Image
                        </button>
                      ) : null}
                    </div>

                    {item.image_url ? (
                      <div className="rounded-lg border border-slate-700 bg-slate-950 p-2">
                        <img src={item.image_url} alt={`${item.id} diagram`} className="mx-auto max-h-24 w-full object-contain" />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            {matchingImageError ? <p className="text-xs text-rose-300">{matchingImageError}</p> : null}
          </div>
          )}

          {type === 'True/False' && (
          <div className="bg-slate-950 border border-slate-850 p-5 rounded-xl space-y-4 shadow-inner">
            <span className="block text-xs font-semibold text-amber-400 tracking-wider">TRUE / FALSE ANSWER</span>
            {options.slice(0, 2).map((option, index) => (
              <div key={index} className="flex items-center gap-4 py-1.5 px-4 bg-slate-900 border border-slate-800 rounded-xl hover:border-slate-700 transition-all">
                <input 
                  type="radio" 
                  name="correct_choice" 
                  checked={correctOption === index} 
                  onChange={() => setCorrectOption(index)} 
                  className="w-4 h-4 text-amber-500 border-slate-800 bg-slate-900" 
                />
                <span className="text-sm font-medium text-slate-300">{option.text || option.id}</span>
              </div>
            ))}
          </div>
          )}


          <div className="flex flex-col gap-3 pt-2 md:flex-row md:justify-end">
            {editingQuestionIndex !== null ? (
              <button
                type="button"
                onClick={resetFormState}
                className="w-full md:w-auto rounded-xl border border-slate-700 bg-slate-950 px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-200 transition-all hover:border-slate-500"
              >
                Cancel Edit
              </button>
            ) : null}
            <button 
              type="submit" 
              className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-3 px-8 rounded-xl shadow-lg shadow-indigo-600/20 transition-all text-xs tracking-widest uppercase active:scale-[0.98]"
            >
              {editingQuestionIndex !== null ? 'Update Question' : 'Compile Framework Element'}
            </button>
          </div>
        </form>

        <aside className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
          <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Quiz Preview & Edit Summary</p>
              <p className="mt-1 text-xs text-slate-400">Student-side order and rendering preview before publishing.</p>
            </div>
            <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-semibold text-slate-300">
              {questionList.length} Items
            </span>
          </div>

          {questionList.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400">
              Questions will appear here as you compile them.
            </div>
          ) : (
            <div className="max-h-[72vh] space-y-3 overflow-y-auto pr-1">
              {questionList.map((question, index) => (
                <div key={`${question.question_title || 'q'}-${index}`} className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-300">Question {index + 1}</p>
                      <h4 className="mt-1 text-sm font-semibold text-slate-100">{question.question_title || `Question ${index + 1}`}</h4>
                      <p className="mt-1 text-xs text-slate-400">Type: {question.question_type || 'Unknown'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onReorderQuestion?.(index, index - 1)}
                        disabled={index === 0}
                        className="rounded-lg border border-slate-600 bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-200 transition-all hover:border-cyan-400/40 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => onReorderQuestion?.(index, index + 1)}
                        disabled={index === questionList.length - 1}
                        className="rounded-lg border border-slate-600 bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-200 transition-all hover:border-cyan-400/40 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => loadQuestionForEditing(question, index)}
                        className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1.5 text-xs font-semibold text-cyan-200 transition-all hover:bg-cyan-500/20"
                      >
                        ✏️ Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteQuestion?.(index)}
                        className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-1.5 text-xs font-semibold text-rose-200 transition-all hover:bg-rose-500/20"
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                    <p className="text-xs leading-6 text-slate-300">{question.question_text || 'No question text provided yet.'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}