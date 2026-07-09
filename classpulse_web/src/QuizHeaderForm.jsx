import React, { useState } from 'react';
import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Textarea } from './components/ui/textarea';

export default function QuizHeaderForm({ onSaveHeader }) {
  const [title, setTitle] = useState('');
  const [timeLimit, setTimeLimit] = useState('15');
  const [instructions, setInstructions] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onSaveHeader({ title, timeLimit: parseInt(timeLimit), instructions });
  };

  return (
    <Card className="w-full rounded-3xl border-border/80 bg-card/95 shadow-2xl text-card-foreground transition-all duration-300">
      <CardHeader className="mb-2 border-b border-border/70 pb-4">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          <CardTitle className="text-lg tracking-tight">Step 1: Quiz Basics & Timer</CardTitle>
        </div>
        <p className="text-xs text-muted-foreground mt-1">Set your quiz title, timer, and clear instructions for students.</p>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2">
              <Label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Quiz Title</Label>
              <Input 
              type="text" 
              value={title} 
              onChange={(e) => setTitle(e.target.value)} 
              placeholder="e.g., Week 4 Quiz: Photosynthesis Basics" 
              className="h-11"
              required 
            />
          </div>
          <div>
            <Label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Quiz Timer (Minutes)</Label>
            <Input 
              type="number" 
              value={timeLimit} 
              onChange={(e) => setTimeLimit(e.target.value)} 
              className="h-11"
              required 
            />
          </div>
        </div>

        <div>
          <Label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Class Instructions</Label>
          <Textarea 
            rows="3" 
            value={instructions} 
            onChange={(e) => setInstructions(e.target.value)} 
            placeholder="Add simple instructions students should follow before they start." 
            className="resize-none"
          />
        </div>

        <div className="flex justify-end pt-2">
          <Button type="submit" className="text-xs uppercase tracking-widest">
            Save Quiz Basics
          </Button>
        </div>
      </form>
      </CardContent>
    </Card>
  );
}