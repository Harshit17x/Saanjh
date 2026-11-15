import { useCallback, useEffect, useState } from 'react';
import type { Language } from '../../../shared/types';

/** Slightly slower than normal speech, which older listeners find easier to follow. */
const SPEECH_RATE = 0.9;
const SPEECH_LANG: Record<Language, string> = { en: 'en-IN', hi: 'hi-IN' };

/** True when the browser can speak text aloud. */
export const speechAvailable = (): boolean => typeof window !== 'undefined' && 'speechSynthesis' in window;

/** Start/stop control for the browser's speech synthesis; stops speaking when the page unmounts. */
export function useReadAloud(language: Language) {
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  const toggle = useCallback(
    (text: string) => {
      const synth = window.speechSynthesis;
      synth.cancel();
      if (speaking) {
        setSpeaking(false);
        return;
      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = SPEECH_LANG[language];
      utterance.rate = SPEECH_RATE;
      utterance.onend = () => setSpeaking(false);
      synth.speak(utterance);
      setSpeaking(true);
    },
    [language, speaking],
  );

  return { speaking, toggle };
}
