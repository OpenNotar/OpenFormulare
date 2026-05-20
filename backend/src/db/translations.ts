// ---------------------------------------------------------------------------
// Dialog translations.
//
// Translations are stored separately from the (encrypted) dialog schema so
// that translators can export/import per-language JSON files without
// touching the dialog structure. The schema itself stays canonical German.
//
// Storage: one row per (dialog_id, language) holding a JSON map of
// translation keys → translated strings. Key format is documented in
// `i18nKeys.ts`.
// ---------------------------------------------------------------------------

import { getDatabase } from './database';

export const SUPPORTED_LANGUAGES = ['en', 'fr', 'es', 'pl', 'ar', 'ru'] as const;
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

export const RTL_LANGUAGES = new Set(['ar']);

export type TranslationMap = Record<string, string>;

interface TranslationRow {
  dialog_id: string;
  language: string;
  translations_json: string;
  updated_at: string;
}

export function getTranslation(dialogId: string, language: string): TranslationMap | null {
  const row = getDatabase()
    .prepare(
      'SELECT dialog_id, language, translations_json, updated_at FROM dialog_translations WHERE dialog_id = ? AND language = ?',
    )
    .get(dialogId, language) as TranslationRow | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.translations_json) as TranslationMap;
  } catch {
    return null;
  }
}

export function listDialogLanguages(dialogId: string): string[] {
  const rows = getDatabase()
    .prepare('SELECT language FROM dialog_translations WHERE dialog_id = ?')
    .all(dialogId) as { language: string }[];
  return rows.map((r) => r.language);
}

export function setTranslation(dialogId: string, language: string, translations: TranslationMap): void {
  getDatabase()
    .prepare(
      `INSERT INTO dialog_translations (dialog_id, language, translations_json, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(dialog_id, language) DO UPDATE SET
         translations_json = excluded.translations_json,
         updated_at = excluded.updated_at`,
    )
    .run(dialogId, language, JSON.stringify(translations), new Date().toISOString());
}

export function deleteTranslation(dialogId: string, language: string): boolean {
  const res = getDatabase()
    .prepare('DELETE FROM dialog_translations WHERE dialog_id = ? AND language = ?')
    .run(dialogId, language);
  return res.changes > 0;
}

export function deleteAllTranslationsForDialog(dialogId: string): void {
  getDatabase()
    .prepare('DELETE FROM dialog_translations WHERE dialog_id = ?')
    .run(dialogId);
}
