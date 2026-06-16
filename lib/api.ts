/**
 * Shared API fetch utility for Raven app.
 *
 * All requests are routed through the Next.js API proxy at /api/proxy/[...path],
 * which injects the Bearer token server-side from RAVEN_API_SECRET (never
 * exposed to the browser). This avoids baking secrets into the client bundle
 * via NEXT_PUBLIC_ vars.
 */

/**
 * Drop-in replacement for fetch() that routes all calls through the server-side
 * proxy. Path must start with "/" (e.g. "/library", "/goals?status=active").
 */
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers ?? {});
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  // Route through /api/proxy — proxy adds Bearer token server-side
  const proxyPath = `/api/proxy${path}`;

  return fetch(proxyPath, { ...options, headers });
}

// Keep API export for any components that reference the base URL directly
export const API = process.env.NEXT_PUBLIC_RAVEN_API_URL || 'https://raven-api-production.up.railway.app';
