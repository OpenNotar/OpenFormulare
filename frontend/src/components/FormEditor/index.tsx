import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import type { FormSchema, FormStep, FormField, FieldType } from '../../types/schema';
import { ensureKontaktStepAtEnd } from '../../lib/sharedDialogSteps';
import { FormWizard } from '../FormWizard';
import { useTheme } from '../../hooks/useTheme';
import {
  acquireLock, releaseLock,
  listVersions, restoreVersion,
  type DialogVersion,
} from '../../lib/dialogsApi';
import { listPluginFieldTypes, type PluginFieldTypeInfo } from '../../lib/pluginsApi';
import {
  FIELD_TYPE_LABELS,
  SIMPLE_TYPES,
  slugify,
  makeEmptyField,
  makeEmptyStep,
  FieldConfigPanel,
} from './shared';
import { DialogIcon, DIALOG_ICON_NAMES, DIALOG_ICON_LABELS } from '../DialogIcon';
import { TranslationsEditor } from './TranslationsEditor';

// ---------------------------------------------------------------------------
// Types & helpers
// ---------------------------------------------------------------------------

export interface FormEditorProps {
  initialSchema?: FormSchema;
  onSave: (schema: FormSchema) => Promise<void> | void;
}

function makeEmptySchema(): FormSchema {
  return ensureKontaktStepAtEnd({
    id: 'neuer-dialog',
    title: 'Neuer Dialog',
    description: '',
    category: 'Allgemein',
    isActive: true,
    steps: [makeEmptyStep(1)],
  });
}

// ---------------------------------------------------------------------------
// Main: FormEditor
// ---------------------------------------------------------------------------

export function FormEditor({ initialSchema, onSave }: FormEditorProps) {
  useTheme();

  const [schema, setSchema] = useState<FormSchema>(ensureKontaktStepAtEnd(initialSchema ?? makeEmptySchema()));
  const [activeStepIdx, setActiveStepIdx] = useState(0);
  const [activeFieldIdx, setActiveFieldIdx] = useState<number | null>(null);
  const [preview, setPreview] = useState(false);
  const [saveNote, setSaveNote] = useState('');
  const [saveError, setSaveError] = useState('');

  // Plugin-Field-Typen (z. B. Terminfindung) — beim Mount asynchron laden.
  const [pluginFieldTypes, setPluginFieldTypes] = useState<PluginFieldTypeInfo[]>([]);
  useEffect(() => {
    let cancelled = false;
    listPluginFieldTypes().then((items) => {
      if (!cancelled) setPluginFieldTypes(items);
    });
    return () => { cancelled = true; };
  }, []);

  // Locking
  const dialogId = initialSchema?.id;
  const [lockError, setLockError] = useState('');

  const tryAcquireLock = useCallback(async () => {
    if (!dialogId) return;
    try {
      await acquireLock(dialogId);
      setLockError('');
    } catch (e) {
      setLockError(e instanceof Error ? e.message : 'Gesperrt');
    }
  }, [dialogId]);

  useEffect(() => {
    if (!dialogId) return;
    tryAcquireLock();
    const heartbeat = setInterval(tryAcquireLock, 5 * 60 * 1000);
    return () => {
      clearInterval(heartbeat);
      releaseLock(dialogId).catch(() => {});
    };
  }, [dialogId, tryAcquireLock]);

  // Translations editor
  const [showTranslations, setShowTranslations] = useState(false);

  // Versions
  const [showVersions, setShowVersions] = useState(false);
  const [versions, setVersions] = useState<DialogVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [restoreError, setRestoreError] = useState('');
  const [restoring, setRestoring] = useState(false);

  async function openVersions() {
    if (!dialogId) return;
    setShowVersions(true);
    setVersionsLoading(true);
    try {
      setVersions(await listVersions(dialogId));
    } finally {
      setVersionsLoading(false);
    }
  }

  async function handleRestore(versionId: number) {
    if (!dialogId) return;
    setRestoring(true);
    setRestoreError('');
    try {
      const restored = await restoreVersion(dialogId, versionId);
      setSchema(ensureKontaktStepAtEnd(restored));
      setActiveStepIdx(0);
      setActiveFieldIdx(null);
      setShowVersions(false);
    } catch (e) {
      setRestoreError(e instanceof Error ? e.message : 'Fehler');
    } finally {
      setRestoring(false);
    }
  }

  // Helpers
  const activeStep = schema.steps[activeStepIdx] as FormStep | undefined;
  const activeField = activeFieldIdx !== null ? activeStep?.fields[activeFieldIdx] : undefined;

  function updateSchema(patch: Partial<FormSchema>) {
    setSchema((s) => ({ ...s, ...patch }));
  }

  function updateStep(idx: number, patch: Partial<FormStep>) {
    setSchema((s) => ({
      ...s,
      steps: s.steps.map((st, i) => (i === idx ? { ...st, ...patch } : st)),
    }));
  }

  function updateField(stepIdx: number, fieldIdx: number, updated: FormField) {
    setSchema((s) => ({
      ...s,
      steps: s.steps.map((st, si) =>
        si !== stepIdx ? st : {
          ...st,
          fields: st.fields.map((f, fi) => (fi === fieldIdx ? updated : f)),
        },
      ),
    }));
  }

  function addStep() {
    const n = schema.steps.length + 1;
    const newStep = makeEmptyStep(n);
    setSchema((s) => {
      const kontaktIdx = s.steps.findIndex((step) => step.id === 'kontakt');
      const steps = [...s.steps];

      if (kontaktIdx >= 0) {
        steps.splice(kontaktIdx, 0, newStep);
      } else {
        steps.push(newStep);
      }

      return { ...s, steps };
    });
    setActiveStepIdx(Math.max(0, schema.steps.length - 1));
    setActiveFieldIdx(null);
  }

  function removeStep(idx: number) {
    if (schema.steps.length <= 1) return;
    if (schema.steps[idx]?.id === 'kontakt') return;
    setSchema((s) => ({ ...s, steps: s.steps.filter((_, i) => i !== idx) }));
    setActiveStepIdx((prev) => Math.min(prev, schema.steps.length - 2));
    setActiveFieldIdx(null);
  }

  function moveStep(idx: number, dir: -1 | 1) {
    const steps = [...schema.steps];
    const target = idx + dir;
    if (target < 0 || target >= steps.length) return;
    if (steps[idx]?.id === 'kontakt' || steps[target]?.id === 'kontakt') return;
    [steps[idx], steps[target]] = [steps[target], steps[idx]];
    setSchema((s) => ({ ...s, steps }));
    setActiveStepIdx(target);
  }

  function addField(type: FieldType) {
    if (!activeStep) return;
    const field = makeEmptyField(type);
    updateStep(activeStepIdx, { fields: [...activeStep.fields, field] });
    setActiveFieldIdx(activeStep.fields.length);
  }

  // Plugin-Felder werden zur Laufzeit registriert; ihre Typ-ID gehört nicht
  // zur statischen FieldType-Union. Wir bauen das Feld direkt und casten beim
  // Schreiben in die Schema-Struktur.
  function addPluginField(info: PluginFieldTypeInfo) {
    if (!activeStep) return;
    const id = slugify(info.label) + '_' + Date.now();
    const field = {
      id,
      label: info.label,
      // Default-Pflichtflag aus dem Plugin-Manifest; der Notar kann es im
      // FieldConfigPanel umschalten.
      required: info.defaultRequired === true,
      type: info.id,
      ...(info.defaultProps ?? {}),
    } as unknown as FormField;
    updateStep(activeStepIdx, { fields: [...activeStep.fields, field] });
    setActiveFieldIdx(activeStep.fields.length);
  }

  function removeField(fieldIdx: number) {
    if (!activeStep) return;
    updateStep(activeStepIdx, { fields: activeStep.fields.filter((_, i) => i !== fieldIdx) });
    setActiveFieldIdx(null);
  }

  function moveField(fieldIdx: number, dir: -1 | 1) {
    if (!activeStep) return;
    const fields = [...activeStep.fields];
    const target = fieldIdx + dir;
    if (target < 0 || target >= fields.length) return;
    [fields[fieldIdx], fields[target]] = [fields[target], fields[fieldIdx]];
    updateStep(activeStepIdx, { fields });
    setActiveFieldIdx(target);
  }

  async function handleSave() {
    const final = {
      ...ensureKontaktStepAtEnd(schema),
      id: schema.id || slugify(schema.title),
      category: schema.category || 'Allgemein',
      description: schema.description || '',
    };

    setSaveError('');
    setSaveNote('Speichert …');

    try {
      await onSave(final);
      setSaveNote('Gespeichert!');
      setTimeout(() => setSaveNote(''), 2000);
    } catch (error) {
      setSaveNote('');
      setSaveError(error instanceof Error ? error.message : 'Speichern fehlgeschlagen.');
    }
  }

  function handleExport() {
    const blob = new Blob([JSON.stringify(schema, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${schema.id || 'dialog'}.notar-schema.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportSchema(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target?.result as string) as FormSchema;
        if (!imported.id || !imported.title || !Array.isArray(imported.steps)) {
          alert('Ungültige Schema-Datei.');
          return;
        }
        setSchema(ensureKontaktStepAtEnd(imported));
        setActiveStepIdx(0);
        setActiveFieldIdx(null);
      } catch {
        alert('Datei konnte nicht gelesen werden.');
      }
    };
    reader.readAsText(file);
  }

  // Preview mode
  if (preview) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-3xl mx-auto">
          <button onClick={() => setPreview(false)}
            className="mb-4 text-sm text-primary hover:underline flex items-center gap-1">
            ← Zurück zum Editor
          </button>
          <FormWizard schema={ensureKontaktStepAtEnd(schema)} />
        </div>
      </div>
    );
  }

  const btnGhost = 'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-md transition-colors';

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Lock banner */}
      {lockError && (
        <div className="bg-amber-50 border-b border-amber-300 px-4 py-2 flex items-center gap-2 text-amber-800 text-sm">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m0 0v2m0-2h2m-2 0H10m2-11a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <span>Dieser Dialog wird gerade von einem anderen Nutzer bearbeitet — Speichern ist deaktiviert.</span>
          <button onClick={tryAcquireLock} className="ml-auto text-xs underline hover:no-underline">Erneut versuchen</button>
        </div>
      )}

      {/* Translations editor */}
      {showTranslations && (
        <TranslationsEditor
          schema={schema}
          onSchemaChange={(patch) => updateSchema(patch)}
          onClose={() => setShowTranslations(false)}
        />
      )}

      {/* Versions modal */}
      {showVersions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowVersions(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-800">Versionsverlauf</h2>
              <button onClick={() => setShowVersions(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
            </div>
            <div className="overflow-y-auto max-h-96">
              {versionsLoading
                ? <p className="text-center text-gray-400 text-sm py-8">Lädt …</p>
                : versions.length === 0
                  ? <p className="text-center text-gray-400 text-sm py-8">Noch keine gespeicherten Versionen.</p>
                  : versions.map((v) => (
                    <div key={v.id} className="px-5 py-3 border-b border-gray-100 last:border-0">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <span className="text-sm text-gray-700 font-medium">Version {v.versionNumber}</span>
                          <span className="ml-2 text-xs text-gray-400">
                            {new Date(v.savedAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}
                          </span>
                        </div>
                        <button
                          onClick={() => handleRestore(v.id)}
                          disabled={restoring}
                          className="shrink-0 text-xs px-3 py-1.5 border border-primary text-primary rounded-md hover:bg-primary hover:text-white transition-colors disabled:opacity-40"
                        >
                          {restoring ? '…' : 'Wiederherstellen'}
                        </button>
                      </div>
                      {v.changes.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5">
                          {v.changes.map((c, i) => (
                            <li key={i} className="text-xs text-gray-500 flex gap-1">
                              <span className="text-gray-300 shrink-0">·</span>
                              {c}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))
              }
            </div>
            {restoreError && <p className="px-5 py-3 text-xs text-red-500 border-t border-gray-100">{restoreError}</p>}
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 flex-wrap">
        <Link to="/" className="text-gray-400 hover:text-gray-600 text-sm mr-1">← Übersicht</Link>
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <input
            className="text-base font-semibold text-gray-800 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-primary focus:outline-none w-full max-w-sm"
            value={schema.title}
            onChange={(e) => {
              const title = e.target.value;
              setSchema((current) => {
                const nextId =
                  current.id === slugify(current.title) ? slugify(title) : current.id;
                return { ...current, title, id: nextId };
              });
            }}
          />
          <span className="text-xs text-gray-400 font-mono">/{schema.id}</span>
          {saveError && <span className="text-xs text-red-500">{saveError}</span>}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <label className={btnGhost + ' border-gray-300 text-gray-600 hover:bg-gray-50 cursor-pointer'}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
            </svg>
            Importieren
            <input type="file" accept=".json" className="hidden" onChange={handleImportSchema} />
          </label>
          <button onClick={handleExport} className={btnGhost + ' border-gray-300 text-gray-600 hover:bg-gray-50'}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
            Exportieren
          </button>
          {dialogId && (
            <button onClick={openVersions} className={btnGhost + ' border-gray-300 text-gray-600 hover:bg-gray-50'}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Verlauf
            </button>
          )}
          {dialogId && (
            <button onClick={() => setShowTranslations(true)} className={btnGhost + ' border-gray-300 text-gray-600 hover:bg-gray-50'}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 5h12M9 3v2M5 8c1 3 4 6 8 6M13 8s-1 3-5 8M13 21l4-10 4 10M14 17h6" />
              </svg>
              Sprachen
              {(schema.languages?.length ?? 0) > 0 && (
                <span className="ml-1 text-[10px] bg-primary/10 text-primary rounded-full px-1.5 py-0.5">
                  {schema.languages?.length}
                </span>
              )}
            </button>
          )}
          <button onClick={() => setPreview(true)} className={btnGhost + ' border-gray-300 text-gray-600 hover:bg-gray-50'}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            Vorschau
          </button>
          <button onClick={handleSave} disabled={!!lockError} className={btnGhost + ' border-primary bg-primary text-white hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed'}>
            {saveNote || 'Speichern'}
          </button>
        </div>
      </div>

      {/* 3-column layout */}
      <div className="flex flex-1 overflow-hidden" style={{ height: 'calc(100vh - 57px)' }}>

        {/* LEFT — Steps */}
        <div className="w-56 bg-white border-r border-gray-200 flex flex-col overflow-y-auto shrink-0">
          <div className="px-3 py-3 border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Schritte</span>
          </div>
          <div className="flex-1 py-2">
            {schema.steps.map((step, i) => (
              <div key={step.id}
                className={`group flex items-center gap-1 px-3 py-2 cursor-pointer transition-colors ${i === activeStepIdx ? 'bg-primary/10 text-primary' : 'hover:bg-gray-50 text-gray-700'}`}
                onClick={() => { setActiveStepIdx(i); setActiveFieldIdx(null); }}>
                <span className="flex-1 text-sm truncate">{step.title}</span>
                {step.id === 'kontakt' && (
                  <span className="text-[10px] uppercase tracking-wide text-gray-400 shrink-0">fix</span>
                )}
                <span className="text-xs text-gray-400 shrink-0">{step.fields.length}</span>
                <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                  <button onClick={(e) => { e.stopPropagation(); moveStep(i, -1); }}
                    disabled={i === 0 || step.id === 'kontakt'} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-20">▲</button>
                  <button onClick={(e) => { e.stopPropagation(); moveStep(i, 1); }}
                    disabled={i === schema.steps.length - 1 || step.id === 'kontakt'} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-20">▼</button>
                  <button onClick={(e) => { e.stopPropagation(); removeStep(i); }}
                    disabled={schema.steps.length <= 1 || step.id === 'kontakt'} className="p-0.5 text-gray-400 hover:text-red-500 disabled:opacity-20">✕</button>
                </div>
              </div>
            ))}
          </div>
          <div className="p-3 border-t border-gray-100">
            <button onClick={addStep}
              className="w-full text-xs text-primary border border-primary/30 rounded py-1.5 hover:bg-primary/5 transition-colors">
              + Schritt hinzufügen
            </button>
          </div>
        </div>

        {/* CENTER — Fields */}
        <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
          {activeStep && (
            <>
              <div className="px-4 py-3 bg-white border-b border-gray-200 flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 shrink-0 w-32">
                    Schritt-Titel
                  </label>
                  <input
                    className="flex-1 text-sm font-medium text-gray-800 border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                    value={activeStep.title}
                    onChange={(e) => updateStep(activeStepIdx, { title: e.target.value })}
                    placeholder="Titel des Schritts"
                  />
                  <span className="text-xs text-gray-400 shrink-0">{activeStep.fields.length} Felder</span>
                </div>
                <div className="flex items-start gap-3">
                  <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 shrink-0 w-32 mt-1.5">
                    Beschreibung
                  </label>
                  <textarea
                    className="flex-1 text-sm text-gray-700 border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                    value={activeStep.description ?? ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      updateStep(activeStepIdx, { description: v === '' ? undefined : v });
                    }}
                    rows={2}
                    placeholder="Optionaler Hilfstext, der dem Nutzer unter dem Schritt-Titel angezeigt wird."
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {activeStep.fields.length === 0 && (
                  <div className="text-center text-gray-400 text-sm py-16">
                    Noch keine Felder. Unten ein Feld hinzufügen.
                  </div>
                )}
                {activeStep.fields.map((field, fi) => (
                  <div key={field.id}
                    onClick={() => setActiveFieldIdx(fi === activeFieldIdx ? null : fi)}
                    className={`group flex items-center gap-3 bg-white border rounded-lg px-4 py-3 cursor-pointer transition-all ${fi === activeFieldIdx ? 'border-primary ring-1 ring-primary shadow-sm' : 'border-gray-200 hover:border-gray-300'}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-800 truncate">{field.label}</span>
                        {field.required && <span className="text-red-400 text-xs">*</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-400">
                          {FIELD_TYPE_LABELS[field.type]
                            ?? pluginFieldTypes.find((p) => p.id === field.type)?.label
                            ?? field.type}
                        </span>
                        <span className="text-xs text-gray-300 font-mono">{field.id}</span>
                        {field.condition && <span className="text-xs bg-yellow-50 text-yellow-700 border border-yellow-200 rounded px-1">bedingt</span>}
                      </div>
                    </div>
                    <div className="hidden group-hover:flex items-center gap-1 shrink-0">
                      <button onClick={(e) => { e.stopPropagation(); moveField(fi, -1); }}
                        disabled={fi === 0} className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-20 text-xs">▲</button>
                      <button onClick={(e) => { e.stopPropagation(); moveField(fi, 1); }}
                        disabled={fi === activeStep.fields.length - 1} className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-20 text-xs">▼</button>
                      <button onClick={(e) => { e.stopPropagation(); removeField(fi); }}
                        className="p-1 text-gray-400 hover:text-red-500 text-xs">✕</button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add field toolbar */}
              <div className="bg-white border-t border-gray-200 px-4 py-3 space-y-2">
                <div>
                  <p className="text-xs text-gray-500 mb-2">Feld hinzufügen:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {SIMPLE_TYPES.map((type) => (
                      <button key={type} onClick={() => addField(type)}
                        className="text-xs px-2.5 py-1 border border-gray-300 rounded-full hover:border-primary hover:text-primary transition-colors">
                        + {FIELD_TYPE_LABELS[type]}
                      </button>
                    ))}
                  </div>
                </div>
                {pluginFieldTypes.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 mb-2">Plugin-Felder:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {pluginFieldTypes.map((info) => (
                        <button
                          key={`${info.pluginId}:${info.id}`}
                          onClick={() => addPluginField(info)}
                          title={info.description ? `${info.description} · Plugin: ${info.pluginId}` : `Plugin: ${info.pluginId}`}
                          className="text-xs px-2.5 py-1 border border-emerald-300 text-emerald-700 bg-emerald-50 rounded-full hover:border-emerald-500 hover:bg-emerald-100 transition-colors"
                        >
                          + {info.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* RIGHT — Field config */}
        <div className="w-80 bg-white border-l border-gray-200 flex flex-col overflow-hidden shrink-0">
          <div className="px-4 py-3 border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {activeField ? 'Feld konfigurieren' : 'Konfiguration'}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-5">
              <div className="space-y-3 border-b border-gray-100 pb-4">
                <div className="rounded-lg bg-blue-50 text-blue-700 text-xs px-3 py-2 leading-relaxed">
                  Der `kontaktStep` ist Pflichtbestandteil jedes Dialogs, bleibt immer der letzte Schritt und kann dort angepasst werden.
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Route / Dialog-ID</label>
                  <input
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                    value={schema.id}
                    onChange={(e) => updateSchema({ id: slugify(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Kategorie</label>
                  <input
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    value={schema.category ?? ''}
                    onChange={(e) => updateSchema({ category: e.target.value })}
                    placeholder="z.B. Erbrecht"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Beschreibung</label>
                  <textarea
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    rows={4}
                    value={schema.description ?? ''}
                    onChange={(e) => updateSchema({ description: e.target.value })}
                    placeholder="Kurze Beschreibung für die Übersicht"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Icon (Übersichtsseite)</label>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-9 h-9 rounded-md bg-primary/10 text-primary shrink-0">
                      <DialogIcon name={schema.icon} className="w-5 h-5" />
                    </span>
                    <select
                      className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                      value={schema.icon ?? ''}
                      onChange={(e) => updateSchema({ icon: e.target.value || undefined })}
                    >
                      <option value="">— kein Icon —</option>
                      {DIALOG_ICON_NAMES.map((n) => (
                        <option key={n} value={n}>{DIALOG_ICON_LABELS[n]}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={schema.isActive !== false}
                    onChange={(e) => updateSchema({ isActive: e.target.checked })}
                    className="w-4 h-4 accent-primary"
                  />
                  <span className="text-sm text-gray-700">Dialog ist aktiv</span>
                </label>
                <label className={`flex items-start gap-2 cursor-pointer ${schema.isActive === false ? 'opacity-50' : ''}`}>
                  <input
                    type="checkbox"
                    checked={!!schema.unlisted}
                    disabled={schema.isActive === false}
                    onChange={(e) => updateSchema({ unlisted: e.target.checked || undefined })}
                    className="w-4 h-4 accent-primary mt-0.5"
                  />
                  <span className="text-sm text-gray-700">
                    Versteckt
                    <span className="block text-xs text-gray-500">
                      Nur per Direkt-Link erreichbar — taucht nicht in der öffentlichen Übersicht für Mandanten auf.
                    </span>
                  </span>
                </label>
              </div>

              {activeField ? (
                <FieldConfigPanel
                  field={activeField}
                  stepIdx={activeStepIdx}
                  schema={schema}
                  onChange={(updated) => updateField(activeStepIdx, activeFieldIdx!, updated)}
                />
              ) : (
                <div className="text-center text-gray-400 text-sm py-6">
                  <svg className="w-10 h-10 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  Ein Feld anklicken um es zu konfigurieren.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
