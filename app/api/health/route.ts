/**
 * Next.js API Route — the container's liveness probe.
 *
 * Railway's healthcheck pointed at `/` until 2026-09-16, and `/` is a redirect
 * into `/work`, which is behind AuthGate. So the probe depended on redirect
 * following and on an auth-gated screen answering — two things that have nothing
 * to do with whether the server is up, and either of which can change underneath
 * us. It did: two deploys failed on 2026-09-16 with the container logging
 * "Ready" and Railway stopping it anyway, while the same build served
 * `/` → 307 → `/work` → 200 correctly on localhost.
 *
 * This answers 200 with no redirect, no auth and no upstream call. It says the
 * Next server is accepting connections and nothing else — which is exactly what
 * a liveness probe should claim. Whether raven-api is reachable is a different
 * question with a different answer, and folding it in here would take the
 * frontend down every time the backend blipped.
 *
 * Route: /api/health
 */

import { NextResponse } from 'next/server';

/** Never prerendered or cached — a cached health response is not a health check. */
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ status: 'ok', name: 'raven-app' });
}
