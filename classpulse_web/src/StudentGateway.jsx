import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate, useParams } from 'react-router-dom';
import { API_BASE_URL, readAuthSession } from './apiClient';
import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Spinner } from './components/ui/spinner';

function extractPinSeed(identityValue) {
  if (!identityValue) {
    return '';
  }

  const digitsOnly = String(identityValue).replace(/\D/g, '');
  if (digitsOnly.length >= 4) {
    return digitsOnly.slice(-4);
  }

  return digitsOnly;
}

function sanitizePin(rawValue) {
  return String(rawValue || '').replace(/\D/g, '').slice(0, 4);
}

export default function StudentGateway({ onQuizLoaded }) {
  const navigate = useNavigate();
  const { id } = useParams();
  const authSession = readAuthSession();
  const profileName = String(
    authSession?.user?.name
    || authSession?.user?.full_name
    || [authSession?.user?.first_name, authSession?.user?.last_name].filter(Boolean).join(' ')
    || authSession?.user?.username
    || ''
  ).trim();
  const [accessCode, setAccessCode] = useState('');
  const [studentName, setStudentName] = useState(profileName);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasAutoJoined, setHasAutoJoined] = useState(false);

  useEffect(() => {
    if (id) {
      setAccessCode(extractPinSeed(id));
    }
  }, [id]);

  useEffect(() => {
    if (profileName) {
      setStudentName(profileName);
    }
  }, [profileName]);

  const handleUnlock = async (event, options = {}) => {
    if (event?.preventDefault) {
      event.preventDefault();
    }

    const normalizedPin = sanitizePin(options.accessCode ?? accessCode);
    const normalizedName = String(options.studentName ?? studentName).trim();

    if (normalizedPin.length !== 4) {
      setError('Enter a valid 4-digit access PIN.');
      return;
    }

    if (!normalizedName) {
      setError('Enter your name to continue.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await axios.post(`${API_BASE_URL}/api/quizzes/unlock/`, {
        access_code: normalizedPin,
      });

      if (response?.data) {
        const loadResult = onQuizLoaded?.({ quiz: response.data, studentName: normalizedName });
        if (loadResult?.alreadySubmitted) {
          navigate('/scorecard');
          return;
        }
        navigate(`/player/${response.data.id}`);
      }
    } catch (err) {
      if (err.response?.status === 404) {
        setError('That access code is invalid.');
      } else if (err.response?.status === 403) {
        setError(String(err.response?.data?.error || 'This quiz session is not available right now.'));
      } else {
        setError('We could not unlock the quiz. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const normalizedPin = sanitizePin(accessCode);
    if (!id || !profileName || normalizedPin.length !== 4 || isLoading || hasAutoJoined) {
      return;
    }

    setHasAutoJoined(true);
    handleUnlock(null, {
      accessCode: normalizedPin,
      studentName: profileName,
    }).catch(() => {
      setHasAutoJoined(false);
    });
  }, [id, profileName, accessCode, isLoading, hasAutoJoined]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-[radial-gradient(circle_at_12%_10%,hsl(var(--primary)/0.14),transparent_35%)]">
      <Card className="w-full max-w-3xl overflow-hidden rounded-3xl border-border/80 bg-card/95 shadow-2xl">
        <CardHeader className="border-b border-border/70 bg-card px-8 py-6">
          <p className="text-sm uppercase tracking-[0.35em] text-primary">ClassPulse Student Gateway</p>
          <CardTitle className="mt-3 text-3xl">Student Examination Gateway</CardTitle>
          <p className="mt-2 text-sm text-muted-foreground">Authenticate with your name and the instructor PIN to enter a secured live assessment session.</p>
        </CardHeader>

        <CardContent className="grid gap-8 p-8 md:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-2xl border border-border/70 bg-background/50 p-6">
            <div className="rounded-2xl border border-primary/30 bg-primary/10 p-5 text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-primary">Session Ready</p>
              <p className="mt-2 text-sm text-muted-foreground">The exam will open instantly after your PIN is verified.</p>
              <div className="mt-5 rounded-xl border border-border/70 bg-background px-4 py-3 text-2xl font-semibold tracking-[0.35em] text-primary">
                {accessCode || '0000'}
              </div>
            </div>
            <div className="mt-6 space-y-3 text-sm text-muted-foreground">
              <p>• {profileName ? 'Your signed-in student profile will be used automatically.' : 'Enter your name so your submission is attributed correctly.'}</p>
              <p>• Use the four-digit PIN supplied by your instructor.</p>
              <p>• If the session is not active yet, you will see a clear message and can retry when it starts.</p>
            </div>
          </div>

          <form onSubmit={handleUnlock} className="space-y-4">
            {profileName ? (
              <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-foreground">
                Joining as <span className="font-semibold">{profileName}</span>
              </div>
            ) : (
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
            )}

            <Label className="block text-sm text-muted-foreground">
              Access Code
              <Input
                value={accessCode}
                onChange={(e) => setAccessCode(sanitizePin(e.target.value))}
                inputMode="numeric"
                pattern="[0-9]{4}"
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
