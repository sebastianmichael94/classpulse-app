import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate, useParams } from 'react-router-dom';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { API_BASE_URL } from './apiClient';
import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Spinner } from './components/ui/spinner';

function MathText({ value }) {
  if (typeof value !== 'string') return null;

  if (!value.includes('$$')) {
    return <span>{value}</span>;
  }

  const parts = value.split('$$');
  return (
    <span>
      {parts.map((part, index) => {
        if (index % 2 === 1) {
          try {
            return (
              <span
                key={index}
                className="inline-block align-middle mx-1"
                dangerouslySetInnerHTML={{ __html: katex.renderToString(part, { throwOnError: false }) }}
              />
            );
          } catch {
            return <span key={index}>{part}</span>;
          }
        }
        return <span key={index}>{part}</span>;
      })}
    </span>
  );
}

export default function StudentQuizGateway({ onQuizLoaded }) {
  const navigate = useNavigate();
  const { id } = useParams();
  const [accessCode, setAccessCode] = useState('');
  const [studentName, setStudentName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (id) {
      setAccessCode(id);
    }
  }, [id]);

  const handleUnlock = async (event) => {
    event.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await axios.post(`${API_BASE_URL}/api/quizzes/unlock/`, {
        access_code: accessCode,
      });

      if (response?.data) {
        onQuizLoaded?.({ quiz: response.data, studentName });
        navigate(`/player/${response.data.id}`);
      }
    } catch (err) {
      if (err.response?.status === 404) {
        setError('That access code is invalid.');
      } else if (err.response?.status === 403) {
        setError(String(err.response?.data?.error || 'This quiz session is not available right now.'));
      } else {
        setError('Unable to unlock quiz right now.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <Card className="w-full max-w-3xl rounded-3xl border-border/80 bg-card/95 shadow-2xl overflow-hidden">
        <CardHeader className="bg-card px-8 py-6 border-b border-border/70">
          <p className="text-sm uppercase tracking-[0.35em] text-primary">ClassPulse Student Access</p>
          <CardTitle className="mt-3 text-3xl">Enter your quiz access point</CardTitle>
          <p className="mt-2 text-sm text-muted-foreground">Scan a QR code or type the 4-digit access code to start the exam.</p>
        </CardHeader>

        <CardContent className="grid gap-8 p-8 md:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-border/70 bg-background/30 p-6">
            <div className="w-40 h-40 mx-auto rounded-2xl border-2 border-dashed border-primary/40 bg-primary/10 flex items-center justify-center text-center text-sm font-medium text-primary">
              QR Scan Placeholder
            </div>
            <div className="mt-6 space-y-3 text-sm text-muted-foreground">
              <p>• Point your camera at the quiz QR code.</p>
              <p>• Or enter the four-digit pin manually below.</p>
            </div>
          </div>

          <form onSubmit={handleUnlock} className="space-y-4">
            <Label className="block text-sm text-muted-foreground">
              Student Name
              <Input
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="Enter your name"
                className="mt-2 h-11"
                required
              />
            </Label>

            <Label className="block text-sm text-muted-foreground">
              Access Code
              <Input
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                inputMode="numeric"
                maxLength="4"
                placeholder="0000"
                className="mt-2 h-11"
                required
              />
            </Label>

            <Button type="submit" disabled={isLoading} className="h-11 w-full text-sm font-semibold inline-flex items-center justify-center gap-2">
              {isLoading ? <Spinner label="Unlocking quiz" /> : null}
              {isLoading ? 'Unlocking Quiz...' : 'Start Quiz'}
            </Button>

            {error && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
