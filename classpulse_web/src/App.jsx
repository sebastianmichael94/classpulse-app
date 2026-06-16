import React, { useState } from 'react';
import QuizHeaderForm from './QuizHeaderForm';
import ProfessorDashboard from './ProfessorDashboard';

export default function App() {
  // Overarching single quiz instance tracking configuration
  const [currentQuiz, setCurrentQuiz] = useState({
    title: 'Distributed Databases (Purdue Core)',
    timeLimit: 20,
    instructions: 'Complete all algebraic evaluation parameters independently.',
    accessCode: '5821'
  });

  const handleHeaderEnvelopeUpdate = (updatedHeader) => {
    // Merge input field states with a persistent mock access gate key
    setCurrentQuiz({
      ...updatedHeader,
      accessCode: '5821' 
    });
  };

  const handleFinalPublishExecution = (finalPayload) => {
    console.log('--- CRITICAL BOUNDARY REACHED: PUBLISHING TO DJANGO REST API ---');
    console.log(JSON.stringify(finalPayload, null, 2));
    alert(`Production Database Synchronization Initiated for Quiz: "${finalPayload.title}"! Checked console logs for target schema execution map.`);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col items-center p-4 md:p-8 space-y-6">
      
      <div className="w-full max-w-4xl text-center bg-slate-900 text-[#4FD1C5] border border-slate-800 p-2 rounded-lg text-xs font-mono font-bold tracking-widest">
        🚀 DECOUPLED MASTER COMMAND DASHBOARD MODULE
      </div>

      {/* Header input form node triggers state synchronization */}
      <QuizHeaderForm onSaveHeader={handleHeaderEnvelopeUpdate} />

      {/* Dashboard display node receives state modifications and generates codes */}
      <ProfessorDashboard 
        activeQuiz={currentQuiz} 
        onPublish={handleFinalPublishExecution} 
      />

    </div>
  );
}