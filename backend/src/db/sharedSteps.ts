import type { FormSchema, FormStep, FormField, PersonFieldOverrides } from './types/schema';
import { SETTING_KEYS, getSetting } from './settings';
import { LEGAL_ENTITY_FORMS } from './legalForms';

// Default-Kontakt-Step:
// - Datenschutz & E-Mail-Einverstaendnis bleiben Pflicht (rechtlich noetig).
// - Alle Personendaten sind optional, damit der Notar die Vorlage anpassen
//   kann (auch fuer juristische Personen ohne Vorname/Nachname) und der
//   DiNo-Import dadurch nicht fehlschlaegt.
const DEFAULT_KONTAKT_STEP: FormStep = {
  id: 'kontakt',
  title: 'Kontakt & Termin',
  fields: [
    { id: 'anfrager_vorname', type: 'text', label: 'Vorname', required: false, placeholder: 'Vorname' },
    { id: 'anfrager_nachname', type: 'text', label: 'Nachname', required: false, placeholder: 'Nachname' },
    { id: 'anfrager_firma', type: 'text', label: 'Firma (falls juristische Person)', required: false, placeholder: 'Name der Firma' },
    { id: 'email', type: 'email', label: 'E-Mail-Adresse', required: false, placeholder: 'ihre@email.de' },
    { id: 'telefon', type: 'tel', label: 'Telefonnummer', required: false, placeholder: '+49 ...' },
    { id: 'postadresse', type: 'address', label: 'Postadresse', required: false },
    { id: 'email_einverstaendnis', type: 'checkbox', label: 'E-Mail-Einverständnis', required: true, checkboxLabel: 'Ich bin mit der unverschlüsselten Kommunikation per E-Mail einverstanden' },
    { id: 'auftrag', type: 'radio', label: 'Auftrag', required: false, layout: 'vertical', options: ['Ich beauftrage den Notar mit der Vorbereitung des Entwurfs', 'Ich möchte zunächst nur Informationen (noch kein Auftrag)'] },
    { id: 'termin_status', type: 'radio', label: 'Terminvereinbarung', required: false, layout: 'vertical', options: ['Bereits vereinbart', 'Bitte Kontakt aufnehmen'] },
    { id: 'termin_datum', type: 'text', label: 'Termindatum und -uhrzeit', required: false, placeholder: 'TT.MM.JJJJ HH:MM', condition: { fieldId: 'termin_status', operator: 'eq', value: 'Bereits vereinbart' } },
    { id: 'datenschutz', type: 'checkbox', label: 'Datenschutzerklärung', required: true, checkboxLabel: 'Ich habe die Datenschutzerklärung gelesen und stimme der Verarbeitung meiner Daten zu' },
    { id: 'aktenzeichen', type: 'text', label: 'Aktenzeichen (optional)', required: false, helpText: 'Falls bereits vorhanden' },
    { id: 'bemerkungen', type: 'textarea', label: 'Nachricht an den Notar (optional)', required: false, rows: 4, placeholder: 'Sonstige Hinweise oder Anmerkungen für den Notar' },
  ],
};

const DEFAULT_NATURAL_PERSON_FIELDS: FormField[] = [
  { id: 'anrede', type: 'select', label: 'Anrede', options: ['Herr', 'Frau', 'Divers', 'Keine Angabe'], placeholder: 'Bitte wählen', required: false },
  { id: 'vorname', type: 'text', label: 'Vorname(n)', required: true },
  { id: 'nachname', type: 'text', label: 'Nachname', required: true },
  { id: 'geburtsname', type: 'text', label: 'Geburtsname (falls abweichend)', required: false },
  { id: 'geburtsdatum', type: 'date', label: 'Geburtsdatum', required: false },
  { id: 'geburtsort', type: 'text', label: 'Geburtsort', required: false },
  { id: 'staatsangehoerigkeit', type: 'text', label: 'Staatsangehörigkeit', required: false },
  { id: 'adresse', type: 'address', label: 'Anschrift', required: true },
  { id: 'email', type: 'email', label: 'E-Mail (optional)', required: false },
  { id: 'telefon', type: 'tel', label: 'Telefon (optional)', required: false },
];

const DEFAULT_LEGAL_PERSON_FIELDS: FormField[] = [
  { id: 'firma', type: 'text', label: 'Firma', required: true },
  {
    id: 'rechtsform',
    type: 'select',
    label: 'Rechtsform',
    required: false,
    options: [...LEGAL_ENTITY_FORMS],
    placeholder: 'Bitte wählen',
  },
  {
    id: 'rechtsform_sonstiges',
    type: 'text',
    label: 'Sonstige Rechtsform',
    required: false,
    placeholder: 'Bitte angeben',
    condition: { fieldId: 'rechtsform', operator: 'eq', value: 'Sonstiges' },
  },
  { id: 'jp_registergericht', type: 'text', label: 'Registergericht', required: false },
  { id: 'jp_hrb', type: 'text', label: 'HRB-Nummer', required: false },
  {
    id: 'adresse_juristisch',
    type: 'business-address',
    label: 'Geschäftsanschrift & Sitz',
    required: true,
    helpText: 'Geschäftsanschrift und Sitz können abweichen. Wenn beide identisch sind, aktivieren Sie den Schieberegler.',
  },
  { id: 'jp_email', type: 'email', label: 'E-Mail (optional)', required: false },
  { id: 'jp_telefon', type: 'tel', label: 'Telefon (optional)', required: false },
];

const DEFAULT_BRANDING = {
  notarName: '',
  // Browser-Tab title template. Supported placeholder: {title}
  titleTemplate: '{title}',
  // PDF / Email primary colour, Hex without #.
  primaryColor: '1a3a5c',
  // Frontend theme colours (override env defaults if set).
  colors: {
    primary: '',
    primaryDark: '',
    accent: '',
  },
  // Favicon URL (data URI or absolute URL).
  faviconUrl: '',
  logoUrl: '',
  // Public home page header. Empty values fall back to built-in defaults
  // ("OpenFormulare" / standard subtitle). Notars use this to put their
  // own kanzlei name into the iframe-embedded overview.
  homeTitle: '',
  homeSubtitle: '',
  // Hide the "Admin" button on the public overview page. Useful when the
  // page is embedded in a public website and the link should not be
  // visible to clients.
  hideAdminButton: false,
};

function cloneStep(step: FormStep): FormStep {
  return JSON.parse(JSON.stringify(step)) as FormStep;
}

export function getDefaultKontaktStep(): FormStep {
  return cloneStep(DEFAULT_KONTAKT_STEP);
}

export function getDefaultPersonTemplates() {
  return {
    natural: JSON.parse(JSON.stringify(DEFAULT_NATURAL_PERSON_FIELDS)) as FormField[],
    legal: JSON.parse(JSON.stringify(DEFAULT_LEGAL_PERSON_FIELDS)) as FormField[],
  };
}

export function getDefaultBranding() {
  return JSON.parse(JSON.stringify(DEFAULT_BRANDING));
}

// Returns the currently active Kontakt-Step. Falls back to the default if no
// custom one has been configured. Reading from the settings table allows
// admins to centrally edit "Kontakt & Termin" — changes propagate to every
// dialog automatically because dialog records no longer store the step.
function getActiveKontaktStep(): FormStep {
  const stored = getSetting<FormStep>(SETTING_KEYS.kontaktStep);
  if (stored && Array.isArray(stored.fields)) {
    return cloneStep({ ...stored, id: 'kontakt' });
  }
  return getDefaultKontaktStep();
}

// Returns the currently active person templates (natural + legal). Falls
// back to the built-in defaults if the admin has not customised them.
export function getActivePersonTemplates(): { natural: FormField[]; legal: FormField[] } {
  const natural = getSetting<FormField[]>(SETTING_KEYS.personTemplateNatural);
  const legal = getSetting<FormField[]>(SETTING_KEYS.personTemplateLegal);
  const defaults = getDefaultPersonTemplates();
  return {
    natural: Array.isArray(natural) ? natural : defaults.natural,
    legal: Array.isArray(legal) ? legal : defaults.legal,
  };
}

// Resolves the effective inner fields of a repeater for one item, taking
// into account:
//   - personTemplate ('natural' | 'legal' | 'both')
//   - fieldOverrides (per-template-field required overrides)
//   - extraFields (appended after the template)
//   - legacy inline `fields` (for repeaters that don't use a template)
//
// For mode 'both' the item's `typ` selector decides which template to
// expand; the synthetic `typ` radio field itself is prepended so that
// downstream renderers can show the chosen Personentyp.
export function resolveRepeaterInnerFields(
  field: FormField & { type: 'repeater' },
  item: Record<string, unknown> | undefined,
  templates?: { natural: FormField[]; legal: FormField[] },
): FormField[] {
  const tpls = templates ?? getActivePersonTemplates();
  const overrides = (field as { fieldOverrides?: PersonFieldOverrides }).fieldOverrides ?? {};

  // `hidden` entfernt das Vorlagenfeld, `label` beschriftet es dialogspezifisch
  // (z. B. Anschrift -> "Letzter gewoehnlicher Aufenthalt" beim Erbschein).
  const applyOverrides = (fields: FormField[]): FormField[] =>
    fields
      .filter((f) => overrides[f.id]?.hidden !== true)
      .map((f) => {
        const ov = overrides[f.id];
        if (!ov) return f;
        const next = { ...f } as FormField;
        if (ov.required !== undefined) next.required = ov.required;
        if (ov.label) next.label = ov.label;
        if (ov.helpText) next.helpText = ov.helpText;
        return next;
      });

  const mode = (field as { personTemplate?: 'natural' | 'legal' | 'both' }).personTemplate;

  const TYP_FIELD: FormField = {
    id: 'typ',
    type: 'radio',
    label: 'Personentyp',
    options: ['Natürliche Person', 'Juristische Person'],
    required: overrides.typ?.required ?? true,
  } as FormField;

  let templateFields: FormField[] = [];

  if (mode === 'natural') {
    templateFields = applyOverrides(tpls.natural);
  } else if (mode === 'legal') {
    templateFields = applyOverrides(tpls.legal);
  } else if (mode === 'both') {
    const isLegal = item?.typ === 'Juristische Person';
    templateFields = [TYP_FIELD, ...applyOverrides(isLegal ? tpls.legal : tpls.natural)];
  } else if (Array.isArray((field as { fields?: FormField[] }).fields)) {
    // Legacy inline fields — kept for back-compat with pre-template repeaters.
    templateFields = (field as { fields: FormField[] }).fields;
  }

  const extra = Array.isArray((field as { extraFields?: FormField[] }).extraFields)
    ? (field as { extraFields: FormField[] }).extraFields
    : [];
  return [...templateFields, ...extra];
}

// Resolves the inner field list of a standalone person container field
// (`natural-person`, `legal-person`, `person`). Mirrors the repeater logic
// — the global template is expanded, overrides applied, and dialog-specific
// `extraFields` appended.
//
// For `person` (typ-radio): when `value.typ` is undefined we default to
// natural; downstream rendering hides irrelevant template fields via the
// synthetic typ-condition.
export function resolvePersonFieldInnerFields(
  field: FormField & { type: 'person' | 'natural-person' | 'legal-person' },
  value: Record<string, unknown> | undefined,
  templates?: { natural: FormField[]; legal: FormField[] },
): FormField[] {
  const tpls = templates ?? getActivePersonTemplates();
  const overrides = (field as { fieldOverrides?: PersonFieldOverrides }).fieldOverrides ?? {};

  // `hidden` entfernt das Vorlagenfeld, `label` beschriftet es dialogspezifisch
  // (z. B. Anschrift -> "Letzter gewoehnlicher Aufenthalt" beim Erbschein).
  const applyOverrides = (fields: FormField[]): FormField[] =>
    fields
      .filter((f) => overrides[f.id]?.hidden !== true)
      .map((f) => {
        const ov = overrides[f.id];
        if (!ov) return f;
        const next = { ...f } as FormField;
        if (ov.required !== undefined) next.required = ov.required;
        if (ov.label) next.label = ov.label;
        if (ov.helpText) next.helpText = ov.helpText;
        return next;
      });

  let templateFields: FormField[] = [];

  if (field.type === 'natural-person') {
    templateFields = applyOverrides(tpls.natural);
  } else if (field.type === 'legal-person') {
    templateFields = applyOverrides(tpls.legal);
  } else {
    const TYP_FIELD: FormField = {
      id: 'typ',
      type: 'radio',
      label: 'Personentyp',
      options: ['Natürliche Person', 'Juristische Person'],
      required: overrides.typ?.required ?? true,
    } as FormField;
    const isLegal = value?.typ === 'Juristische Person';
    templateFields = [TYP_FIELD, ...applyOverrides(isLegal ? tpls.legal : tpls.natural)];
  }

  const extra = Array.isArray((field as { extraFields?: FormField[] }).extraFields)
    ? (field as { extraFields: FormField[] }).extraFields
    : [];
  return [...templateFields, ...extra];
}

export function ensureKontaktStepAtEnd(schema: FormSchema): FormSchema {
  const otherSteps = schema.steps.filter((step) => step.id !== 'kontakt');
  // Always append the active Kontakt template so changes via the admin
  // backend propagate automatically. Anything stored on the dialog itself
  // is discarded in favour of the central template.
  return {
    ...schema,
    steps: [...otherSteps, getActiveKontaktStep()],
  };
}
