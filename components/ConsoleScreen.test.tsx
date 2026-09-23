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

/** Let queued microtasks (fetch → reader.read → setState) settle. */
async function settle() {
  for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); });
}

describe('ConsoleScreen abort', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let chatSignal: AbortSignal | null;
  let tasksSignal: AbortSignal | null | undefined;

  beforeEach(() => {
    chatSignal = null;
    tasksSignal = null;
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
});
