import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { de as DE_STRINGS, type UiStrings } from './strings';
import { getUiStrings, tUi, type LanguageCode } from './index';

interface I18nContextValue {
  language: LanguageCode;
  strings: UiStrings;
  t: (key: keyof UiStrings, vars?: Record<string, string | number>) => string;
}

// Default = German. Fields used outside a provider (admin / editor preview)
// still get sensible strings.
const FALLBACK: I18nContextValue = {
  language: 'de',
  strings: DE_STRINGS,
  t: (key, vars) => tUi('de', key, vars),
};

const I18nContext = createContext<I18nContextValue>(FALLBACK);

export function I18nProvider({ language, children }: { language: LanguageCode; children: ReactNode }) {
  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      strings: getUiStrings(language),
      t: (key, vars) => tUi(language, key, vars),
    }),
    [language],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
