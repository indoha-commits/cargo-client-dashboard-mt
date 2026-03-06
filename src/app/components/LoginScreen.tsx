import { useState } from 'react';
import { Lock, User } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';

import { useAuth } from '../auth/AuthContext';

export function LoginScreen() {
  const { login, authError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    try {
      await login(email, password);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-card rounded-sm p-8 border border-border">
          <div className="mb-8">
            <h1 className="text-foreground mb-2">INDATAFLOW</h1>
            <p className="text-muted-foreground">Sign in to continue</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {(submitError || authError) && (
              <div className="rounded-sm border border-border bg-muted/40 px-4 py-3 text-sm text-foreground">
                {submitError ?? authError}
              </div>
            )}
            <div className="space-y-2">
              <label htmlFor="email" className="block text-foreground">
                Email
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 bg-background border-border focus:border-primary focus:ring-0"
                  placeholder="user@company.com"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="block text-foreground">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 bg-background border-border focus:border-primary focus:ring-0"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={submitting}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-60"
            >
              {submitting ? 'Signing in…' : 'Sign In'}
            </Button>
          </form>
        </div>

        <p className="text-center mt-6 text-muted-foreground">
          © 2025 INDATAFLOW
        </p>
      </div>
    </div>
  );
}
