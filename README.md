# raven-app

Raven's frontend. Next.js 16 / React 19, deployed to **Railway — never Vercel or
Netlify**, whatever the boilerplate this file used to contain said.

**`../raven-api/RAVEN.md` is the authoritative reference for the whole system.**
The screen map and the Console are §5.3; this file only covers running it locally.

## Running it

```bash
npm install
npm run dev          # http://localhost:3000, or $PORT
```

Everything the browser fetches goes through `app/api/proxy/[...path]/route.ts`,
which injects the Bearer token server-side so no secret reaches the client bundle.

| Variable | What it does |
|---|---|
| `RAVEN_API_URL` | Which raven-api to talk to. Read at **request time**, so it can be changed without a rebuild. |
| `RAVEN_API_SECRET` | The Bearer token. Without it every proxied call returns 401. |
| `NEXT_PUBLIC_RAVEN_PASSWORD` | The `AuthGate` password. Defaults to `raven`. |

### Against a local backend

```bash
RAVEN_API_URL=http://localhost:3001 RAVEN_API_SECRET=... npm run dev
```

Open **Console** and type `/api`. It reports the origin that is actually answering
and whether a token is configured — never the token itself. Check it before
demoing: running against production while believing you are on local looks
identical from the outside until something writes.

## Verifying a change

```bash
npm test             # vitest + jsdom — the speech buffer, the parked-utterance
                     # seam, and WorkScreen lane grouping
npx tsc --noEmit     # types
npm run build        # what Railway runs
```

All three are gates. If `npm test` fails, assume it is your change until you have
proved otherwise on a clean checkout — the suite is small and every assertion in it
exists because that behaviour broke once already.

> ⚠️ **The suite needs the Node version jsdom asks for.** `jsdom@30` declares
> `engines: ^22.22.2 || ^24.15.0 || >=26.0.0`, and it means it: its bundled `undici`
> calls `markAsUncloneable` from `node:worker_threads`, which older Node does not
> export, so on Node 20.20.x the fork worker dies before any test file loads.
> That is a toolchain failure, not a code failure, and it looks nothing like a
> normal assertion error. On Node 24.19.0 — what this machine runs — the suite
> passes clean. If yours dies inside `node_modules` before a single test name
> prints, check `node -v` first.
