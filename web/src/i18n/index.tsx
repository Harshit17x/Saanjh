import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Language } from '../../../shared/types';
import { en, type MessageKey } from './en';
import { hi } from './hi';
import { readStored, writeStored } from '../lib/storage';

const TABLES: Record<Language, Record<MessageKey, string>> = { en, hi };
const LOCALES: Record<Language, string> = { en: 'en-IN', hi: 'hi-IN' };

export type Vars = Record<string, string | number>;
export type Translate = (key: MessageKey, vars?: Vars) => string;

/** Fills `{name}` placeholders in a message. */
export function format(message: string, vars: Vars = {}): string {
  return message.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

interface I18nValue {
  language: Language;
  locale: string;
  setLanguage: (language: Language) => void;
  t: Translate;
}

const I18nContext = createContext<I18nValue | null>(null);

const isLanguage = (value: unknown): value is Language => value === 'en' || value === 'hi';

/** Provides the chosen language, remembered on this device, and keeps `<html lang>` in sync. */
export function I18nProvider({ children, initial }: { children: ReactNode; initial?: Language }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const stored = readStored('language');
    return isLanguage(stored) ? stored : (initial ?? 'en');
  });

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    writeStored('language', next);
  }, []);

  const value = useMemo<I18nValue>(
    () => ({
      language,
      locale: LOCALES[language],
      setLanguage,
      t: (key, vars) => format(TABLES[language][key], vars),
    }),
    [language, setLanguage],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside I18nProvider');
  return value;
}
