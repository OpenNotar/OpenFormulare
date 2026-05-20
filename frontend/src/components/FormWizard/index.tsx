import { useState, useRef, useEffect } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import type { FormSchema, FormField } from '../../types/schema';
import { FieldRenderer } from '../FieldRenderer';
import { StepIndicator } from './StepIndicator';
import { Navigation } from './Navigation';
import { SubmitOverlay } from './SubmitOverlay';
import { getDemoHeaders } from '../../lib/runtimeMode';
import { useBranding } from '../../hooks/useBranding';
import { useI18n } from '../../i18n/context';
import { LanguageSwitcher } from '../LanguageSwitcher';
import type { LanguageCode } from '../../i18n';
import {
  decryptSnapshot,
  encryptSnapshot,
  isLegacySaveFile,
  type EncryptedSaveFile,
} from '../../lib/secureSave';

interface SerializedFile {
  __isFile: true;
  name: string;
  type: string;
  data: string; // base64
}

async function serializeData(data: Record<string, unknown>): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (Array.isArray(v) && v.length > 0 && v[0] instanceof File) {
      result[k] = await Promise.all((v as File[]).map(async (f) => {
        const buf = await f.arrayBuffer();
        let binary = '';
        new Uint8Array(buf).forEach((b) => { binary += String.fromCharCode(b); });
        return { __isFile: true, name: f.name, type: f.type, data: btoa(binary) } as SerializedFile;
      }));
    } else if (Array.isArray(v)) {
      result[k] = await Promise.all(v.map((item) =>
        item && typeof item === 'object' && !(item instanceof File)
          ? serializeData(item as Record<string, unknown>)
          : item,
      ));
    } else if (v instanceof File) {
      const buf = await v.arrayBuffer();
      let binary = '';
      new Uint8Array(buf).forEach((b) => { binary += String.fromCharCode(b); });
      result[k] = { __isFile: true, name: v.name, type: v.type, data: btoa(binary) } as SerializedFile;
    } else if (v && typeof v === 'object') {
      result[k] = await serializeData(v as Record<string, unknown>);
    } else {
      result[k] = v;
    }
  }
  return result;
}

function deserializeData(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (Array.isArray(v)) {
      result[k] = v.map((item) => {
        if (item && typeof item === 'object' && (item as SerializedFile).__isFile) {
          const sf = item as SerializedFile;
          const binary = atob(sf.data);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          return new File([bytes], sf.name, { type: sf.type });
        }
        if (item && typeof item === 'object') return deserializeData(item as Record<string, unknown>);
        return item;
      });
    } else if (v && typeof v === 'object' && (v as SerializedFile).__isFile) {
      const sf = v as SerializedFile;
      const binary = atob(sf.data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      result[k] = new File([bytes], sf.name, { type: sf.type });
    } else if (v && typeof v === 'object') {
      result[k] = deserializeData(v as Record<string, unknown>);
    } else {
      result[k] = v;
    }
  }
  return result;
}

interface Props {
  schema: FormSchema;
  language?: LanguageCode;
  onLanguageChange?: (code: LanguageCode) => void;
}

function collectFieldNames(fields: FormField[], prefix?: string): string[] {
  const names: string[] = [];
  for (const field of fields) {
    const name = prefix ? `${prefix}.${field.id}` : field.id;
    if (field.type === 'repeater') {
      // Validate up to 4 items; React Hook Form will ignore non-existent indexes.
      // Inner fields may come from a person template at runtime – we don't
      // know which fields the template adds without evaluating the form
      // state, so we fall back to validating the inline `fields` and
      // `extraFields` known statically.
      const innerKnown = [...(field.fields ?? []), ...(field.extraFields ?? [])];
      for (let i = 0; i < 4; i++) {
        names.push(...collectFieldNames(innerKnown, `${name}.${i}`));
      }
    } else {
      names.push(name);
    }
  }
  return names;
}

function stripFiles(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (Array.isArray(v)) {
      if (v.length > 0 && v[0] instanceof File) continue;
      result[k] = v.map((item) =>
        item && typeof item === 'object' && !(item instanceof File)
          ? stripFiles(item as Record<string, unknown>)
          : item,
      );
    } else if (v instanceof File) {
      continue;
    } else if (v && typeof v === 'object') {
      result[k] = stripFiles(v as Record<string, unknown>);
    } else {
      result[k] = v;
    }
  }
  return result;
}

function collectFiles(data: Record<string, unknown>): File[] {
  const files: File[] = [];
  for (const v of Object.values(data)) {
    if (Array.isArray(v)) {
      if (v.length > 0 && v[0] instanceof File) {
        files.push(...(v as File[]));
      } else {
        for (const item of v) {
          if (item && typeof item === 'object' && !(item instanceof File)) {
            files.push(...collectFiles(item as Record<string, unknown>));
          }
        }
      }
    } else if (v && typeof v === 'object' && !(v instanceof File)) {
      files.push(...collectFiles(v as Record<string, unknown>));
    }
  }
  return files;
}

export function FormWizard({ schema, language, onLanguageChange }: Props) {
  const { t } = useI18n();
  const [currentStep, setCurrentStep] = useState(0);
  // Highest step ever reached in the current session – defines how far the
  // step indicator allows direct navigation by click.
  const [furthestStep, setFurthestStep] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  // Local submit state. We don't reuse `formState.isSubmitting` because that
  // only flips when react-hook-form's own `handleSubmit` is invoked, and our
  // submit goes through a custom path with FormData + file uploads.
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const methods = useForm({ mode: 'onTouched' });
  const { trigger, getValues, reset, formState } = methods;
  const branding = useBranding();

  // Browser tab title: applies admin's titleTemplate (placeholder {title}).
  // Notar name from branding settings, fallback to ?notarName=… query param.
  useEffect(() => {
    const previousTitle = document.title;
    const params = new URLSearchParams(window.location.search);
    const queryNotar = params.get('notarName')?.trim();
    const notarName = (branding?.notarName || queryNotar || '').trim();
    const template = branding?.titleTemplate || '{title}';
    let title = template
      .replace(/\{title\}/g, schema.title)
      .replace(/\{notarName\}/g, notarName);
    if (!notarName && queryNotar) title = `${schema.title} – ${queryNotar}`;
    document.title = title || schema.title;
    return () => { document.title = previousTitle; };
  }, [schema.title, branding?.notarName, branding?.titleTemplate]);

  // Item 6: intercept the browser back button. We push a guard entry to
  // history; if the user navigates back, we ask for confirmation. If they
  // confirm, we step back twice (once for the popstate that already moved
  // us, once for the actual previous page).
  const isDirty = formState.isDirty && !submitted;
  useEffect(() => {
    if (submitted) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    let restoring = false;
    window.history.pushState({ formGuard: true }, '');
    const handlePopState = () => {
      if (restoring) {
        restoring = false;
        return;
      }
      if (!isDirty) {
        // No data to lose: actually leave. The popstate already moved us
        // back, so just allow it through by re-pushing a guard. This way the
        // user can navigate normally if they reload or come back later.
        return;
      }
      const ok = window.confirm(t('confirmLeave'));
      if (ok) {
        // The browser already moved us back one entry by firing popstate.
        // Push our guard back so the user can stay on the form, then step
        // back manually – this leaves the form for real.
        restoring = true;
        window.history.go(-1);
      } else {
        // Re-push the guard so a subsequent back triggers the prompt again.
        restoring = true;
        window.history.pushState({ formGuard: true }, '');
        // The synthetic state push doesn't fire popstate, so reset the flag
        // immediately for the next interaction.
        setTimeout(() => { restoring = false; }, 0);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isDirty, submitted]);

  async function handleSave() {
    const password = window.prompt(t('promptSavePassword'));
    if (password === null) return; // cancelled
    if (password.length < 4) {
      window.alert(t('passwordTooShort'));
      return;
    }

    const serialized = await serializeData(getValues());
    const encrypted = await encryptSnapshot(
      { data: serialized },
      password,
      schema.id,
      currentStep,
    );
    const blob = new Blob([JSON.stringify(encrypted, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
    a.href = url;
    a.download = `${schema.id}_${ts}.notar.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleLoadClick() {
    setLoadError(null);
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string) as unknown;

        // Encrypted v2 file?
        if ((parsed as EncryptedSaveFile)?.app === 'openformulare') {
          const file2 = parsed as EncryptedSaveFile;
          if (file2.formType !== schema.id) {
            setLoadError(`Falsche Formulardatei: erwartet „${schema.id}", erhalten „${file2.formType}".`);
            return;
          }
          const password = window.prompt(t('promptLoadPassword'));
          if (password === null) return;
          let payload: { data: Record<string, unknown> };
          try {
            payload = await decryptSnapshot(file2, password) as { data: Record<string, unknown> };
          } catch (err) {
            setLoadError(err instanceof Error ? err.message : 'Datei konnte nicht entschlüsselt werden.');
            return;
          }
          reset(deserializeData(payload.data));
          const restored = Math.min(file2.step ?? 0, schema.steps.length - 1);
          setCurrentStep(restored);
          setFurthestStep((f) => Math.max(f, restored));
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }

        // Legacy v1 plain JSON.
        if (isLegacySaveFile(parsed)) {
          if (parsed.formType !== schema.id) {
            setLoadError(`Falsche Formulardatei: erwartet „${schema.id}", erhalten „${parsed.formType}".`);
            return;
          }
          reset(deserializeData(parsed.data));
          const restored = Math.min(parsed.step ?? 0, schema.steps.length - 1);
          setCurrentStep(restored);
          setFurthestStep((f) => Math.max(f, restored));
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }

        setLoadError(t('fileReadError'));
      } catch {
        setLoadError(t('fileReadError'));
      }
    };
    reader.readAsText(file);
  }

  const step = schema.steps[currentStep];

  async function handleNext() {
    const names = collectFieldNames(step.fields);
    const valid = await trigger(names);
    if (!valid) return;

    if (currentStep < schema.steps.length - 1) {
      const next = currentStep + 1;
      setCurrentStep(next);
      setFurthestStep((f) => Math.max(f, next));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      await handleSubmit();
    }
  }

  function handleBack() {
    setCurrentStep((s) => Math.max(0, s - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleJumpToStart() {
    setCurrentStep(0);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Click on a circle in the step indicator. Forward navigation only allowed
  // up to the furthest step the user has already reached (validation passed).
  function handleNavigate(target: number) {
    if (target === currentStep) return;
    if (target > furthestStep) return;
    setCurrentStep(target);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSubmit() {
    setSubmitError(null);
    setSubmitting(true);
    const allData = getValues();

    const formData = new FormData();
    formData.append('formType', schema.id);
    formData.append('data', JSON.stringify(stripFiles(allData)));
    formData.append('schema', JSON.stringify(schema));

    const files = collectFiles(allData);
    files.forEach((file) => formData.append('files', file));

    try {
      const apiUrl = import.meta.env.VITE_API_URL ?? '';
      const res = await fetch(`${apiUrl}/api/submit`, {
        method: 'POST',
        body: formData,
        headers: getDemoHeaders(),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      setSubmitted(true);
      // submitting bleibt true bis unmount auf der "Vielen Dank"-Seite – das
      // Overlay wird durch die submitted-Branch ohnehin nicht mehr gezeigt.
    } catch {
      setSubmitError(t('submitError'));
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="hyphens-de bg-white rounded-xl shadow-sm border border-gray-200 p-10 text-center">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center text-3xl mx-auto mb-4">
          ✓
        </div>
        <h2 className="text-xl font-semibold text-gray-800 mb-2">{t('thankYou')}</h2>
        <p className="text-gray-500 text-sm max-w-sm mx-auto">
          {t('thankYouMessage')}
        </p>
      </div>
    );
  }

  return (
    <FormProvider {...methods}>
      <SubmitOverlay
        visible={submitting || !!submitError}
        error={submitError}
        onRetry={() => {
          setSubmitError(null);
          void handleSubmit();
        }}
        onDismiss={() => {
          setSubmitError(null);
          setSubmitting(false);
        }}
      />
      <div className="hyphens-de bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="bg-primary px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-white text-lg font-semibold">{schema.title}</h1>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {language && onLanguageChange && (schema.languages?.length ?? 0) > 0 && (
              <div className="rounded-md bg-white/10 border border-white/20 px-2 py-1">
                <LanguageSwitcher
                  available={['de', ...((schema.languages ?? []) as LanguageCode[])]}
                  active={language}
                  onChange={onLanguageChange}
                  className="text-white"
                />
              </div>
            )}
            <button
              type="button"
              onClick={handleLoadClick}
              title={t('loadTitle')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white/80 border border-white/30 rounded-md hover:bg-white/10 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
              </svg>
              {t('load')}
            </button>
            <button
              type="button"
              onClick={handleSave}
              title={t('saveTitle')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white/80 border border-white/30 rounded-md hover:bg-white/10 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
              {t('save')}
            </button>
          </div>
        </div>

        <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleFileChange} />

        {loadError && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600 flex justify-between items-start gap-2">
            <span>{loadError}</span>
            <button type="button" onClick={() => setLoadError(null)} className="text-red-400 hover:text-red-600 shrink-0">✕</button>
          </div>
        )}

        <div className="px-6 pt-6">
          <StepIndicator
            steps={schema.steps}
            currentStep={currentStep}
            furthestStep={furthestStep}
            onNavigate={handleNavigate}
          />
        </div>

        <div className="px-6 pb-2">
          <h2 className="text-base font-semibold text-gray-800 mb-1">{step.title}</h2>
          {step.description && (
            <p className="text-sm text-gray-600 mb-5 whitespace-pre-line">{step.description}</p>
          )}
          {!step.description && <div className="mb-5" />}
          <div className="space-y-5">
            {step.fields.map((field) => (
              <FieldRenderer key={field.id} field={field} />
            ))}
          </div>

          {/* submitError wird vom SubmitOverlay angezeigt, kein Inline-Block. */}
        </div>

        <div className="px-6 pb-6">
          <Navigation
            currentStep={currentStep}
            totalSteps={schema.steps.length}
            isSubmitting={submitting}
            onBack={handleBack}
            onNext={handleNext}
            onJumpToStart={handleJumpToStart}
          />
        </div>
      </div>
    </FormProvider>
  );
}
