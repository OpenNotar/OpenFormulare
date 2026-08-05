// Frontend mirror of backend/src/services/i18nKeys.ts — derives translation
// keys + canonical German strings from a dialog schema for the admin editor.
//
// Keep both files in sync. They are deliberately duplicated rather than
// shared because the frontend doesn't import backend code.

import type { FormField, FormSchema, FieldOption, OptionConfig } from '../types/schema';

function optionValue(opt: FieldOption): string {
  return typeof opt === 'string' ? opt : (opt as OptionConfig).value;
}

function optionLabel(opt: FieldOption): string {
  if (typeof opt === 'string') return opt;
  const o = opt as OptionConfig;
  return o.label ?? o.value;
}

export interface TranslatableEntry {
  key: string;
  german: string;
  // Human-readable hint pointing at the source location, e.g.
  // "Schritt 'Annehmende' → Feld 'vorname' → Label".
  context: string;
}

export function collectTranslatableEntries(schema: FormSchema): TranslatableEntry[] {
  const entries: TranslatableEntry[] = [];
  const push = (key: string, german: string | undefined, context: string) => {
    if (german !== undefined && german !== null && german !== '') {
      entries.push({ key, german, context });
    }
  };

  push('dialog.title', schema.title, 'Dialog → Titel');
  push('dialog.description', schema.description, 'Dialog → Beschreibung');

  for (const step of schema.steps) {
    const stepLabel = `Schritt „${step.title}"`;
    push(`step.${step.id}.title`, step.title, `${stepLabel} → Titel`);
    push(`step.${step.id}.description`, step.description, `${stepLabel} → Beschreibung`);
    collectFieldEntries(step.fields, '', stepLabel, entries);
  }

  return entries;
}

function collectFieldEntries(
  fields: FormField[],
  pathPrefix: string,
  contextPrefix: string,
  out: TranslatableEntry[],
): void {
  for (const f of fields) {
    const prefix = `${pathPrefix}field.${f.id}`;
    const ctx = `${contextPrefix} → Feld „${f.label || f.id}"`;
    if (f.label) out.push({ key: `${prefix}.label`, german: f.label, context: `${ctx} → Label` });
    if ('placeholder' in f && typeof f.placeholder === 'string' && f.placeholder !== '') {
      out.push({ key: `${prefix}.placeholder`, german: f.placeholder, context: `${ctx} → Placeholder` });
    }
    if (f.helpText) out.push({ key: `${prefix}.helpText`, german: f.helpText, context: `${ctx} → Hilfetext` });
    if (f.type === 'checkbox') {
      out.push({ key: `${prefix}.checkboxLabel`, german: f.checkboxLabel, context: `${ctx} → Checkbox-Label` });
    }
    if (f.type === 'info') {
      out.push({ key: `${prefix}.text`, german: f.text, context: `${ctx} → Info-Text` });
    }
    if (f.type === 'select' || f.type === 'radio' || f.type === 'multi-select') {
      for (const opt of f.options) {
        out.push({
          key: `${prefix}.option.${optionValue(opt)}`,
          german: optionLabel(opt),
          context: `${ctx} → Option „${optionLabel(opt)}"`,
        });
      }
    }
    if (f.type === 'scale') {
      if (f.minLabel) out.push({ key: `${prefix}.minLabel`, german: f.minLabel, context: `${ctx} → Skala min` });
      if (f.maxLabel) out.push({ key: `${prefix}.maxLabel`, german: f.maxLabel, context: `${ctx} → Skala max` });
    }
    if (f.type === 'yesno') {
      if (f.yesLabel) out.push({ key: `${prefix}.yesLabel`, german: f.yesLabel, context: `${ctx} → Ja-Label` });
      if (f.noLabel) out.push({ key: `${prefix}.noLabel`, german: f.noLabel, context: `${ctx} → Nein-Label` });
    }
    if (f.type === 'number' || f.type === 'calculation') {
      if (f.prefix) out.push({ key: `${prefix}.prefix`, german: f.prefix, context: `${ctx} → Präfix` });
      if (f.suffix) out.push({ key: `${prefix}.suffix`, german: f.suffix, context: `${ctx} → Suffix` });
    }
    if (f.type === 'repeater') {
      if (Array.isArray(f.extraFields)) {
        collectFieldEntries(f.extraFields, `${prefix}.`, ctx, out);
      }
      if (Array.isArray(f.fields)) {
        collectFieldEntries(f.fields, `${prefix}.`, ctx, out);
      }
    }
    // Personen-Container: Zusatzfelder gehoeren wie Repeater-Extras unter den
    // verschachtelten Praefix, sonst fehlen sie im Uebersetzungs-Editor.
    if (f.type === 'person' || f.type === 'natural-person' || f.type === 'legal-person') {
      if (Array.isArray(f.extraFields)) {
        collectFieldEntries(f.extraFields, `${prefix}.`, ctx, out);
      }
    }
    // Angepasste Vorlagenfelder — bei Repeatern und Personen-Containern gleich.
    if (f.type === 'repeater' || f.type === 'person'
        || f.type === 'natural-person' || f.type === 'legal-person') {
      for (const [innerId, ov] of Object.entries(f.fieldOverrides ?? {})) {
        if (ov.label) {
          out.push({
            key: `${prefix}.field.${innerId}.label`,
            german: ov.label,
            context: `${ctx} → Vorlagenfeld „${innerId}" → Label`,
          });
        }
        if (ov.helpText) {
          out.push({
            key: `${prefix}.field.${innerId}.helpText`,
            german: ov.helpText,
            context: `${ctx} → Vorlagenfeld „${innerId}" → Hilfetext`,
          });
        }
      }
    }
  }
}
