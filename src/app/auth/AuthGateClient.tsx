import { useEffect, useState } from 'react';
import { getClientMe } from '../api/client';
import { getSupabase, setSessionFromUrlHash } from './supabase';

const authPortalUrl = import.meta.env.VITE_AUTH_PORTAL_URL as string | undefined;
if (!authPortalUrl) {
  throw new Error('Missing required env var: VITE_AUTH_PORTAL_URL');
}

export function AuthGateClient({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [subscriptionActive, setSubscriptionActive] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        // Handle redirect callback: /auth/callback#access_token=...&refresh_token=...
        const callbackIndex = window.location.pathname.indexOf('/auth/callback');
        if (callbackIndex !== -1) {
          await setSessionFromUrlHash();
          const nextPath = window.location.pathname.slice(0, callbackIndex) || '/';
          // Clear the URL hash containing sensitive tokens for security
          window.history.replaceState({}, document.title, nextPath);
          // Also clear the hash immediately
          window.location.hash = '';
        }

        const sb = getSupabase();
        const { data } = await sb.auth.getSession();
        const session = data.session;

        if (!session) {
          window.location.href = authPortalUrl;
          return;
        }

        const me = await getClientMe();
        const isActive = me?.subscription?.status === 'active';
        if (!cancelled) {
          setSubscriptionActive(isActive);
          setReady(true);
        }

        // Poll while subscription is pending so access updates immediately after payment
        if (!isActive) {
          const pollInterval = window.setInterval(async () => {
            try {
              const latest = await getClientMe();
              const activeNow = latest?.subscription?.status === 'active';
              setSubscriptionActive(activeNow);
              if (activeNow) {
                window.clearInterval(pollInterval);
              }
            } catch {
              // ignore polling errors
            }
          }, 10000);
        }
      } catch (e) {
        console.error('Auth bootstrap failed', e);
        window.location.href = authPortalUrl;
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
        <div>Loading...</div>
      </div>
    );
  }

  if (subscriptionActive === false) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-card border border-border rounded-lg p-6 text-center space-y-3">
          <h1 className="text-xl font-semibold">Payment Pending</h1>
          <p className="text-sm text-muted-foreground">
            Your subscription is not active yet. Once payment is confirmed, you will get access automatically.
          </p>
          <p className="text-xs text-muted-foreground">
            If you already paid, please wait a few minutes or contact support.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
