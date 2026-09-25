// @vitest-environment node
//
// The route is server code and NextResponse needs the real Request/Response
// globals; jsdom (this suite's default) supplies neither.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

/* Why this file exists, and why it is stricter than "the route returns 200".
 *
 * The body of /api/health is a cross-repo contract with exactly one consumer:
 * claude-station's bin/ship.mjs. Its verifyShipped() polls this endpoint after
 * a deploy and compares
 *
 *     String(body.commit ?? '').slice(0, 7)   against   the sha it pushed
 *
 * Nothing in raven-app reads `commit`, so renaming it to `sha`, or dropping it
 * during a refactor, breaks nothing that this repo can observe. The failure
 * lands in the other repo, twelve minutes later, as a verify timeout followed
 * by a filed failure job about a deploy that in fact succeeded.
 *
 * So these assertions deliberately mirror ship.mjs's expression rather than
 * checking the fields loosely: the point is to fail here, in `npm run test`,
 * at the moment the contract is broken.
 */

/** A full-length sha, as Railway injects it. Deliberately not 7 chars. */
const FULL_SHA = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';

/** COMMIT/BRANCH are module-level constants read at import time, so each case
    needs a fresh module registry rather than a mutated export. */
async function loadRoute(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return import('./route');
}

const ORIGINAL = {
  RAILWAY_GIT_COMMIT_SHA: process.env.RAILWAY_GIT_COMMIT_SHA,
  RAILWAY_GIT_BRANCH: process.env.RAILWAY_GIT_BRANCH,
};

beforeEach(() => { vi.resetModules(); });

afterEach(() => {
  for (const [key, value] of Object.entries(ORIGINAL)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.resetModules();
});

describe('GET /api/health', () => {
  it('answers 200 with no redirect and no auth', async () => {
    const { GET } = await loadRoute({ RAILWAY_GIT_COMMIT_SHA: FULL_SHA });
    const res = GET();

    expect(res.status).toBe(200);
  });

  it('reports every field the deploy verifier reads', async () => {
    const { GET } = await loadRoute({
      RAILWAY_GIT_COMMIT_SHA: FULL_SHA,
      RAILWAY_GIT_BRANCH: 'main',
    });
    const body = await GET().json();

    expect(body).toEqual({
      status: 'ok',
      name: 'raven-app',
      commit: FULL_SHA.slice(0, 7),
      branch: 'main',
    });
  });

  /* The load-bearing one. This is verifyShipped's comparison, verbatim. */
  it('lets ship.mjs match the deployed sha against the one it pushed', async () => {
    const { GET } = await loadRoute({ RAILWAY_GIT_COMMIT_SHA: FULL_SHA });
    const body = await GET().json();

    const live = String(body.commit ?? '').slice(0, 7);

    expect(live).not.toBe('');
    expect(FULL_SHA.startsWith(live)).toBe(true);
  });

  it('says dev rather than guessing when Railway injected nothing', async () => {
    const { GET } = await loadRoute({
      RAILWAY_GIT_COMMIT_SHA: undefined,
      RAILWAY_GIT_BRANCH: undefined,
    });
    const body = await GET().json();

    expect(body.commit).toBe('dev');
    expect(body.branch).toBe('dev');
  });

  /* Guards the shape itself: a 7-char hex sha, or the honest local fallback.
     ship.mjs slices to 7, so a longer value would silently still "work" here
     while meaning something different to a human reading the response. */
  it('reports commit as a 7-char sha or dev, never anything else', async () => {
    for (const sha of [FULL_SHA, undefined]) {
      const { GET } = await loadRoute({ RAILWAY_GIT_COMMIT_SHA: sha });
      const body = await GET().json();

      expect(body.commit).toMatch(/^[0-9a-f]{7}$|^dev$/);
    }
  });
});

/* The other half of the same cross-repo contract: WHERE the handler answers.
 *
 * Everything above imports the handler as `./route`, so it follows the module
 * wherever the module goes. Move this route to app/api/healthz/ and drag the
 * test alongside it -- the obvious refactor -- and `npm test`, `npx tsc
 * --noEmit` and `npm run build` all stay green while two hardcoded callers
 * start getting Next's 404 HTML:
 *
 *   claude-station bin/ship.mjs  -> .../api/health, polled after every deploy
 *   railway.toml healthcheckPath -> /api/health, probed by the platform
 *
 * Neither is reachable from an import graph, so nothing else in this repo can
 * notice. ship.mjs's `await res.json()` throws on the 404 body, verifyShipped
 * times out after twelve minutes and files a failure job about a deploy that
 * in fact succeeded; Railway just kills the container. Assert the location
 * literally, for the same reason the body assertions are literal.
 */
describe('/api/health, the URL', () => {
  /** Hardcoded in ship.mjs and railway.toml. Changing it is a two-repo edit. */
  const HEALTH_PATH = '/api/health';

  /** Walk up rather than count `..` -- counting would silently follow a move. */
  function repoRoot(from: string) {
    for (let dir = from; ; ) {
      if (existsSync(join(dir, 'package.json'))) return dir;
      const up = dirname(dir);
      if (up === dir) throw new Error(`no package.json above ${from}`);
      dir = up;
    }
  }

  const root = repoRoot(__dirname);
  const handlerDir = relative(root, __dirname).split(sep).join('/');

  it('is served from the directory App Router maps that URL to', () => {
    expect(handlerDir).toBe(`app${HEALTH_PATH}`);
    expect(existsSync(join(__dirname, 'route.ts'))).toBe(true);
  });

  it('is the path railway.toml tells the platform to probe', () => {
    const toml = readFileSync(join(root, 'railway.toml'), 'utf8');
    const probed = /^\s*healthcheckPath\s*=\s*"([^"]*)"/m.exec(toml)?.[1];

    expect(probed).toBe(HEALTH_PATH);
  });
});
