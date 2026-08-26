import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ChatScreen from './ChatScreen';

/* Chrome's SpeechRecognition, reduced to what useSpeechInput touches. Driving
   the real hook rather than stubbing it keeps this test about the seam that
   actually broke: what handleUtterance does with a finished utterance. */
class FakeRecognizer {
  static last: FakeRecognizer | null = null;

  continuous     = false;
  interimResults = false;
  lang           = '';

  onresult: ((e: unknown) => void) | null = null;
  onerror:  ((e: unknown) => void) | null = null;
  onend:    (() => void) | null           = null;

  constructor() { FakeRecognizer.last = this; }

  start() {}
  stop()  {}
  abort() {}

  emitFinal(transcript: string) {
    const result = Object.assign([{ transcript }], { isFinal: true, length: 1 });
    this.onresult?.({ resultIndex: 0, results: Object.assign([result], { length: 1 }) });
  }
}

/* A chat response whose body stays open until the test closes it, so the test
   can hold Raven mid-answer while the next thing is spoken. */
function openStream() {
  const encoder = new TextEncoder();
  const queued: Array<{ done: boolean; value?: Uint8Array }> = [];
  const waiting: Array<(v: { done: boolean; value?: Uint8Array }) => void> = [];

  const deliver = (v: { done: boolean; value?: Uint8Array }) => {
    const w = waiting.shift();
    if (w) w(v); else queued.push(v);
  };

  return {
    say:  (text: string) => deliver({ done: false, value: encoder.encode(`data: ${JSON.stringify({ text })}\n`) }),
    end:  () => deliver({ done: true }),
    body: {
      getReader: () => ({
        read: () => {
          const q = queued.shift();
          return q ? Promise.resolve(q) : new Promise(res => waiting.push(res));
        },
      }),
    },
  };
}

/** Let queued microtasks (fetch → reader.read → setState) settle. */
async function settle() {
  for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); });
}

/** Speak one utterance and let the silence gap close it. */
async function say(text: string) {
  await act(async () => { FakeRecognizer.last!.emitFinal(text); });
  await act(async () => { vi.advanceTimersByTime(2000); });
  await settle();
}

describe('ChatScreen voice input', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let streams: ReturnType<typeof openStream>[];

  beforeEach(() => {
    vi.useFakeTimers();
    FakeRecognizer.last = null;
    streams = [];
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition = FakeRecognizer;
    Element.prototype.scrollIntoView = vi.fn();

    fetchMock = vi.fn((url: string) => {
      if (typeof url === 'string' && url.includes('/chat')) {
        const s = openStream();
        streams.push(s);
        return Promise.resolve({
          ok: true,
          headers: { get: () => null },
          body: s.body,
        });
      }
      return Promise.resolve({ ok: true, headers: { get: () => null }, json: async () => ({}) });
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    localStorage.clear();
    sessionStorage.clear();
  });

  function lastUserMessage(callIndex: number): string {
    const body = JSON.parse(fetchMock.mock.calls[callIndex][1].body);
    return body.messages[body.messages.length - 1].content;
  }

  it('sends the utterance parked during streaming, not just the one that follows it', async () => {
    render(<ChatScreen />);
    await settle();

    await act(async () => { fireEvent.click(screen.getByLabelText('Talk to Raven')); });

    // 1. Spoken while she is idle — goes straight out, and she starts answering.
    await say("what's on my calendar");
    expect(fetchMock.mock.calls.filter(c => String(c[0]).includes('/chat'))).toHaveLength(1);

    // 2. Spoken over her answer — sendMessage refuses mid-stream, so it parks
    //    in the box for Ash to send when she is done.
    await say('and also remind me about the gym');
    const box = screen.getByLabelText('Message input') as HTMLTextAreaElement;
    expect(box.value).toBe('and also remind me about the gym');

    // 3. She finishes. Ash keeps talking instead of reaching for the button.
    await act(async () => { streams[0].say('Nothing today.'); streams[0].end(); });
    await settle();
    await say('thanks');

    const chatCalls = fetchMock.mock.calls
      .map((c, i) => [c, i] as const)
      .filter(([c]) => String(c[0]).includes('/chat'))
      .map(([, i]) => i);
    expect(chatCalls).toHaveLength(2);

    // The gym sentence was captured and shown; it must not vanish unsent.
    const sent = lastUserMessage(chatCalls[1]);
    expect(sent).toContain('and also remind me about the gym');
    expect(sent).toContain('thanks');
  });
});
