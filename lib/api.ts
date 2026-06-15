/**
 * Shared API fetch utility for Raven app.
 * Automatically attaches the Bearer token to every request.
 */

export const API = process.env.NEXT_PUBLIC_RAVEN_API_URL || 'https://raven-api-production.up.railway.app';
const SECRET = process.env.NEXT_PUBLIC_RAVEN_API_SECRET || '';

/**
 * Drop-in replacement for fetch() that auto-attaches Authorization header.
 * Use this for every API call instead of raw fetch().
 */
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers ?? {});
  if (SECRET) {
    headers.set('Authorization', `Bearer ${SECRET}`);
  }
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(`${API}${path}`, { ...options, headers });
}
