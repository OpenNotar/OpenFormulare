// Frontend i18n entry point.
//
// - SUPPORTED_LANGUAGES: list of language codes the system can render
// - LANGUAGE_LABELS:    native-language name of each language for the picker
// - RTL_LANGUAGES:      languages that need `dir="rtl"` applied to the wrapper
// - useLanguage():      reads the active language from the URL `?lang=xx`
//                        query, falls back to localStorage, then 'de'
// - useUiStrings():     returns the typed UI string bundle for the active
//                        language plus a `t(key, vars?)` interpolation helper
//
// The active language is *only* read by the wizard / fields / public home.
// Admin / editor UI stays German.

import { useEffect, useState, useCallback } from 'react';
import { UI_STRINGS, de, type UiStrings } from './strings';

export const SUPPORTED_LANGUAGES = ['de', 'en', 'fr', 'es', 'pl', 'ar', 'ru'] as const;
export type LanguageCode = typeof SUPPORTED_LANGUAGES[number];

export const LANGUAGE_LABELS: Record<LanguageCode, string> = {
  de: 'Deutsch',
  en: 'English',
  fr: 'Français',
  es: 'Español',
  pl: 'Polski',
  ar: 'العربية',
  ru: 'Русский',
};

export const RTL_LANGUAGES: ReadonlySet<LanguageCode> = new Set(['ar']);

const STORAGE_KEY = 'openformulare:lang';

export function isSupportedLanguage(code: unknown): code is LanguageCode {
  return typeof code === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(code);
}

export function isRtl(code: LanguageCode): boolean {
  return RTL_LANGUAGES.has(code);
}

// Returns the active language from URL `?lang=xx`, then localStorage,
// finally falling back to `defaultLang` (the dialog's default, usually 'de').
//
// Components observe the URL and re-read on `popstate`.
export function useLanguage(defaultLang: LanguageCode = 'de', enabled?: LanguageCode[]): {
  language: LanguageCode;
  setLanguage: (code: LanguageCode) => void;
} {
  const resolve = useCallback((): LanguageCode => {
    if (typeof window === 'undefined') return defaultLang;
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('lang');
    if (isSupportedLanguage(fromUrl) && (!enabled || enabled.includes(fromUrl) || fromUrl === 'de')) {
      return fromUrl;
    }
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isSupportedLanguage(stored) && (!enabled || enabled.includes(stored) || stored === 'de')) {
      return stored;
    }
    return defaultLang;
  }, [defaultLang, enabled]);

  const [language, setLanguageState] = useState<LanguageCode>(resolve);

  useEffect(() => {
    setLanguageState(resolve());
    const onPopState = () => setLanguageState(resolve());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [resolve]);

  const setLanguage = useCallback((code: LanguageCode) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, code);
    const url = new URL(window.location.href);
    if (code === 'de') {
      url.searchParams.delete('lang');
    } else {
      url.searchParams.set('lang', code);
    }
    window.history.replaceState({}, '', url.toString());
    setLanguageState(code);
    // Update the document direction immediately for RTL languages.
    document.documentElement.dir = isRtl(code) ? 'rtl' : 'ltr';
    document.documentElement.lang = code;
  }, []);

  useEffect(() => {
    document.documentElement.dir = isRtl(language) ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
  }, [language]);

  return { language, setLanguage };
}

// Returns the UI string bundle for the active language plus a `t` helper
// that resolves a key from that bundle (falling back to German). Supports
// {placeholder} interpolation.
export function getUiStrings(language: LanguageCode): UiStrings {
  return UI_STRINGS[language] ?? de;
}

export function tUi(
  language: LanguageCode,
  key: keyof UiStrings,
  vars?: Record<string, string | number>,
): string {
  const bundle = getUiStrings(language);
  let value = bundle[key] ?? de[key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      value = value.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return value;
}
