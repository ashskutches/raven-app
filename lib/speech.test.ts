import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSpeechInput } from './speech';

/* A stand-in for Chrome's SpeechRecognition. It records the handlers the hook
   attaches and lets a test deliver results the way the browser does — including
   the trailing final segment Chrome emits *after* stop(), which is the whole
   point of these tests. */
class FakeRecognizer {
  static last: FakeRecognizer | null = null;

  continuous     = false;
  interimResults = false;
  lang           = '';

  onresult: ((e: unknown) => void) | null = null;
  onerror:  ((e: unknown) => void) | null = null;
  onend:    (() => void) | null           = null;

  running = false;

  constructor() { FakeRecognizer.last = this; }

  start() { this.running = true; }
  stop()  { this.running = false; }
  abort() { this.running = false; }

  /** Deliver one isFinal segment, as Chrome does at every natural pause. */
  emitFinal(transcript: string) {
    const result = Object.assign([{ transcript }], { isFinal: true, length: 1 });
    this.onresult?.({ resultIndex: 0, results: Object.assign([result], { length: 1 }) });
  }
}

describe('useSpeechInput', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeRecognizer.last = null;
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition = FakeRecognizer;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
  });

  it('submits the buffered finals when the mic is switched off', () => {
    const onUtterance = vi.fn();
    const { result } = renderHook(() => useSpeechInput(onUtterance));

    act(() => { result.current.toggle(); });
    act(() => { FakeRecognizer.last!.emitFinal('hey Raven'); });
    act(() => { result.current.stop(); });

    expect(onUtterance).toHaveBeenCalledTimes(1);
    expect(onUtterance).toHaveBeenCalledWith('hey Raven');
  });

  it('ignores the trailing final Chrome delivers after stop()', () => {
    const onUtterance = vi.fn();
    const { result } = renderHook(() => useSpeechInput(onUtterance));

    act(() => { result.current.toggle(); });
    const rec = FakeRecognizer.last!;

    act(() => { rec.emitFinal('hey Raven'); });
    act(() => { result.current.stop(); });
    expect(onUtterance).toHaveBeenCalledTimes(1);

    // Per spec stop() "attempts to return a Result using the audio captured so
    // far", so Chrome fires one more isFinal afterwards. The mic is already off
    // and nothing on screen shows a pending utterance — it must not be sent.
    act(() => { rec.emitFinal("what's the"); });
    act(() => { vi.advanceTimersByTime(5000); });

    expect(onUtterance).toHaveBeenCalledTimes(1);
  });
});
