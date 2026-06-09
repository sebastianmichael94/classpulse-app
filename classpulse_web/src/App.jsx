import React, { useState } from 'react';
import QuizCreator from './QuizCreator';
import QuestionList from './QuestionList';

export default function App() {
  const [questionBank, setQuestionBank] = useState([]);

  const handleNewQuestionCompiled = (newQuestion) => {
    // Append the newly compiled data schema directly to our ongoing state array array tracking
    setQuestionBank([...questionBank, newQuestion]);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center p-4 md:p-8 space-y-4">
      {/* 1. Component Input form layout */}
      <QuizCreator onSaveQuestion={handleNewQuestionCompiled} />
      
      {/* 2. Component Output array list renderer layout */}
      <QuestionList questions={questionBank} />
    </div>
  );
}