import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme';
import {
  getBranding, putBranding, type BrandingSettings,
  getKontaktStep, putKontaktStep,
  getPersonTemplates, putPersonTemplates,
  getDispatchConfig, putDispatchConfig, type DispatchConfig,
  getEmailConfig, putEmailConfig, type EmailConfig,
  getDinoConfig, putDinoConfig, type DinoConfig,
} from '../lib/settingsApi';
import { clearBrandingCache, applyBrandingTheme } from '../hooks/useBranding';
import { clearPersonTemplatesCache } from '../hooks/usePersonTemplates';
import { FieldListEditor } from './FormEditor/shared';
import type { FormStep, FormField } from '../types/schema';
import { getCachedRuntimeMode } from '../lib/runtimeMode';

type Tab = 'branding' | 'kontakt' | 'personen' | 'versand' | 'email' | 'dino';

export function AdminSettings() {
  useTheme();
  const [tab, setTab] = useState<Tab>('branding');
  const isDemo = getCachedRuntimeMode()?.demoMode === true;

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-slate-900 text-white px-4 py-5">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Admin</p>
            <h1 className="text-2xl font-semibold">Globale Einstellungen</h1>
          </div>
          <Link to="/admin" className="px-3 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 transition-colors text-sm">
            ← Zurück zur Übersicht
          </Link>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {isDemo && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
            Im Demo-Modus werden Änderungen nur für die aktuelle Sitzung gespeichert
            und nicht dauerhaft übernommen. E-Mails und Dokumente werden niemals versendet.
          </div>
        )}

        <div className="flex flex-wrap gap-2 mb-6">
          {([
            ['branding', 'Branding'],
            ['kontakt', 'Kontakt & Termin'],
            ['personen', 'Personen-Vorlagen'],
            ['versand', 'Versand'],
            ['email', 'E-Mail'],
            ['dino', 'DiNo'],
          ] as [Tab, string][]).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                tab === t ? 'bg-primary text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-primary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'branding' && <BrandingTab />}
        {tab === 'kontakt' && <KontaktTab />}
        {tab === 'personen' && <PersonenTab />}
        {tab === 'versand' && <VersandTab />}
        {tab === 'email' && <EmailTab />}
        {tab === 'dino' && <DinoTab />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Branding
// ---------------------------------------------------------------------------

function BrandingTab() {
  const disabled = false;
  const [data, setData] = useState<BrandingSettings | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getBranding().then(setData).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <p className="text-red-500 text-sm">{error}</p>;
  if (!data) return <p className="text-gray-400 text-sm">Wird geladen …</p>;

  function update<K extends keyof BrandingSettings>(key: K, value: BrandingSettings[K]) {
    setData((d) => (d ? { ...d, [key]: value } : d));
  }
  function updateColor(key: 'primary' | 'primaryDark' | 'accent', value: string) {
    setData((d) => (d ? { ...d, colors: { ...(d.colors ?? {}), [key]: value } } : d));
  }

  async function save() {
    if (!data) return;
    setStatus(null);
    setError(null);
    try {
      await putBranding(data);
      clearBrandingCache();
      applyBrandingTheme(data);
      setStatus('Gespeichert.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.');
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 flex flex-col gap-4">
      <Field label="Notar-Name" value={data.notarName ?? ''} onChange={(v) => update('notarName', v)} placeholder="Notare Mustermann & Musterfrau" disabled={disabled} />
      <Field label="Browser-Tab Vorlage" value={data.titleTemplate ?? '{title}'} onChange={(v) => update('titleTemplate', v)} placeholder="{title} – Notare Mustermann" hint="Platzhalter: {title}, {notarName}" disabled={disabled} />
      <Field label="Primärfarbe (Hex, mit oder ohne #)" value={data.colors?.primary ?? ''} onChange={(v) => updateColor('primary', v)} placeholder="1a3a5c" disabled={disabled} />
      <Field label="Primärfarbe dunkel" value={data.colors?.primaryDark ?? ''} onChange={(v) => updateColor('primaryDark', v)} placeholder="0f2540" disabled={disabled} />
      <Field label="Akzentfarbe" value={data.colors?.accent ?? ''} onChange={(v) => updateColor('accent', v)} placeholder="c8a96e" disabled={disabled} />
      <Field label="Favicon-URL" value={data.faviconUrl ?? ''} onChange={(v) => update('faviconUrl', v)} placeholder="https://… oder data:image/png;base64,…" disabled={disabled} />
      <Field label="Logo-URL" value={data.logoUrl ?? ''} onChange={(v) => update('logoUrl', v)} placeholder="https://…" disabled={disabled} />
      <Field label="PDF-Primärfarbe (Hex ohne #)" value={data.primaryColor ?? ''} onChange={(v) => update('primaryColor', v)} placeholder="1a3a5c" disabled={disabled} />

      <div className="border-t border-gray-100 pt-4 mt-2">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Übersichtsseite</h3>
        <div className="flex flex-col gap-4">
          <Field
            label="Überschrift"
            value={data.homeTitle ?? ''}
            onChange={(v) => update('homeTitle', v)}
            placeholder="OpenFormulare"
            hint="Erscheint als große Überschrift im Kopf der öffentlichen Übersicht. Leer = Standardwert."
            disabled={disabled}
          />
          <Field
            label="Untertitel"
            value={data.homeSubtitle ?? ''}
            onChange={(v) => update('homeSubtitle', v)}
            placeholder="Wählen Sie den passenden Dialog aus, um Ihre notarielle Angelegenheit vorzubereiten."
            hint="Erscheint unter der Überschrift. Leer = Standardtext."
            disabled={disabled}
          />
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              checked={data.hideAdminButton ?? false}
              onChange={(e) => update('hideAdminButton', e.target.checked)}
              disabled={disabled}
            />
            <span className="flex flex-col">
              <span className="text-sm font-medium text-gray-700">Admin-Button auf der Übersicht ausblenden</span>
              <span className="text-xs text-gray-500">
                Wenn aktiv, wird der Link zum Admin-Login auf der öffentlichen Übersichtsseite nicht angezeigt.
                Der Admin-Bereich ist weiterhin unter <code className="bg-gray-100 px-1 rounded">/admin/login</code> erreichbar.
              </span>
            </span>
          </label>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={() => void save()}
          disabled={disabled}
          className="px-4 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary-dark rounded-md disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Speichern
        </button>
        {status && <span className="text-xs text-emerald-600">{status}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Kontakt & Termin – uses the same field editor as a normal dialog step.
// ---------------------------------------------------------------------------

function KontaktTab() {
  const disabled = false;
  const [step, setStep] = useState<FormStep | null>(null);
  const [stepTitle, setStepTitle] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getKontaktStep().then((s) => {
      setStep(s);
      setStepTitle(s.title);
    }).catch((e: Error) => setError(e.message));
  }, []);

  async function save() {
    if (!step) return;
    setStatus(null); setError(null);
    try {
      const saved = await putKontaktStep({ ...step, title: stepTitle, id: 'kontakt' });
      setStep(saved);
      setStatus('Gespeichert. Änderungen wirken sofort in allen Dialogen.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.');
    }
  }

  if (error && !step) return <p className="text-red-500 text-sm">{error}</p>;
  if (!step) return <p className="text-gray-400 text-sm">Wird geladen …</p>;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 flex flex-col gap-4">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Schritt-Titel</label>
        <input
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:bg-gray-50"
          value={stepTitle}
          onChange={(e) => setStepTitle(e.target.value)}
          disabled={disabled}
        />
        <p className="text-xs text-gray-500 mt-1">
          Diese Felder erscheinen als letzter Schritt jedes Dialogs. Änderungen wirken sofort in allen Dialogen.
        </p>
      </div>

      <FieldListEditor
        fields={step.fields}
        onChange={(fields) => setStep({ ...step, fields })}
        fauxStepId="kontakt"
        disabled={disabled}
      />

      <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
        <button
          onClick={() => void save()}
          disabled={disabled}
          className="px-4 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary-dark rounded-md disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Speichern
        </button>
        {status && <span className="text-xs text-emerald-600">{status}</span>}
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Personen-Vorlagen – same editor as a step, but split into two tabs
// (natural / legal) instead of using the dialog step navigation.
// ---------------------------------------------------------------------------

function PersonenTab() {
  const disabled = false;
  type Sub = 'natural' | 'legal';
  const [sub, setSub] = useState<Sub>('natural');
  const [natural, setNatural] = useState<FormField[] | null>(null);
  const [legal, setLegal] = useState<FormField[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPersonTemplates().then((t) => {
      setNatural(t.natural);
      setLegal(t.legal);
    }).catch((e: Error) => setError(e.message));
  }, []);

  async function save() {
    if (!natural || !legal) return;
    setStatus(null); setError(null);
    try {
      await putPersonTemplates({ natural, legal });
      clearPersonTemplatesCache();
      setStatus('Gespeichert. Repeater mit Personen-Vorlage wirken sofort.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.');
    }
  }

  if (error && (!natural || !legal)) return <p className="text-red-500 text-sm">{error}</p>;
  if (!natural || !legal) return <p className="text-gray-400 text-sm">Wird geladen …</p>;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 flex flex-col gap-4">
      <p className="text-sm text-gray-600">
        Globale Personen-Vorlagen. Repeater verweisen mit
        <code className="mx-1 text-xs bg-gray-100 px-1 py-0.5 rounded">personTemplate: 'natural' | 'legal' | 'both'</code>
        auf diese Felder, statt eigene zu definieren. Änderungen wirken sofort in allen entsprechenden Repeatern.
      </p>

      {/* Sub-tabs replace the step sidebar */}
      <div className="flex gap-2">
        {(['natural', 'legal'] as Sub[]).map((s) => (
          <button
            key={s}
            onClick={() => setSub(s)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              sub === s ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {s === 'natural' ? 'Natürliche Person' : 'Juristische Person'}
            <span className="ml-1.5 text-[10px] opacity-70">
              {(s === 'natural' ? natural : legal).length}
            </span>
          </button>
        ))}
      </div>

      {sub === 'natural' ? (
        <FieldListEditor
          key="natural"
          fields={natural}
          onChange={setNatural}
          fauxStepId="natural-person"
          disabled={disabled}
          excludedTypes={['person', 'natural-person', 'legal-person']}
        />
      ) : (
        <FieldListEditor
          key="legal"
          fields={legal}
          onChange={setLegal}
          fauxStepId="legal-person"
          disabled={disabled}
          excludedTypes={['person', 'natural-person', 'legal-person']}
        />
      )}

      <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
        <button
          onClick={() => void save()}
          disabled={disabled}
          className="px-4 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary-dark rounded-md disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Speichern
        </button>
        {status && <span className="text-xs text-emerald-600">{status}</span>}
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Versand – which transports run on submission, which docs are attached
// ---------------------------------------------------------------------------

function VersandTab() {
  const [data, setData] = useState<DispatchConfig | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDispatchConfig().then(setData).catch((e: Error) => setError(e.message));
  }, []);

  if (error && !data) return <p className="text-red-500 text-sm">{error}</p>;
  if (!data) return <p className="text-gray-400 text-sm">Wird geladen …</p>;

  function update<K extends keyof DispatchConfig>(key: K, value: DispatchConfig[K]) {
    setData((d) => (d ? { ...d, [key]: value } : d));
  }
  function updateAttachment(key: keyof DispatchConfig['attachments'], value: boolean) {
    setData((d) => (d ? { ...d, attachments: { ...d.attachments, [key]: value } } : d));
  }

  async function save() {
    if (!data) return;
    setStatus(null); setError(null);
    try {
      const saved = await putDispatchConfig(data);
      setData(saved);
      setStatus('Gespeichert.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.');
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 flex flex-col gap-6">
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Übermittlungswege</h2>
        <div className="flex flex-col gap-2">
          <Toggle
            label="E-Mail-Versand aktiv"
            hint="Eingereichte Anfragen werden per SMTP an die Notar-E-Mail geschickt."
            checked={data.emailEnabled}
            onChange={(v) => update('emailEnabled', v)}
          />
          <Toggle
            label="DiNo-Anbindung aktiv"
            hint="Eingereichte Anfragen werden für den DiNo-Pull-Endpoint vorgehalten."
            checked={data.dinoEnabled}
            onChange={(v) => update('dinoEnabled', v)}
          />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-1">Anhänge an die Notar-E-Mail</h2>
        <p className="text-xs text-gray-500 mb-3">
          Welche generierten Dokumente werden an das Notarbüro übermittelt?
          Vom Mandanten hochgeladene Dateien sind immer enthalten.
        </p>
        <div className="flex flex-col gap-2">
          <Toggle label="PDF (Formularausgabe)" checked={data.attachments.pdf} onChange={(v) => updateAttachment('pdf', v)} />
          <Toggle label="DOCX (bearbeitbar)" checked={data.attachments.docx} onChange={(v) => updateAttachment('docx', v)} />
          <Toggle label="JSON (Rohdaten)" checked={data.attachments.json} onChange={(v) => updateAttachment('json', v)} />
          <Toggle label="DiNo-JSON (DiNo-Mapping)" checked={data.attachments.dinoJson} onChange={(v) => updateAttachment('dinoJson', v)} />
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
        <button
          onClick={() => void save()}
          className="px-4 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary-dark rounded-md"
        >
          Speichern
        </button>
        {status && <span className="text-xs text-emerald-600">{status}</span>}
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// E-Mail – SMTP, Absender, HTML-Signatur, Mandanten-Vorlage
// ---------------------------------------------------------------------------

function EmailTab() {
  const [data, setData] = useState<EmailConfig | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getEmailConfig().then(setData).catch((e: Error) => setError(e.message));
  }, []);

  if (error && !data) return <p className="text-red-500 text-sm">{error}</p>;
  if (!data) return <p className="text-gray-400 text-sm">Wird geladen …</p>;

  function update<K extends keyof EmailConfig>(key: K, value: EmailConfig[K]) {
    setData((d) => (d ? { ...d, [key]: value } : d));
  }

  async function save() {
    if (!data) return;
    setStatus(null); setError(null);
    try {
      const saved = await putEmailConfig(data);
      setData(saved);
      setStatus('Gespeichert.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.');
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 flex flex-col gap-6">
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">SMTP-Server</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="SMTP-Host" value={data.smtpHost} onChange={(v) => update('smtpHost', v)} placeholder="mail.example.de" />
          <NumberField label="SMTP-Port" value={data.smtpPort} onChange={(v) => update('smtpPort', v)} placeholder="587" />
          <Field label="SMTP-Benutzer" value={data.smtpUser} onChange={(v) => update('smtpUser', v)} placeholder="noreply@example.de" />
          <Field label="SMTP-Passwort" value={data.smtpPass} onChange={(v) => update('smtpPass', v)} placeholder="(unverändert lassen, um nicht zu ersetzen)" />
        </div>
        <div className="mt-3">
          <Toggle
            label="SMTP-Debug aktiv"
            hint="Wenn aktiv, werden statt einer echten E-Mail nur lokale Debug-Dumps geschrieben."
            checked={data.smtpDebug}
            onChange={(v) => update('smtpDebug', v)}
          />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Absender & Empfänger</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Absender-Name" value={data.fromName} onChange={(v) => update('fromName', v)} placeholder="Notare Mustermann & Musterfrau" />
          <Field label="Absender-E-Mail (From)" value={data.fromEmail} onChange={(v) => update('fromEmail', v)} placeholder="noreply@example.de" />
          <Field label="Notar-E-Mail (Empfänger)" value={data.notarEmail} onChange={(v) => update('notarEmail', v)} placeholder="kanzlei@example.de" />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-1">HTML-Signatur</h2>
        <p className="text-xs text-gray-500 mb-2">
          Wird automatisch unter jede versendete E-Mail (Notar &amp; Mandant) gehängt.
        </p>
        <textarea
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
          rows={6}
          value={data.htmlSignature}
          placeholder="<p><strong>Notare Mustermann</strong><br/>Musterstr. 1, 12345 Musterstadt<br/>Tel. 0123 / 456789</p>"
          onChange={(e) => update('htmlSignature', e.target.value)}
        />
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-1">Bestätigungs-E-Mail an Mandanten</h2>
        <p className="text-xs text-gray-500 mb-2">
          Platzhalter:
          <code className="mx-1 bg-gray-100 px-1 py-0.5 rounded">{`{title}`}</code>
          <code className="mx-1 bg-gray-100 px-1 py-0.5 rounded">{`{submittedBy}`}</code>
          <code className="mx-1 bg-gray-100 px-1 py-0.5 rounded">{`{submittedAt}`}</code>
          <code className="mx-1 bg-gray-100 px-1 py-0.5 rounded">{`{notarName}`}</code>
          <code className="mx-1 bg-gray-100 px-1 py-0.5 rounded">{`{email}`}</code>
          <code className="mx-1 bg-gray-100 px-1 py-0.5 rounded">{`{phone}`}</code>
        </p>
        <Field label="Betreff-Vorlage" value={data.clientSubjectTemplate} onChange={(v) => update('clientSubjectTemplate', v)} placeholder="Ihre Anfrage ist eingegangen: {title}" />
        <div className="mt-3">
          <label className="text-sm font-medium text-gray-700">HTML-Vorlage</label>
          <textarea
            className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
            rows={12}
            value={data.clientBodyTemplate}
            onChange={(e) => update('clientBodyTemplate', e.target.value)}
          />
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
        <button
          onClick={() => void save()}
          className="px-4 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary-dark rounded-md"
        >
          Speichern
        </button>
        {status && <span className="text-xs text-emerald-600">{status}</span>}
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DiNo – API-Key + TTL
// ---------------------------------------------------------------------------

function DinoTab() {
  const [data, setData] = useState<DinoConfig | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDinoConfig().then(setData).catch((e: Error) => setError(e.message));
  }, []);

  if (error && !data) return <p className="text-red-500 text-sm">{error}</p>;
  if (!data) return <p className="text-gray-400 text-sm">Wird geladen …</p>;

  function update<K extends keyof DinoConfig>(key: K, value: DinoConfig[K]) {
    setData((d) => (d ? { ...d, [key]: value } : d));
  }

  async function save() {
    if (!data) return;
    setStatus(null); setError(null);
    try {
      const saved = await putDinoConfig(data);
      setData(saved);
      setStatus('Gespeichert.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.');
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 flex flex-col gap-4">
      <p className="text-sm text-gray-600">
        Konfiguration für den DiNo-Pull-Endpoint. Aktiviert wird DiNo im Tab <em>Versand</em>.
      </p>
      <Field
        label="API-Key"
        value={data.apiKey}
        onChange={(v) => update('apiKey', v)}
        placeholder="(leer lassen, um nicht zu ändern)"
        hint="DiNo authentifiziert Pull-Aufrufe mit diesem Schlüssel im Header X-Api-Key."
      />
      <NumberField
        label="TTL in Stunden"
        value={data.ttlHours}
        onChange={(v) => update('ttlHours', v)}
        placeholder="72"
        hint="Nach dieser Zeit werden ungelesene Einreichungen serverseitig verworfen."
      />
      <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
        <button
          onClick={() => void save()}
          className="px-4 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary-dark rounded-md"
        >
          Speichern
        </button>
        {status && <span className="text-xs text-emerald-600">{status}</span>}
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Field helper
// ---------------------------------------------------------------------------

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  disabled?: boolean;
}

function Field({ label, value, onChange, placeholder, hint, disabled }: FieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-50"
      />
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  placeholder?: string;
  hint?: string;
}

function NumberField({ label, value, onChange, placeholder, hint }: NumberFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        placeholder={placeholder}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          onChange(Number.isFinite(n) ? n : 0);
        }}
        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
      />
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

interface ToggleProps {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}

function Toggle({ label, hint, checked, onChange }: ToggleProps) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="flex flex-col">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        {hint && <span className="text-xs text-gray-500">{hint}</span>}
      </span>
    </label>
  );
}
