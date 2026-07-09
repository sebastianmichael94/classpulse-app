import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { API_BASE_URL } from './apiClient';
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select';

const SECURITY_QUESTIONS = [
  { value: 'first_pet', label: "What was your first pet's name?" },
  { value: 'birth_city', label: 'What city were you born in?' },
  { value: 'first_school', label: 'What was the name of your first school?' },
];

export default function Register() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    username: '',
    email: '',
    password: '',
    role: 'student',
    securityQuestion: SECURITY_QUESTIONS[0].value,
    securityAnswer: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/register/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: formData.username,
          email: formData.email,
          password: formData.password,
          first_name: formData.firstName,
          last_name: formData.lastName,
          role: formData.role,
          security_question: formData.securityQuestion,
          security_answer: formData.securityAnswer,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to create account.');
      }

      navigate(`/login?role=${formData.role}`, { replace: true });
    } catch (registerError) {
      setError(registerError.message || 'Unable to create account.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen px-4 py-10 flex items-center justify-center">
      <Card className="w-full max-w-xl border-border/80 bg-card/95 shadow-2xl backdrop-blur">
        <CardHeader>
          <p className="text-xs uppercase tracking-[0.35em] text-primary">ClassPulse Identity Hub</p>
          <CardTitle className="mt-2 text-3xl">Create account</CardTitle>
          <CardDescription>Student registration only.</CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Input
              name="firstName"
              value={formData.firstName}
              onChange={handleChange}
              placeholder="First name"
              className="h-11"
              required
              />
              <Input
              name="lastName"
              value={formData.lastName}
              onChange={handleChange}
              placeholder="Last name"
              className="h-11"
              required
              />
            </div>

            <Input
              name="username"
              value={formData.username}
              onChange={handleChange}
              placeholder="Username"
              className="h-11"
              required
            />

            <Input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="Email"
              className="h-11"
              required
            />

            <Input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="Password"
              className="h-11"
              required
            />

            <Label className="block text-sm text-muted-foreground">
              Security question
              <Select
                value={formData.securityQuestion}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, securityQuestion: value }))}
              >
                <SelectTrigger className="mt-2 h-11">
                  <SelectValue placeholder="Select a security question" />
                </SelectTrigger>
                <SelectContent>
                  {SECURITY_QUESTIONS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Label>

            <Input
              type="text"
              name="securityAnswer"
              value={formData.securityAnswer}
              onChange={handleChange}
              placeholder="Security answer"
              className="h-11"
              required
            />

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <Button type="submit" disabled={isSubmitting} className="h-11 w-full text-sm font-semibold">
              {isSubmitting ? 'Creating account...' : 'Register as Student'}
            </Button>
          </form>

          <p className="mt-5 text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link to="/login" className="text-primary hover:text-primary/90 font-semibold">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
