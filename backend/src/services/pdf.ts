import puppeteer from 'puppeteer';

// Minimal schema types (mirrors frontend types/schema.ts)
interface SchemaField {
  id: string;
  label: string;
  type: string;
  fields?: SchemaField[];     // repeater sub-fields
  countField?: string;        // repeater count reference
  condition?: { fieldId: string; operator: string; value: unknown };
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

export async function generatePdf({ formType, data, primaryColor, formSchema }: PdfOptions): Promise<Buffer> {
  const title = formSchema?.title ?? FORM_TITLES[formType] ?? formType;
  const html = formSchema
    ? buildHtmlFromSchema(formSchema, data, primaryColor, title)
    : buildHtmlFallback(title, data, primaryColor);

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

function buildHtmlFromSchema(schema: FormSchema, data: Record<string, unknown>, primaryColor: string, title: string): string {
  const now = timestamp();
  const body = schema.steps.map((step) => renderStep(step, data, primaryColor)).join('');

  return htmlWrapper(title, now, primaryColor, body);
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

  if (field.type === 'file') {
    // Files are stripped before sending — just note their presence
    const files = getNestedValue(data, key);
    if (!files) return '';
    const count = Array.isArray(files) ? files.length : 1;
    return row(field.label, `${count} Datei(en) hochgeladen`);
  }

  const value = getNestedValue(data, key);
  if (isEmpty(value)) return '';

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

  return row(field.label, String(value));
}

function renderRepeater(field: SchemaField, data: Record<string, unknown>): string {
  const items = getRepeaterItems(data, field.id, field.countField ? String(data[field.countField] ?? 4) : '4');
  if (items.length === 0) return '';

  const cards = items.map((item, i) => {
    const subRows = (field.fields ?? [])
      .map((subField) => renderField(subField, item, ''))
      .filter(Boolean)
      .join('');
    if (!subRows) return '';
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

function buildHtmlFallback(title: string, data: Record<string, unknown>, primaryColor: string): string {
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

  return htmlWrapper(title, now, primaryColor, content);
}

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

function htmlWrapper(title: string, now: string, primaryColor: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #333; }
  .header { background: #${primaryColor}; color: #fff; padding: 20px 24px; margin-bottom: 28px; }
  .header h1 { font-size: 18px; font-weight: bold; }
  .header p  { margin-top: 4px; font-size: 11px; opacity: 0.8; }
  .content   { padding: 0 24px; }
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
