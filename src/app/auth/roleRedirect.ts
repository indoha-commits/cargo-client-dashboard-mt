import { getAccessToken, getSupabase } from './supabase';

type MeResponse = {
  id: string;
  email: string;
  role: 'client' | 'ops' | 'admin';
  client_id: string | null;
};

function getApiBaseUrl(): string {
  const baseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (!baseUrl) throw new Error('VITE_API_BASE_URL is not set');
  return baseUrl;
}

function getInternalDashboardUrl(): string {
  const url = import.meta.env.VITE_INTERNAL_DASHBOARD_URL as string | undefined;
  if (!url) throw new Error('Missing required env var: VITE_INTERNAL_DASHBOARD_URL');
  return url;
}

function getClientDashboardUrl(): string {
  const url = import.meta.env.VITE_CLIENT_DASHBOARD_URL as string | undefined;
  if (!url) throw new Error('Missing required env var: VITE_CLIENT_DASHBOARD_URL');
  return url;
}

export async function redirectAfterLogin(): Promise<void> {
  const token = getAccessToken();
  if (!token) return;

  const res = await fetch(`${getApiBaseUrl()}/me`, {
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to resolve role: ${res.status} ${text}`);
  }

  const me = (await res.json()) as MeResponse;

  // Client stays in client dashboard
  if (me.role === 'client') {
    return;
  }

  // Ops/Admin redirected to internal dashboard
  if (me.role === 'ops' || me.role === 'admin') {
    const sb = getSupabase();
    const { data } = await sb.auth.getSession();
    const session = data.session;
    if (!session) return;

    const target = new URL(getInternalDashboardUrl());
    target.pathname = '/auth/callback';
    target.hash = new URLSearchParams({
      access_token: session.access_token,
      refresh_token: session.refresh_token ?? '',
    }).toString();

    // Hard redirect to switch ports/origin
    window.location.href = target.toString();
  }
}

export async function redirectAfterLogout(): Promise<void> {
  // Optionally bring users back to client dashboard root
  window.location.href = getClientDashboardUrl();
}
