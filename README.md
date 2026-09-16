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
npx tsc --noEmit     # the real gate
npm run build        # what Railway runs
```

> ⚠️ `npm test` (vitest + jsdom) does not run on Node 20.20.x here — jsdom pulls a
> bundled `undici` that calls `webidl.util.markAsUncloneable`, and the fork worker
> dies before any test file loads. It fails identically on a clean checkout, so it
> is the toolchain and not your change. `tsc --noEmit` and `npm run build` both
> pass and are the checks to trust until the Node version moves.
