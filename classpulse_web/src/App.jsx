import React, { useState } from 'react';
import QuizHeaderForm from './QuizHeaderForm';
import QuizCreator from './QuizCreator';
import LiveAnalytics from './LiveAnalytics';
import StudentScorecard from './StudentScorecard';

export default function App() {
  // Sandbox tracking state logic layers
  const [activeQuizMeta, setActiveQuizMeta] = useState({ title: 'Sandbox Pipeline Exam', timeLimit: 15, instructions: '' });
  const [mockSubmissionCount, setMockSubmissionCount] = useState(42);
  
  const [mockChartDistribution, setMockChartDistribution] = useState({ A: 24, B: 12, C: 4, D: 2 });
  const [showStudentMockCard, setShowStudentMockCard] = useState(false);

  const handleHeaderLock = (metadata) => {
    setActiveQuizMeta(metadata);
    alert(`Quiz Envelope Locked Successfully! Master Title updated to: "${metadata.title}"`);
  };

  const handleQuestionSaveMock = (payload) => {
    // Dynamically simulate an incoming background submission increment on click event
    setMockSubmissionCount(prev => prev + 1);
    
    // Simulate updating bar chart telemetry
    setMockChartDistribution({ A: 25, B: 13, C: 4, D: 2 });
    setShowStudentMockCard(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col items-center p-4 md:p-8 space-y-6">
      
      {/* Dev Control Stamp */}
      <div className="w-full max-w-3xl text-center bg-slate-200 border border-slate-300 p-2 rounded-lg text-xs font-mono font-bold tracking-widest text-slate-600">
        🔧 COMPLETE CLASSPULSE FRONTEND INTEGRATION MATRIX INTERFACE
      </div>

      {/* Module 1 Frame */}
      <QuizHeaderForm onSaveHeader={handleHeaderLock} />

      {/* Pre-built Builder Frame */}
      <QuizCreator onSaveQuestion={handleQuestionSaveMock} />

      {/* Module 3 Frame */}
      <LiveAnalytics activeSubmissions={mockSubmissionCount} chartData={mockChartDistribution} />

      {/* Module 2 Frame (Toggled conditionally when compile is struck to show score workflow) */}
      {showStudentMockCard && (
        <div className="w-full flex justify-center pt-2">
          <StudentScorecard 
            score={4} 
            totalPoints={5} 
            studentName="Alex Johnson (Purdue ID)" 
            quizTitle={activeQuizMeta.title}
            onResetMock={() => setShowStudentMockCard(false)}
          />
        </div>
      )}

    </div>
  );
}