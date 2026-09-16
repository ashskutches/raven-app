/**
 * Next.js API Route — which raven-api is actually answering.
 *
 * The proxy resolves its upstream from `RAVEN_API_URL` server-side, so the browser
 * has no way to know whether it is talking to production or to a local backend.
 * That is fine everywhere except the Console, where the whole point is that it can
 * be pointed at either — and the failure it prevents is a real one: running a demo
 * against prod while believing you are on local, or editing local and wondering why
 * nothing changed.
 *
 * It reports the ORIGIN only, never the secret, and `authenticated` is a boolean
 * about whether a token is configured — never the token. A route that answers
 * "which host" must not become a route that answers "with what credential".
 *
 * Deliberately separate from `/api/health`, which promises to make no upstream
 * claim and should keep that promise.
 *
 * Route: /api/target
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|$)/i;

export function GET() {
  const raw = process.env.RAVEN_API_URL
    || process.env.NEXT_PUBLIC_RAVEN_API_URL
    || 'https://raven-api-production.up.railway.app';

  // Parsed rather than echoed: an origin cannot carry a path, a query or a
  // credential, and a misconfigured var is exactly where one would hide.
  let upstream = raw;
  try { upstream = new URL(raw).origin; } catch { /* report it as given */ }

  return NextResponse.json({
    upstream,
    local: LOCAL.test(upstream),
    authenticated: Boolean(process.env.RAVEN_API_SECRET),
  });
}
