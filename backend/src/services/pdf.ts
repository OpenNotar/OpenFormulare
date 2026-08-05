import puppeteer from 'puppeteer';
import { registry as pluginRegistry } from '../plugins/registry';
import { getActivePersonTemplates, resolveRepeaterInnerFields, resolvePersonFieldInnerFields } from '../db/sharedSteps';
import type { FormField } from '../db/types/schema';

// Minimal schema types (mirrors frontend types/schema.ts)
interface SchemaField {
  id: string;
  label: string;
  type: string;
  fields?: SchemaField[];     // repeater sub-fields (legacy)
  countField?: string;        // repeater count reference
  // Modern repeater: references the global person template + per-dialog
  // required overrides + extra dialog-specific fields. Resolved per item
  // via resolveRepeaterInnerFields().
  personTemplate?: 'natural' | 'legal' | 'both';
  extraFields?: SchemaField[];
  fieldOverrides?: Record<string, { required?: boolean }>;
  condition?: { fieldId: string; operator: string; value: unknown };
  options?: unknown;
  // Rating-spezifisch
  maxStars?: number;
  min?: number;
  max?: number;
  yesLabel?: string;
  noLabel?: string;
}
interface SchemaStep { id: string; title: string; fields: SchemaField[]; }
interface FormSchema { id: string; title: string; steps: SchemaStep[]; }

interface PdfOptions {
  formType: string;
  data: Record<string, unknown>;
  primaryColor: string;
  formSchema?: FormSchema;
  // Wenn aktiv, wird im PDF-Header ein Hinweis eingeblendet, dass der
  // Vorgang importbereit in der DiNo-Instanz steht.
  dinoEnabled?: boolean;
}

const FORM_TITLES: Record<string, string> = {
  unterschriftsbeglaubigung: 'Unterschriftsbeglaubigung',
  unternehmensgruendung: 'Unternehmensgründung',
  immobilienkauf: 'Immobilienkauf',
  schenkung: 'Schenkung',
  erbausschlagung: 'Erbausschlagung',
  vorsorgevollmacht: 'General- & Vorsorgevollmacht',
  testament: 'Testament / Erbvertrag',
  erbschein: 'Erbschein',
  erbauseinandersetzung: 'Erbauseinandersetzung',
  anteilskauf: 'Anteilskauf (GmbH)',
  handelsregister: 'Handelsregister',
  gbr: 'GbR (Gesellschaft bürgerlichen Rechts)',
  verein: 'Verein',
  ehevertrag: 'Ehevertrag',
  scheidungsvereinbarung: 'Scheidungsfolgenvereinbarung',
  adoption: 'Adoption',
};

export async function generatePdf({ formType, data, primaryColor, formSchema, dinoEnabled }: PdfOptions): Promise<Buffer> {
  const title = formSchema?.title ?? FORM_TITLES[formType] ?? formType;
  const html = formSchema
    ? buildHtmlFromSchema(formSchema, data, primaryColor, title, dinoEnabled)
    : buildHtmlFallback(title, data, primaryColor, dinoEnabled);

  const browser = await puppeteer.launch({
    headless: true,
    // In Container-Builds nutzen wir das System-Chromium (siehe Dockerfile),
    // außerhalb fällt Puppeteer auf seinen mitgelieferten Browser zurück.
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      margin: { top: '2cm', right: '2cm', bottom: '2.5cm', left: '2cm' },
      printBackground: true,
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------------------
// Schema-based renderer — uses field labels and step structure
// ---------------------------------------------------------------------------

function buildHtmlFromSchema(schema: FormSchema, data: Record<string, unknown>, primaryColor: string, title: string, dinoEnabled?: boolean): string {
  const now = timestamp();
  const body = schema.steps.map((step) => renderStep(step, data, primaryColor)).join('');

  return htmlWrapper(title, now, primaryColor, body, dinoEnabled);
}

function renderStep(step: SchemaStep, data: Record<string, unknown>, primaryColor: string): string {
  const rows = step.fields
    .filter((f) => f.type !== 'checkbox' || isChecked(data[f.id]))
    .map((f) => renderField(f, data, ''))
    .filter(Boolean)
    .join('');

  if (!rows) return '';

  return `<div class="section">
  <div class="section-title">${esc(step.title)}</div>
  ${rows}
</div>`;
}

function renderField(field: SchemaField, data: Record<string, unknown>, prefix: string): string {
  const key = prefix ? `${prefix}.${field.id}` : field.id;

  // Condition check: skip if condition not met
  if (field.condition) {
    const condVal = getNestedValue(data, field.condition.fieldId);
    if (!conditionMet(condVal, field.condition.operator, field.condition.value)) return '';
  }

  if (field.type === 'repeater') {
    return renderRepeater(field, data);
  }

  if (field.type === 'natural-person' || field.type === 'legal-person' || field.type === 'person') {
    return renderPersonField(field, data, prefix);
  }

  if (field.type === 'file') {
    // Files are stripped before sending — just note their presence
    const files = getNestedValue(data, key);
    if (!files) return '';
    const count = Array.isArray(files) ? files.length : 1;
    return row(field.label, `${count} Datei(en) hochgeladen`);
  }

  const value = getNestedValue(data, key);
  if (isEmpty(value)) return '';

  // Compound Adress-Felder: ohne explizite Formatierung würde `String(obj)`
  // → "[object Object]" rendern. Wir erkennen Adress-Strukturen am Vorhandensein
  // typischer Sub-Keys (strasse / plz / ort bzw. geschaeftsanschrift / sitz).
  if (field.type === 'address' && value && typeof value === 'object') {
    const formatted = formatAddressObject(value as Record<string, unknown>);
    return formatted ? row(field.label, formatted) : '';
  }
  if (field.type === 'business-address' && value && typeof value === 'object') {
    const formatted = formatBusinessAddressObject(value as Record<string, unknown>);
    return formatted ? row(field.label, formatted) : '';
  }

  if (field.type === 'checkbox') {
    return row(field.label, value ? 'Ja ✓' : '');
  }

  // Rating-Felder typabhaengig formatieren.
  if (field.type === 'stars') {
    const n = Number(value);
    if (Number.isNaN(n)) return row(field.label, String(value));
    const max = field.maxStars ?? 5;
    const filled = '★'.repeat(Math.max(0, Math.min(max, Math.round(n))));
    const empty = '☆'.repeat(Math.max(0, max - Math.round(n)));
    return row(field.label, `${filled}${empty} (${n}/${max})`);
  }
  if (field.type === 'scale') {
    const min = field.min ?? 1;
    const max = field.max ?? 10;
    return row(field.label, `${value} (Skala ${min}–${max})`);
  }
  if (field.type === 'yesno') {
    if (value === true || value === 'yes' || value === 1 || value === '1') {
      return row(field.label, field.yesLabel ?? 'Ja');
    }
    if (value === false || value === 'no' || value === 0 || value === '0') {
      return row(field.label, field.noLabel ?? 'Nein');
    }
  }

  // Plugin-Felder: rohen JSON-Wert nicht unverarbeitet rendern, sondern dem
  // Plugin die Chance geben, einen menschenlesbaren Text zu liefern.
  const fieldType = field.type as string;
  const pluginFormatted = pluginRegistry.formatPluginFieldValue(fieldType, value, {
    id: field.id,
    label: field.label,
    type: fieldType,
  });
  if (pluginFormatted !== null) {
    return row(field.label, pluginFormatted);
  }

  return row(field.label, String(value));
}

function renderPersonField(field: SchemaField, data: Record<string, unknown>, prefix: string): string {
  const key = prefix ? `${prefix}.${field.id}` : field.id;
  const item = getNestedValue(data, key);
  if (!item || typeof item !== 'object') return '';
  const innerFields = resolvePersonFieldInnerFields(
    field as unknown as FormField & { type: 'natural-person' | 'legal-person' | 'person' },
    item as Record<string, unknown>,
  );
  const rows = innerFields
    .map((sub) => renderField(sub as unknown as SchemaField, item as Record<string, unknown>, ''))
    .filter(Boolean)
    .join('');
  if (!rows) return '';
  return `<div class="repeater-card">
  <div class="repeater-title">${esc(field.label)}</div>
  ${rows}
</div>`;
}

function renderRepeater(field: SchemaField, data: Record<string, unknown>): string {
  const items = getRepeaterItems(data, field.id, field.countField ? String(data[field.countField] ?? 4) : '4');
  if (items.length === 0) return '';

  // Resolve once per item (the inner field set may differ between items in
  // 'both' mode, depending on the chosen Personentyp).
  const templates = getActivePersonTemplates();

  const cards = items.map((item, i) => {
    const innerFields = resolveRepeaterInnerFields(
      field as unknown as FormField & { type: 'repeater' },
      item,
      templates,
    );
    const subRows = innerFields
      .map((subField) => renderField(subField as unknown as SchemaField, item, ''))
      .filter(Boolean)
      .join('');
    if (!subRows) {
      // Item has no usable data — fall back to a minimal stub so the
      // notar still sees the slot's existence (e.g. "Käufer 3 — leer").
      return `<div class="repeater-card">
  <div class="repeater-title">${esc(field.label)} ${i + 1}</div>
  <div class="row"><span class="label">—</span><span class="value">(keine Angaben)</span></div>
</div>`;
    }
    return `<div class="repeater-card">
  <div class="repeater-title">${esc(field.label)} ${i + 1}</div>
  ${subRows}
</div>`;
  }).filter(Boolean).join('');

  if (!cards) return '';
  return `<div class="repeater-wrapper">${cards}</div>`;
}

// React Hook Form stores repeater data as { "0": {...}, "1": {...} }
function getRepeaterItems(data: Record<string, unknown>, key: string, countStr: string): Record<string, unknown>[] {
  const raw = data[key];
  if (!raw || typeof raw !== 'object') return [];
  const count = Math.min(parseInt(countStr, 10) || 0, 10);
  const items: Record<string, unknown>[] = [];
  for (let i = 0; i < count; i++) {
    const item = (raw as Record<string, unknown>)[String(i)];
    if (item && typeof item === 'object') items.push(item as Record<string, unknown>);
  }
  return items;
}

// Wandelt ein Adress-Objekt (wie es das address-Feld erzeugt) in eine ein-
// zeilige Anschrift um. Leere Felder werden ausgelassen, `land` nur wenn es
// vom Default abweicht.
function formatAddressObject(obj: Record<string, unknown>): string {
  const strasse = (obj.strasse as string) || '';
  const hausnummer = (obj.hausnummer as string) || '';
  const plz = (obj.plz as string) || '';
  const ort = (obj.ort as string) || '';
  const land = (obj.land as string) || '';
  const parts = [
    [strasse, hausnummer].filter(Boolean).join(' '),
    [plz, ort].filter(Boolean).join(' '),
    land && land !== 'Deutschland' ? land : '',
  ].filter(Boolean);
  return parts.join(', ');
}

// Business-Address: Geschäftsanschrift + Sitz. Wenn `gleich`, nur einmal.
function formatBusinessAddressObject(obj: Record<string, unknown>): string {
  const ga = obj.geschaeftsanschrift && typeof obj.geschaeftsanschrift === 'object'
    ? formatAddressObject(obj.geschaeftsanschrift as Record<string, unknown>)
    : '';
  const same = obj.gleich === true;
  if (same) return ga ? `Geschäftsanschrift & Sitz: ${ga}` : '';
  const sitz = obj.sitz && typeof obj.sitz === 'object'
    ? formatAddressObject(obj.sitz as Record<string, unknown>)
    : '';
  const bits: string[] = [];
  if (ga) bits.push(`Geschäftsanschrift: ${ga}`);
  if (sitz) bits.push(`Sitz: ${sitz}`);
  return bits.join(' | ');
}

function getNestedValue(data: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((obj, key) => {
    if (obj && typeof obj === 'object') return (obj as Record<string, unknown>)[key];
    return undefined;
  }, data);
}

function conditionMet(actual: unknown, operator: string, expected: unknown): boolean {
  if (operator === 'eq') return String(actual) === String(expected);
  if (operator === 'neq') return String(actual) !== String(expected);
  if (operator === 'in') {
    const list = Array.isArray(expected) ? expected : String(expected).split(',').map((s) => s.trim());
    return list.includes(String(actual));
  }
  return true;
}

// ---------------------------------------------------------------------------
// Fallback renderer — for submissions without schema (backward compat)
// ---------------------------------------------------------------------------

function buildHtmlFallback(title: string, data: Record<string, unknown>, primaryColor: string, dinoEnabled?: boolean): string {
  const now = timestamp();
  let content = '<div class="section"><div class="section-title">Angaben</div>';

  for (const [key, value] of Object.entries(data)) {
    if (isEmpty(value)) continue;
    if (typeof value === 'object' && !Array.isArray(value)) {
      // Nested object (repeater items stored as { "0": {...} })
      content += `</div><div class="section"><div class="section-title">${formatKey(key)}</div>`;
      const obj = value as Record<string, unknown>;
      Object.values(obj).forEach((item, i) => {
        if (!item || typeof item !== 'object') return;
        content += `<div class="repeater-card"><div class="repeater-title">Eintrag ${i + 1}</div>`;
        for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
          if (!isEmpty(v)) content += row(formatKey(k), String(v));
        }
        content += '</div>';
      });
      content += `</div><div class="section"><div class="section-title">Weitere Angaben</div>`;
    } else if (!Array.isArray(value)) {
      content += row(formatKey(key), String(value));
    }
  }
  content += '</div>';

  return htmlWrapper(title, now, primaryColor, content, dinoEnabled);
}

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

function htmlWrapper(title: string, now: string, primaryColor: string, body: string, dinoEnabled?: boolean): string {
  const dinoNotice = dinoEnabled
    ? `<div class="dino-notice">
        <strong>DiNo:</strong> Dieser Vorgang ist importbereit in Ihrer DiNo-Instanz.
        Sie finden ihn im Menü unter <em>Dialogeingang</em> / <em>Importbereich</em>.
       </div>`
    : '';
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #333; }
  .header { background: #${primaryColor}; color: #fff; padding: 20px 24px; margin-bottom: 0; }
  .header h1 { font-size: 18px; font-weight: bold; }
  .header p  { margin-top: 4px; font-size: 11px; opacity: 0.8; }
  .dino-notice {
    background: #f0f7ff; border-left: 3px solid #${primaryColor};
    padding: 10px 16px; margin: 0 24px 22px 24px; font-size: 10.5px; color: #1f2a37;
  }
  .dino-notice strong { color: #${primaryColor}; }
  .dino-notice em     { font-style: normal; font-weight: 600; }
  .content   { padding: 0 24px; margin-top: 28px; }
  .section   { margin-bottom: 22px; }
  .section-title {
    font-size: 11px; font-weight: bold; text-transform: uppercase;
    letter-spacing: 0.05em; color: #${primaryColor};
    border-bottom: 1.5px solid #${primaryColor};
    padding-bottom: 4px; margin-bottom: 10px;
  }
  .row   { display: flex; margin-bottom: 6px; gap: 8px; }
  .label { width: 42%; color: #666; font-size: 10.5px; padding-top: 1px; }
  .value { width: 58%; font-weight: 500; word-break: break-word; }
  .repeater-wrapper { margin-bottom: 4px; }
  .repeater-card {
    border: 1px solid #ddd; border-radius: 4px;
    padding: 10px 12px; margin-bottom: 8px;
  }
  .repeater-title {
    font-size: 11px; font-weight: bold; color: #555;
    margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid #eee;
  }
  .footer {
    margin-top: 36px; padding: 12px 24px;
    border-top: 1px solid #ddd; font-size: 9.5px; color: #aaa; text-align: center;
  }
</style>
</head>
<body>
<div class="header">
  <h1>${esc(title)}</h1>
  <p>Eingereicht am ${now}</p>
</div>
${dinoNotice}
<div class="content">${body}</div>
<div class="footer">Dieses Dokument wurde automatisch generiert</div>
</body>
</html>`;
}

function row(label: string, value: string): string {
  return `<div class="row"><span class="label">${esc(label)}</span><span class="value">${esc(value)}</span></div>`;
}

function isEmpty(v: unknown): boolean {
  return v === '' || v === null || v === undefined || v === false;
}

function isChecked(v: unknown): boolean {
  return v === true || v === 'true' || v === 'Ja';
}

function timestamp(): string {
  return new Date().toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function esc(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatKey(key: string): string {
  return key.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, (c) => c.toUpperCase());
}
