export type FieldType =
  | 'text'
  | 'email'
  | 'tel'
  | 'number'
  | 'textarea'
  | 'date'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'file'
  | 'repeater'
  | 'address'
  // Compound legal-person address (Geschäftsanschrift + Sitz with sync
  // toggle). No longer added through the editor – it's part of the
  // legal-person template instead. Kept for backwards compatibility.
  | 'business-address'
  | 'info'
  // Person fields automatically render the global person templates.
  // - 'person'        → Typ-Radio + bedingt natürliche/juristische Vorlage
  // - 'natural-person' → nur natürliche-Person-Vorlage
  // - 'legal-person'   → nur juristische-Person-Vorlage
  | 'person'
  | 'natural-person'
  | 'legal-person'
  // Read-only computed value derived from other number fields.
  | 'calculation'
  // Inline-embed: pulls the steps of another dialog into the current one.
  | 'embed'
  // Multi-select – like select, but the value is a string[] of all
  // checked options. Combine with the `contains` / `notContains`
  // condition operators to react to specific selections.
  | 'multi-select'
  // Bewertungs-Felder: nutzbar in eigenstaendigen OF-Dialogen sowie in
  // DiNo-getriebenen Bewertungsboegen.
  | 'stars'
  | 'scale'
  | 'yesno';

export type ConditionOperator =
  | 'eq' | 'neq' | 'in'
  | 'lt' | 'gt' | 'lte' | 'gte'
  // set: value is non-empty / non-zero (truthy)
  // unset: value is empty / zero / undefined
  | 'set' | 'unset'
  // contains / notContains: for multi-select arrays – checks whether the
  // (right-hand) value is part of the (left-hand) field's array value.
  | 'contains' | 'notContains';

// A condition's right-hand operand. Either a literal value or a reference
// to another field's current value, so two number fields can be compared.
export type ConditionValue =
  | string
  | string[]
  | number
  | { fieldRef: string };

export interface FieldCondition {
  fieldId: string; // relative within repeater, absolute at top level
  operator: ConditionOperator;
  value: ConditionValue;
}

export interface BaseField {
  id: string;
  label: string;
  required?: boolean;
  helpText?: string;
  condition?: FieldCondition;
  // When true, the field's value is cleared from the form state as soon as
  // its `condition` evaluates to false. Prevents "Geister-Werte" from
  // previously-shown fields from leaking into the submission payload (e.g.
  // grundbuch_amtsgericht in a Schenkung that the user later switched to
  // "Geldbetrag"). Default: false (legacy behaviour preserved).
  clearWhenHidden?: boolean;
}

export interface InputField extends BaseField {
  type: 'text' | 'email' | 'tel';
  placeholder?: string;
}

// Number input with optional format hints (€, %, DM, freie Einheit) and a
// configurable number of decimals. Stored as a plain number; the format is
// only used for display (prefix/suffix decoration + step / rounding).
export interface NumberField extends BaseField {
  type: 'number';
  placeholder?: string;
  format?: 'euro' | 'percent' | 'dm' | 'plain';
  decimals?: number;        // default: 2
  prefix?: string;          // freier Text vor dem Eingabefeld
  suffix?: string;          // freier Text dahinter (überschreibt format)
  min?: number;
  max?: number;
}

export interface TextareaField extends BaseField {
  type: 'textarea';
  placeholder?: string;
  rows?: number;
}

export interface DateField extends BaseField {
  type: 'date';
}

// An option can be a plain string (legacy) OR an object with optional
// label and a per-option visibility condition. Lets us express "show
// option X only when rechtsform == GmbH" without forking the whole field.
export interface OptionConfig {
  value: string;
  label?: string;
  condition?: FieldCondition;
}

export type FieldOption = string | OptionConfig;

export function resolveOption(opt: FieldOption): OptionConfig {
  return typeof opt === 'string' ? { value: opt } : opt;
}

export interface SelectField extends BaseField {
  type: 'select';
  options: FieldOption[];
  placeholder?: string;
}

export interface RadioField extends BaseField {
  type: 'radio';
  options: FieldOption[];
  layout?: 'horizontal' | 'vertical';
}

export interface MultiSelectField extends BaseField {
  type: 'multi-select';
  options: FieldOption[];
  layout?: 'horizontal' | 'vertical';
  // Optional minimum/maximum number of selected entries.
  minSelected?: number;
  maxSelected?: number;
}

export interface CheckboxField extends BaseField {
  type: 'checkbox';
  checkboxLabel: string;
}

export interface FileField extends BaseField {
  type: 'file';
  accept?: string;
  maxSizeMB?: number;
  maxFiles?: number;
}

export type PersonTemplateMode = 'natural' | 'legal' | 'both';

// Per-template-field override map. Keyed by the `id` of the field inside
// the global person template. Currently only `required` can be overridden,
// so the dialog can change which fields are mandatory without forking the
// whole template.
export type PersonFieldOverrides = Record<string, { required?: boolean }>;

// ---------------------------------------------------------------------------
// Embed field – pulls another dialog's steps into the current one.
//
// Use case: a Unterschriftsbeglaubigung asks for a "Vorgangstyp"; if the
// user picks "Handelsregister-Anmeldung" the entire Handelsregister-Dialog
// should appear inline, without a route change. The embedded dialog's
// fields live under this field's `id`, so their values don't collide with
// the host dialog (e.g. host.firma vs. embed.firma).
//
// The renderer fetches the referenced dialog at runtime, drops its
// `kontakt` step (the host already has its own kontakt-step), and renders
// each remaining step's fields one after another.
// ---------------------------------------------------------------------------
export interface EmbedField extends BaseField {
  type: 'embed';
  // Route / id of the dialog to embed (e.g. "handelsregister", "verein").
  dialogId: string;
  // Optional: only embed steps with these IDs. Empty / undefined = all
  // steps except the kontakt step.
  stepIds?: string[];
}

export interface RepeaterField extends BaseField {
  type: 'repeater';
  // ID of a radio/select/number field whose value drives the entry count.
  countField: string;
  // Mandatory: every repeater is based on a person template. 'both' renders
  // a typ-radio + natural and legal templates conditionally on the typ.
  personTemplate?: PersonTemplateMode;
  // Per-template-field required override map. Same shape and semantics as
  // PersonField.fieldOverrides – allows switching `required` per dialog
  // without forking the global template.
  fieldOverrides?: PersonFieldOverrides;
  // Additional fields appended to every repeater item, after the template
  // fields. Defined inline; not part of the global template.
  extraFields?: FormField[];
  // Hard cap on the number of items. Either a fixed number or a reference
  // to another field whose numeric value provides the cap (use `/feld_id`
  // for absolute paths). Items beyond the cap are silently dropped.
  maxItems?: number | { fieldRef: string };

  // ---- Legacy (kept for back-compat with old data) ----
  // Inline field list. New repeaters use `personTemplate` + `extraFields`.
  fields?: FormField[];
  // Replaced by `fieldOverrides`. Kept so legacy seed data still parses.
  addressRequired?: boolean;
}

export interface AddressField extends BaseField {
  type: 'address';
}

// Compound field for legal persons: separate Geschäftsanschrift and Sitz
// addresses with a toggle "Geschäftsanschrift und Sitz sind gleich" that
// keeps Sitz synchronised with Geschäftsanschrift while active.
export interface BusinessAddressField extends BaseField {
  type: 'business-address';
}

// Static, conditionally shown info text. Use `tone` to control the visual
// emphasis of the message. Useful for hints like "Bei Stammkapital < 25.000
// liegt evtl. eine UG vor".
export interface InfoField extends BaseField {
  type: 'info';
  text: string;
  tone?: 'info' | 'warning' | 'success';
}

// ---------------------------------------------------------------------------
// Calculation field
// ---------------------------------------------------------------------------

// Operands of a calculation step are either a constant value or a reference
// to another field's value. Field references work both at the top level and
// within the same repeater item (use a relative `fieldId` for the latter).
export type CalcOperand =
  | { kind: 'const'; value: number }
  | { kind: 'field'; fieldId: string };

export type CalcOperator = '+' | '-' | '*' | '/';

export interface CalcStep {
  // Operator applied to the previous accumulator. The first step's operator
  // is ignored.
  operator?: CalcOperator;
  operand: CalcOperand;
}

export type CalculationFormat = 'euro' | 'percent' | 'dm' | 'plain';

export interface CalculationField extends BaseField {
  type: 'calculation';
  // Sequence of (operator, operand) steps evaluated left-to-right with no
  // operator precedence. Keeps configuration simple in the editor.
  steps: CalcStep[];
  // Visual/output format. Combine with `decimals`, `prefix`, `suffix` for
  // free-form output.
  format?: CalculationFormat;
  decimals?: number;        // default: 2
  prefix?: string;          // e.g. "≈ "
  suffix?: string;          // e.g. " €", " %", " DM"
  // Multiply the final value by 100 before display (useful when the formula
  // produces a ratio like 0.25 and you want to show 25 %).
  asPercent?: boolean;
  // Hide the result if any operand cannot be resolved to a number.
  hideIfIncomplete?: boolean;
}

// Person fields rely on the global person templates (settings.person_template_*).
// Their `fieldOverrides` allow per-dialog tweaks of the `required` flag of
// individual template fields.
export interface PersonField extends BaseField {
  type: 'person';
  fieldOverrides?: PersonFieldOverrides;
}

export interface NaturalPersonField extends BaseField {
  type: 'natural-person';
  fieldOverrides?: PersonFieldOverrides;
}

export interface LegalPersonField extends BaseField {
  type: 'legal-person';
  fieldOverrides?: PersonFieldOverrides;
}

// Bewertungs-Felder.
// Verfuegbar in eigenstaendigen OF-Dialogen UND in DiNo-Bewertungsboegen.
// Der Wert in der Submission ist:
//  - stars/scale: number (gewählter Wert)
//  - yesno:       'yes' | 'no' (string fuer einheitliche Behandlung mit
//                 select/radio in conditions / export)
export interface StarsField extends BaseField {
  type: 'stars';
  /** Maximale Anzahl Sterne (Default 5). */
  maxStars?: number;
}

export interface ScaleField extends BaseField {
  type: 'scale';
  /** Untere Skalengrenze (inklusive, Default 1). */
  min?: number;
  /** Obere Skalengrenze (inklusive, Default 10). */
  max?: number;
  /** Beschriftung am linken Skalenende. */
  minLabel?: string;
  /** Beschriftung am rechten Skalenende. */
  maxLabel?: string;
}

export interface YesNoField extends BaseField {
  type: 'yesno';
  yesLabel?: string;
  noLabel?: string;
}

export type FormField =
  | InputField
  | NumberField
  | TextareaField
  | DateField
  | SelectField
  | RadioField
  | MultiSelectField
  | CheckboxField
  | FileField
  | RepeaterField
  | AddressField
  | BusinessAddressField
  | InfoField
  | PersonField
  | NaturalPersonField
  | LegalPersonField
  | CalculationField
  | EmbedField
  | StarsField
  | ScaleField
  | YesNoField;

export interface FormStep {
  id: string;
  title: string;
  // Optional descriptive text shown under the step title in the wizard.
  description?: string;
  fields: FormField[];
}

export interface FormSchema {
  id: string;
  title: string;
  description?: string;
  // Legacy single category (string). Prefer `categories` (array) for new code.
  category?: string;
  // Multi-category support. A dialog can belong to several categories.
  categories?: string[];
  isActive?: boolean;
  isSystem?: boolean;
  createdAt?: string;
  updatedAt?: string;
  steps: FormStep[];
}

// Helper: returns the effective category list of a schema, normalising
// the legacy `category` field into the new `categories` array.
export function getCategories(schema: { category?: string; categories?: string[] }): string[] {
  if (schema.categories && schema.categories.length > 0) return schema.categories;
  if (schema.category) return [schema.category];
  return [];
}
