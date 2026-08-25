/**
 * Voice input for the Raven console.
 *
 * Dictation over the browser's Web Speech API — no key, no upload endpoint, no
 * new dependency. The tradeoff is that Chrome streams the audio to Google for
 * transcription rather than doing it locally, and Firefox does not implement the
 * API at all, so `supported` is false there and the mic never appears.
 *
 * Ported from the wake-word listener in `run-console`, minus the wake word:
 * this is a mic Ash presses, not a mic that is always on, so there is nothing to
 * gate on her name. What is kept is the part that was learned the hard way —
 * the utterance buffer.
 *
 * Chrome marks a result `isFinal` at every natural PAUSE, not at the end of what
 * you were saying, so one spoken sentence arrives as several final segments.
 * Submitting the first one immediately cuts you off mid-thought every time you
 * pause for breath. So finals accumulate and only submit after a real gap.
 * Interim results bump the timer too: interim traffic is the only positive
 * evidence that someone is still talking. MAX_UTTERANCE_MS is the backstop — a
 * mic left open in a noisy room must eventually submit rather than buffer
 * forever.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/* ─── Web Speech typings ─────────────────────────────────────────
   lib.dom ships SpeechRecognitionResultList but not SpeechRecognition itself,
   and `webkitSpeechRecognition` is not typed anywhere, so the surface this hook
   actually touches is declared here. */
interface SpeechRecognitionResultEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionFailureEvent extends Event {
  error: string;
}

interface SpeechRecognizer {
  continuous:     boolean;
  interimResults: boolean;
  lang:           string;
  start(): void;
  stop():  void;
  abort(): void;
  onresult: ((e: SpeechRecognitionResultEvent)  => void) | null;
  onerror:  ((e: SpeechRecognitionFailureEvent) => void) | null;
  onend:    (() => void) | null;
}

type SpeechRecognizerCtor = new () => SpeechRecognizer;

function recognizerCtor(): SpeechRecognizerCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?:       SpeechRecognizerCtor;
    webkitSpeechRecognition?: SpeechRecognizerCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/* ─── Tuning ─────────────────────────────────────────────────────
   1.8s of quiet ends an utterance — long enough to think mid-sentence, short
   enough that it does not feel like she missed you. */
const SILENCE_MS       = 1800;
const MAX_UTTERANCE_MS = 60_000;

export interface SpeechInput {
  /** Whether this browser has the API at all — hide the mic entirely if not. */
  supported: boolean;
  listening:  boolean;
  /** Live partial text while speaking, so the UI can show what was heard. */
  interim:    string;
  /** Set on a permission or service failure; cleared on the next start. */
  error:      string | null;
  toggle:     () => void;
  stop:       () => void;
}

/**
 * @param onUtterance - called once per completed utterance, after the silence gap
 */
export function useSpeechInput(onUtterance: (text: string) => void): SpeechInput {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim,   setInterim]   = useState('');
  const [error,     setError]     = useState<string | null>(null);

  const recRef     = useRef<SpeechRecognizer | null>(null);
  const wantOnRef  = useRef(false);            // desired state — survives Chrome's auto-stops
  const pendingRef = useRef('');
  const startedRef = useRef(0);
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Latest callback without re-creating the recognizer on every render.
  const utteranceRef = useRef(onUtterance);
  useEffect(() => { utteranceRef.current = onUtterance; }, [onUtterance]);

  // Support is a browser fact, so it can only be known after mount — this app is
  // statically exported and the first render happens with no window.
  useEffect(() => { setSupported(recognizerCtor() !== null); }, []);

  const flush = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    const text = pendingRef.current.trim();
    pendingRef.current = '';
    startedRef.current = 0;
    setInterim('');
    if (text) utteranceRef.current(text);
  }, []);

  const bumpTimer = useCallback(() => {
    if (!pendingRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    const elapsed = Date.now() - startedRef.current;
    const wait    = Math.max(250, Math.min(SILENCE_MS, MAX_UTTERANCE_MS - elapsed));
    timerRef.current = setTimeout(flush, wait);
  }, [flush]);

  const stop = useCallback(() => {
    wantOnRef.current = false;
    setListening(false);
    setInterim('');
    try { recRef.current?.stop(); } catch { /* already stopped */ }
    recRef.current = null;
    flush(); // whatever was said before the mic was cut still counts
  }, [flush]);

  const start = useCallback(() => {
    const Ctor = recognizerCtor();
    if (!Ctor || recRef.current) return;

    const rec = new Ctor();
    rec.continuous     = true;
    rec.interimResults = true;
    rec.lang           = navigator.language || 'en-US';

    rec.onresult = (e) => {
      let live = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const text   = result[0]?.transcript ?? '';
        if (result.isFinal) {
          const t = text.trim();
          if (t) {
            pendingRef.current = pendingRef.current ? `${pendingRef.current} ${t}` : t;
            if (!startedRef.current) startedRef.current = Date.now();
          }
        } else {
          live += text;
        }
      }
      setInterim((pendingRef.current + ' ' + live).trim());
      // Interim traffic means someone is still talking — hold the gap open.
      if (pendingRef.current) bumpTimer();
    };

    rec.onerror = (e) => {
      // 'no-speech' and 'aborted' are routine: Chrome fires them on silence and
      // on our own stop(). Only a real refusal is worth showing.
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        setError('Microphone blocked — allow it in the browser to talk.');
        stop();
      } else if (e.error === 'audio-capture') {
        setError('No microphone found.');
        stop();
      }
    };

    rec.onend = () => {
      // Chrome ends recognition on its own after silence even with
      // continuous=true. Without this restart the mic looks on and hears
      // nothing, which is worse than being visibly off.
      if (!wantOnRef.current || recRef.current !== rec) return;
      try { rec.start(); } catch { stop(); }
    };

    recRef.current    = rec;
    wantOnRef.current = true;
    setError(null);
    try {
      rec.start();
      setListening(true);
    } catch {
      recRef.current    = null;
      wantOnRef.current = false;
      setError('Could not start the microphone.');
    }
  }, [bumpTimer, stop]);

  const toggle = useCallback(() => {
    if (wantOnRef.current) stop(); else start();
  }, [start, stop]);

  // Leaving the screen must release the mic — an abandoned recognizer keeps the
  // tab's recording indicator lit.
  useEffect(() => () => {
    wantOnRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
    try { recRef.current?.abort(); } catch { /* nothing to release */ }
    recRef.current = null;
  }, []);

  return { supported, listening, interim, error, toggle, stop };
}
