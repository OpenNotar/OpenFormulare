// ---------------------------------------------------------------------------
// Translation key derivation + schema substitution.
//
// Keys are derived from the schema's stable IDs (dialog, step, field, option
// value) so reordering or restructuring does not orphan translations.
//
// Key format:
//   dialog.title
//   dialog.description
//   step.{stepId}.title
//   step.{stepId}.description
//   field.{fieldId}.label
//   field.{fieldId}.placeholder
//   field.{fieldId}.helpText
//   field.{fieldId}.checkboxLabel
//   field.{fieldId}.text                 (info field body)
//   field.{fieldId}.option.{value}       (one entry per option)
//   field.{fieldId}.minLabel             (scale)
//   field.{fieldId}.maxLabel             (scale)
//   field.{fieldId}.yesLabel             (yesno)
//   field.{fieldId}.noLabel              (yesno)
//   field.{fieldId}.prefix               (number / calculation)
//   field.{fieldId}.suffix
//
// Repeater extraFields are recursed with a path prefix:
//   field.{repeaterId}.field.{innerId}.label
// etc.
// ---------------------------------------------------------------------------

import type { FormField, FormSchema, FormStep, FieldOption, OptionConfig } from '../db/types/schema';
import type { TranslationMap } from '../db/translations';

function optionValue(opt: FieldOption): string {
  if (typeof opt === 'string') return opt;
  return (opt as OptionConfig).value;
}

function optionLabel(opt: FieldOption): string {
  if (typeof opt === 'string') return opt;
  const o = opt as OptionConfig;
  return o.label ?? o.value;
}

// Walk a schema and collect all translatable strings keyed by their stable
// translation key. Used by the admin UI to build the per-language editor.
export function collectTranslatableStrings(schema: FormSchema): Record<string, string> {
  const out: Record<string, string> = {};
  const add = (key: string, value: string | undefined) => {
    if (value !== undefined && value !== null && value !== '') {
      out[key] = value;
    }
  };

  add('dialog.title', schema.title);
  add('dialog.description', schema.description);

  for (const step of schema.steps) {
    add(`step.${step.id}.title`, step.title);
    add(`step.${step.id}.description`, step.description);
    collectFieldStrings(step.fields, '', out);
  }

  return out;
}

function collectFieldStrings(
  fields: FormField[],
  pathPrefix: string,
  out: Record<string, string>,
): void {
  for (const f of fields) {
    const prefix = `${pathPrefix}field.${f.id}`;
    out[`${prefix}.label`] = f.label;
    if ('placeholder' in f && typeof f.placeholder === 'string') {
      out[`${prefix}.placeholder`] = f.placeholder;
    }
    if (f.helpText) out[`${prefix}.helpText`] = f.helpText;
    if (f.type === 'checkbox') out[`${prefix}.checkboxLabel`] = f.checkboxLabel;
    if (f.type === 'info') out[`${prefix}.text`] = f.text;
    if (f.type === 'select' || f.type === 'radio' || f.type === 'multi-select') {
      for (const opt of f.options) {
        out[`${prefix}.option.${optionValue(opt)}`] = optionLabel(opt);
      }
    }
    if (f.type === 'scale') {
      if (f.minLabel) out[`${prefix}.minLabel`] = f.minLabel;
      if (f.maxLabel) out[`${prefix}.maxLabel`] = f.maxLabel;
    }
    if (f.type === 'yesno') {
      if (f.yesLabel) out[`${prefix}.yesLabel`] = f.yesLabel;
      if (f.noLabel) out[`${prefix}.noLabel`] = f.noLabel;
    }
    if (f.type === 'number' || f.type === 'calculation') {
      if (f.prefix) out[`${prefix}.prefix`] = f.prefix;
      if (f.suffix) out[`${prefix}.suffix`] = f.suffix;
    }
    if (f.type === 'repeater' && Array.isArray(f.extraFields)) {
      collectFieldStrings(f.extraFields, `${prefix}.`, out);
    }
    // Legacy repeater inline fields
    if (f.type === 'repeater' && Array.isArray(f.fields)) {
      collectFieldStrings(f.fields, `${prefix}.`, out);
    }
  }
}

// Apply a translation map to a schema, returning a deep-copied schema with
// translated strings substituted. The original schema is not mutated. Missing
// translations fall back to the canonical German values.
export function applyTranslations(schema: FormSchema, translations: TranslationMap): FormSchema {
  const t = (key: string, fallback: string | undefined): string | undefined => {
    const v = translations[key];
    return v != null && v !== '' ? v : fallback;
  };

  const result: FormSchema = {
    ...schema,
    title: t('dialog.title', schema.title) ?? schema.title,
    description: t('dialog.description', schema.description),
    steps: schema.steps.map((step) => translateStep(step, translations, '')),
  };
  return result;
}

function translateStep(step: FormStep, tx: TranslationMap, pathPrefix: string): FormStep {
  const t = (key: string, fallback: string | undefined) => {
    const v = tx[key];
    return v != null && v !== '' ? v : fallback;
  };
  return {
    ...step,
    title: t(`step.${step.id}.title`, step.title) ?? step.title,
    description: t(`step.${step.id}.description`, step.description),
    fields: step.fields.map((f) => translateField(f, tx, pathPrefix)),
  };
}

function translateField(field: FormField, tx: TranslationMap, pathPrefix: string): FormField {
  const prefix = `${pathPrefix}field.${field.id}`;
  const t = (suffix: string, fallback: string | undefined): string | undefined => {
    const v = tx[`${prefix}.${suffix}`];
    return v != null && v !== '' ? v : fallback;
  };
  // Use a structural clone to keep typing simple.
  const copy = JSON.parse(JSON.stringify(field)) as FormField;
  copy.label = t('label', field.label) ?? field.label;
  if ('placeholder' in copy && 'placeholder' in field && typeof field.placeholder === 'string') {
    (copy as { placeholder?: string }).placeholder = t('placeholder', field.placeholder);
  }
  if (field.helpText) copy.helpText = t('helpText', field.helpText);
  if (copy.type === 'checkbox' && field.type === 'checkbox') {
    copy.checkboxLabel = t('checkboxLabel', field.checkboxLabel) ?? field.checkboxLabel;
  }
  if (copy.type === 'info' && field.type === 'info') {
    copy.text = t('text', field.text) ?? field.text;
  }
  if ((copy.type === 'select' || copy.type === 'radio' || copy.type === 'multi-select')
      && (field.type === 'select' || field.type === 'radio' || field.type === 'multi-select')) {
    copy.options = field.options.map((opt) => {
      const value = optionValue(opt);
      const label = optionLabel(opt);
      const translatedLabel = t(`option.${value}`, label) ?? label;
      // Always return OptionConfig form when translating so labels survive.
      return { value, label: translatedLabel };
    });
  }
  if (copy.type === 'scale' && field.type === 'scale') {
    if (field.minLabel) copy.minLabel = t('minLabel', field.minLabel);
    if (field.maxLabel) copy.maxLabel = t('maxLabel', field.maxLabel);
  }
  if (copy.type === 'yesno' && field.type === 'yesno') {
    if (field.yesLabel) copy.yesLabel = t('yesLabel', field.yesLabel);
    if (field.noLabel) copy.noLabel = t('noLabel', field.noLabel);
  }
  if ((copy.type === 'number' && field.type === 'number') ||
      (copy.type === 'calculation' && field.type === 'calculation')) {
    if (field.prefix) (copy as { prefix?: string }).prefix = t('prefix', field.prefix);
    if (field.suffix) (copy as { suffix?: string }).suffix = t('suffix', field.suffix);
  }
  if (copy.type === 'repeater' && field.type === 'repeater') {
    const innerPrefix = `${prefix}.`;
    if (Array.isArray(field.extraFields)) {
      copy.extraFields = field.extraFields.map((inner) => translateField(inner, tx, innerPrefix));
    }
    if (Array.isArray(field.fields)) {
      copy.fields = field.fields.map((inner) => translateField(inner, tx, innerPrefix));
    }
  }
  return copy;
}
