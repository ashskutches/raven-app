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

/**
 * Which build is answering.
 *
 * A liveness probe that only says "ok" cannot distinguish a successful deploy
 * from the PREVIOUS build still serving -- the old container answers 200 just
 * as cheerfully. So a deploy could silently not ship and every signal would
 * look healthy, which is this repo's documented failure mode: deploys here are
 * manual (`railway up`), and one that never ran leaves no trace anywhere else.
 *
 * claude-station's bin/ship.mjs verifies a deploy by polling until the commit
 * it pushed is the commit being served. Without this field that check can never
 * succeed, so it would report NOT VERIFIED on a perfectly good deploy and file
 * a job about it -- a check that cannot pass, which is no better than one that
 * cannot fail. raven-api's /health has reported `commit` for exactly this
 * reason.
 *
 * RAILWAY_GIT_COMMIT_SHA is injected by Railway at build time. Locally there is
 * no such variable, so it reports 'dev' rather than pretending to know.
 */
const COMMIT = (process.env.RAILWAY_GIT_COMMIT_SHA ?? 'dev').slice(0, 7);
const BRANCH = process.env.RAILWAY_GIT_BRANCH ?? 'dev';

export function GET() {
  return NextResponse.json({
    status: 'ok',
    name: 'raven-app',
    commit: COMMIT,
    branch: BRANCH,
  });
}
