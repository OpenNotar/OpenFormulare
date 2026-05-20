// Admin overlay: edit per-dialog translations for one target language at a
// time. Translations are stored separately from the schema (German remains
// canonical), so this editor talks to /api/admin/translations.
//
// Features:
//   - language tabs (only the ones enabled on the dialog)
//   - language enable/disable toggles (writes back to `schema.languages`)
//   - per-key textarea with German source string above as reference
//   - import/export the current language as JSON
//   - missing keys are filtered into a "missing" filter chip
//
// The editor is read-only with respect to the dialog structure: it never
// edits the canonical schema. Adding/removing/renaming fields happens in
// the regular dialog editor; this overlay only edits translation strings.

import { useEffect, useMemo, useState } from 'react';
import type { FormSchema } from '../../types/schema';
import {
  SUPPORTED_LANGUAGES,
  LANGUAGE_LABELS,
  type LanguageCode,
} from '../../i18n';
import {
  getDialogTranslation,
  putDialogTranslation,
  deleteDialogTranslation,
  type TranslationMap,
} from '../../lib/translationsApi';
import { collectTranslatableEntries } from '../../lib/i18nKeys';

interface Props {
  schema: FormSchema;
  onSchemaChange: (patch: Partial<FormSchema>) => void;
  onClose: () => void;
}

type Filter = 'all' | 'missing' | 'translated';

const TARGET_LANGUAGES = SUPPORTED_LANGUAGES.filter((l) => l !== 'de') as Exclude<LanguageCode, 'de'>[];

export function TranslationsEditor({ schema, onSchemaChange, onClose }: Props) {
  const enabled = (schema.languages ?? []) as LanguageCode[];
  const [activeLang, setActiveLang] = useState<LanguageCode | null>(enabled[0] ?? null);
  const [translations, setTranslations] = useState<TranslationMap>({});
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  const entries = useMemo(() => collectTranslatableEntries(schema), [schema]);

  useEffect(() => {
    if (!activeLang) {
      setTranslations({});
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getDialogTranslation(schema.id, activeLang)
      .then((r) => {
        if (!cancelled) setTranslations(r.translations);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [schema.id, activeLang]);

  function toggleLanguage(lang: LanguageCode) {
    const next = enabled.includes(lang)
      ? enabled.filter((l) => l !== lang)
      : [...enabled, lang];
    onSchemaChange({ languages: next });
    if (!next.includes(activeLang as LanguageCode)) {
      setActiveLang(next[0] ?? null);
    }
    if (enabled.includes(lang) && !next.includes(lang)) {
      // Deleting a language: also drop stored translations on the server.
      deleteDialogTranslation(schema.id, lang).catch(() => {});
    }
  }

  async function save() {
    if (!activeLang) return;
    setStatus(null);
    setError(null);
    try {
      await putDialogTranslation(schema.id, activeLang, translations);
      setStatus('Gespeichert.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.');
    }
  }

  function exportJson() {
    if (!activeLang) return;
    const payload = {
      dialogId: schema.id,
      language: activeLang,
      translations,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${schema.id}.${activeLang}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJson(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string) as {
          translations?: TranslationMap;
        };
        if (!parsed.translations || typeof parsed.translations !== 'object') {
          setError('JSON enthält kein `translations`-Feld.');
          return;
        }
        setTranslations(parsed.translations);
        setStatus('JSON geladen. Nicht vergessen zu speichern.');
      } catch {
        setError('Datei konnte nicht gelesen werden.');
      }
    };
    reader.readAsText(file);
  }

  const filteredEntries = entries.filter((e) => {
    const hasTranslation = translations[e.key] !== undefined && translations[e.key] !== '';
    if (filter === 'missing' && hasTranslation) return false;
    if (filter === 'translated' && !hasTranslation) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!e.key.toLowerCase().includes(s) && !e.german.toLowerCase().includes(s) && !e.context.toLowerCase().includes(s)) {
        return false;
      }
    }
    return true;
  });

  const missingCount = entries.filter(
    (e) => !translations[e.key] || translations[e.key] === '',
  ).length;

  return (
    <div className="fixed inset-0 z-40 flex bg-slate-900/60 backdrop-blur-sm">
      <div className="m-auto w-full max-w-6xl h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3 border-b border-gray-200 flex items-center gap-3">
          <div className="flex-1">
            <h2 className="text-base font-semibold text-gray-800">Übersetzungen</h2>
            <p className="text-xs text-gray-500">
              Dialog „{schema.title}" — Deutsch ist die Quellsprache. Felder mit
              leerem Wert fallen automatisch auf Deutsch zurück.
            </p>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Schließen
          </button>
        </div>

        {/* Language enable matrix */}
        <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
          <p className="text-xs font-medium text-gray-600 mb-2">
            Verfügbare Sprachen (zusätzlich zu Deutsch):
          </p>
          <div className="flex flex-wrap gap-2">
            {TARGET_LANGUAGES.map((l) => {
              const on = enabled.includes(l);
              return (
                <button
                  key={l}
                  onClick={() => toggleLanguage(l)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    on
                      ? 'bg-primary text-white border-primary'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-primary'
                  }`}
                >
                  {LANGUAGE_LABELS[l]}
                </button>
              );
            })}
          </div>
        </div>

        {enabled.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm p-10 text-center">
            Aktivieren Sie oben mindestens eine Sprache, um Übersetzungen
            anzulegen.
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="px-5 pt-3 flex flex-wrap gap-2">
              {enabled.map((l) => (
                <button
                  key={l}
                  onClick={() => setActiveLang(l)}
                  className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
                    activeLang === l
                      ? 'bg-primary text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {LANGUAGE_LABELS[l]}
                </button>
              ))}
            </div>

            {/* Toolbar */}
            <div className="px-5 py-3 flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder="Suchen (Schlüssel / Text) …"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 min-w-[200px] border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {(['all', 'missing', 'translated'] as Filter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    filter === f
                      ? 'bg-primary text-white border-primary'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-primary'
                  }`}
                >
                  {f === 'all' && `Alle (${entries.length})`}
                  {f === 'missing' && `Fehlend (${missingCount})`}
                  {f === 'translated' && `Übersetzt (${entries.length - missingCount})`}
                </button>
              ))}
              <label className="text-xs px-3 py-1.5 border border-gray-300 rounded-md hover:bg-gray-50 cursor-pointer">
                JSON importieren
                <input type="file" accept=".json" className="hidden" onChange={importJson} />
              </label>
              <button
                onClick={exportJson}
                className="text-xs px-3 py-1.5 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                JSON exportieren
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto px-5 pb-3">
              {loading ? (
                <p className="text-sm text-gray-400 py-8 text-center">Wird geladen …</p>
              ) : filteredEntries.length === 0 ? (
                <p className="text-sm text-gray-400 py-8 text-center">
                  Keine Einträge mit diesem Filter.
                </p>
              ) : (
                <div className="space-y-3">
                  {filteredEntries.map((entry) => (
                    <div
                      key={entry.key}
                      className="border border-gray-200 rounded-lg p-3 bg-white"
                    >
                      <div className="flex items-start justify-between gap-3 mb-1.5">
                        <span className="text-xs font-mono text-gray-400 truncate">
                          {entry.key}
                        </span>
                        <span className="text-xs text-gray-500 text-right shrink-0">
                          {entry.context}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div className="bg-gray-50 rounded px-3 py-2 text-sm text-gray-700 whitespace-pre-wrap">
                          {entry.german}
                        </div>
                        <textarea
                          value={translations[entry.key] ?? ''}
                          onChange={(e) =>
                            setTranslations((t) => ({ ...t, [entry.key]: e.target.value }))
                          }
                          rows={Math.min(6, Math.max(2, entry.german.split('\n').length))}
                          placeholder={`Übersetzung (${activeLang ?? ''}) …`}
                          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                          dir={activeLang === 'ar' ? 'rtl' : 'ltr'}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-gray-200 flex items-center gap-3">
              <button
                onClick={() => void save()}
                className="px-4 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary-dark rounded-md"
              >
                Speichern
              </button>
              {status && <span className="text-xs text-emerald-600">{status}</span>}
              {error && <span className="text-xs text-red-500">{error}</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
