import { useEffect, useState } from 'react';
import { getSupabase, setSessionFromUrlHash } from './supabase';

const authPortalUrl = import.meta.env.VITE_AUTH_PORTAL_URL as string | undefined;
if (!authPortalUrl) {
  throw new Error('Missing required env var: VITE_AUTH_PORTAL_URL');
}

export function AuthGateClient({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        // Handle redirect callback: /auth/callback#access_token=...&refresh_token=...
        if (window.location.pathname.startsWith('/auth/callback')) {
          await setSessionFromUrlHash();
          window.history.replaceState({}, document.title, '/');
        }

        const sb = getSupabase();
        const { data } = await sb.auth.getSession();
        const session = data.session;

        if (!session) {
          window.location.href = authPortalUrl;
          return;
        }

        if (!cancelled) setReady(true);
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

  return <>{children}</>;
}
