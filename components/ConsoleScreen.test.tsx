import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ConsoleScreen from './ConsoleScreen';

/* A chat body that stays open until the turn is aborted — the long multi-tool
   turn the Esc affordance exists for. Reading rejects the way a real fetch body
   does once its signal fires, so the test observes what Ash observes: the
   stream stops and the console says so. */
function openStream(signal: AbortSignal) {
  let rejectRead: ((e: unknown) => void) | null = null;

  signal.addEventListener('abort', () => {
    const err = new Error('The operation was aborted.');
    err.name = 'AbortError';
    rejectRead?.(err);
  });

  return {
    getReader: () => ({
      read: () => new Promise<never>((_res, rej) => { rejectRead = rej; }),
    }),
  };
}

/* A request that never answers on its own. Rejects the way fetch does when its
   signal fires — and never at all if it was handed no signal, which is exactly
   the shape of the bug. */
function stalled(signal: AbortSignal | null | undefined) {
  return new Promise<never>((_res, rej) => {
    signal?.addEventListener('abort', () => {
      const err = new Error('The operation was aborted.');
      err.name = 'AbortError';
      rej(err);
    });
  });
}

/* The console's one write. raven-api has taken the PATCH and is slow to answer
   — the exact condition the Esc affordance exists for.

   It rejects if its signal fires, the way a real browser fetch does, and
   `land()` resolves it with what raven-api answers once it has applied the
   change. Both are reachable, and that is the point: the proxy at
   app/api/proxy/[...path]/route.ts builds its upstream init from `method`,
   `headers` and `body` only — `req.signal` is never forwarded — so cancelling
   the browser leg never reaches raven-api. The write commits either way. */
function slowWrite(signal: AbortSignal | null | undefined, body: unknown) {
  let land = () => {};
  const promise = new Promise<unknown>((res, rej) => {
    land = () => res({ ok: true, headers: { get: () => null }, json: async () => body });
    signal?.addEventListener('abort', () => {
      const err = new Error('The operation was aborted.');
      err.name = 'AbortError';
      rej(err);
    });
  });
  return { promise, land: () => land(), signal };
}

/** Let queued microtasks (fetch → reader.read → setState) settle. */
async function settle() {
  for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); });
}

describe('ConsoleScreen abort', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let chatSignal: AbortSignal | null;
  let tasksSignal: AbortSignal | null | undefined;
  let registerWrite: ReturnType<typeof slowWrite> | null;
  let identityChanged: number;
  const countIdentity = () => { identityChanged += 1; };

  beforeEach(() => {
    chatSignal = null;
    tasksSignal = null;
    registerWrite = null;
    identityChanged = 0;
    window.addEventListener('raven:identity-changed', countIdentity);
    fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (typeof url === 'string' && url.includes('/chat')) {
        chatSignal = init!.signal!;
        return Promise.resolve({
          ok: true,
          headers: { get: () => null },
          body: openStream(chatSignal),
        });
      }
      // A raven-api that has accepted the request and gone quiet: the promise
      // only ever settles by being cancelled, which is the state /work is in
      // when Ash reaches for Esc.
      if (typeof url === 'string' && url.includes('/tasks')) {
        tasksSignal = init?.signal;
        return stalled(tasksSignal);
      }
      // The console's one writing command, mid-flight. Discriminated on method:
      // boot reads this same path with a GET.
      if (typeof url === 'string' && url.includes('/settings/voice') && init?.method === 'PATCH') {
        registerWrite = slowWrite(init?.signal, { register: 'vivid', previous: 'balanced' });
        return registerWrite.promise;
      }
      // Boot's three reads; their contents are not what this test is about.
      return Promise.resolve({ ok: true, headers: { get: () => null }, json: async () => ({}) });
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    // vitest.config.ts does not set `globals`, so RTL's auto-cleanup never
    // registers — a second render would stack a second console in the document
    // and every getByLabelText would find two.
    cleanup();
    window.removeEventListener('raven:identity-changed', countIdentity);
    vi.unstubAllGlobals();
  });

  /* The console promises an abort in two places — the placeholder that reads
     "working — Esc to abort" and the /help line "Esc aborts a running turn".
     The only moment either promise matters is while a turn is running, and
     that is exactly when the input carries `disabled`. A disabled input is
     blurred by the browser and receives no keyboard events, so Escape lands on
     document.body instead. Dispatching there is not a convenience for the
     test; it is where the keystroke genuinely arrives. */
  it('aborts a running turn when Esc is pressed — the input is disabled by then, so the key never reaches it', async () => {
    render(<ConsoleScreen />);
    await settle();

    const input = screen.getByLabelText('Console input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'audit every invoice this quarter' } });
    await act(async () => { fireEvent.keyDown(input, { key: 'Enter' }); });
    await settle();

    // The premise: mid-turn, the console has taken the input away from Ash.
    expect(input.disabled).toBe(true);
    expect(input.placeholder).toBe('working — Esc to abort');
    expect(chatSignal).not.toBeNull();
    expect(chatSignal!.aborted).toBe(false);

    await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }); });
    await settle();

    expect(chatSignal!.aborted).toBe(true);
    expect(screen.getByText(/\^C\s+aborted/)).toBeTruthy();
    // And the console is Ash's again, rather than stuck working forever.
    expect((screen.getByLabelText('Console input') as HTMLInputElement).disabled).toBe(false);
  });

  /* Same promise, made to the same two places — but a slash command took a
     different path out of submit(). `send()` is where the AbortController is
     built, so a command ran with abortRef.current still null: Esc swallowed the
     keystroke and aborted nothing. Commands are the likeliest thing to hang,
     because /work, /approvals and /whoami are pure reads of a raven-api that
     may have stopped answering. */
  it('aborts a slash command mid-flight — /work against a raven-api that has gone quiet', async () => {
    render(<ConsoleScreen />);
    await settle();

    const input = screen.getByLabelText('Console input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '/work' } });
    await act(async () => { fireEvent.keyDown(input, { key: 'Enter' }); });
    await settle();

    // Same premise as the chat turn: the console has taken itself away from Ash
    // and is advertising the way back.
    expect(input.disabled).toBe(true);
    expect(input.placeholder).toBe('working — Esc to abort');
    expect(tasksSignal, '/work was issued with no abort signal').toBeTruthy();
    expect(tasksSignal!.aborted).toBe(false);

    await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }); });
    await settle();

    expect(tasksSignal!.aborted).toBe(true);
    expect(screen.getByText(/\^C\s+aborted/)).toBeTruthy();
    expect((screen.getByLabelText('Console input') as HTMLInputElement).disabled).toBe(false);
  });

  /* Every other command threading the signal is a read. `/register <arg>` is not:
     it is the one command that changes something on raven-api.

     Cancelling it is not possible, and pretending otherwise is worse than not
     offering it. The browser fetch is cancellable; the PATCH it triggered is
     not. The proxy forwards method, headers and body and nothing else, so the
     upstream request is already at raven-api with no way back — and even a
     forwarded signal would only drop the connection, not un-apply the write.
     So Esc reaches a console that has no power to stop the thing it is offering
     to stop, and the honest behaviour is to keep waiting for the real answer. */
  it('does not claim it cancelled a /register write — the change lands on raven-api regardless', async () => {
    render(<ConsoleScreen />);
    await settle();

    const input = screen.getByLabelText('Console input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '/register vivid' } });
    await act(async () => { fireEvent.keyDown(input, { key: 'Enter' }); });
    await settle();

    expect(input.disabled).toBe(true);
    expect(registerWrite, '/register vivid issued no PATCH').not.toBeNull();

    // Ash, watching a console that says "working — Esc to abort", reaches for Esc.
    await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }); });
    await settle();

    // The console has no standing to say this, and by here it has already said it.
    expect(
      screen.queryByText(/\^C\s+aborted/),
      'the console reported a change it had no power to stop as aborted',
    ).toBeNull();
    // Nothing was cancelled, so it must still be waiting rather than handing the
    // prompt back on a turn whose outcome it does not yet know.
    expect(
      (screen.getByLabelText('Console input') as HTMLInputElement).disabled,
      'the console took the turn back before raven-api had answered the write',
    ).toBe(true);

    // raven-api applies the change and answers the proxy, which is holding a
    // request nobody cancelled.
    await act(async () => { registerWrite!.land(); });
    await settle();

    expect(screen.queryByText(/\^C\s+aborted/)).toBeNull();
    expect(screen.getByText(/register\s+balanced → vivid/)).toBeTruthy();
    // The topbar carries the register and does not poll for it; skipping this
    // leaves it showing the old one with nothing on screen to explain why.
    expect(identityChanged, 'the topbar was never told the register changed').toBe(1);
    expect((screen.getByLabelText('Console input') as HTMLInputElement).disabled).toBe(false);
  });
});
