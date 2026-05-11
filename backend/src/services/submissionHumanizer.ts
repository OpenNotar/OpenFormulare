// Wandelt eine rohe Submission (Record<string, unknown>) in eine menschen-
// lesbare Sicht um. Für Plugin-Felder wird die rohe Repräsentation (häufig
// ein JSON-Blob wie {"start":...,"end":...,"slotTypeLabel":"..."}) durch den
// Output des plugin-eigenen `formatValue`-Callbacks ersetzt. Eingebaute
// Feld-Typen bleiben unverändert; PDF/DOCX-Renderer formatieren sie ohnehin
// separat. So bekommen Empfänger des JSON-Anhangs (und der Debug-Dumps)
// eine klare textuelle Sicht statt eines Roh-Payloads.

import type { FormSchema } from '../db/types/schema';
import { registry as pluginRegistry } from '../plugins/registry';

// Eingebaute Feld-Typen, die wir NICHT humanisieren — die kennen das Core und
// rendern sie an anderer Stelle bereits passend (z. B. PDF/DOCX-Renderer).
// Alles andere gilt als plugin-contributed: wir versuchen den Plugin-Formatter
// und fallen sonst auf den Roh-Wert zurück.
const BUILT_IN_TYPES = new Set([
  'text', 'email', 'tel', 'number', 'textarea', 'date',
  'select', 'radio', 'multi-select', 'checkbox', 'file',
  'repeater', 'address', 'business-address', 'info',
  'person', 'natural-person', 'legal-person',
  'calculation', 'embed',
  'stars', 'scale', 'yesno',
]);

interface SchemaField {
  id: string;
  label?: string;
  type: string;
  fields?: SchemaField[];
}

function humanizeField(
  field: SchemaField,
  source: Record<string, unknown>,
  target: Record<string, unknown>,
): void {
  const value = source[field.id];
  if (value === undefined) return;

  if (field.type === 'repeater' && value && typeof value === 'object') {
    // Repeater speichert die Einträge als numerisch-indizierte Objekt-Keys.
    const entries = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, item] of Object.entries(entries)) {
      if (item && typeof item === 'object') {
        const innerTarget: Record<string, unknown> = {};
        for (const sub of field.fields ?? []) {
          humanizeField(sub, item as Record<string, unknown>, innerTarget);
        }
        out[k] = innerTarget;
      } else {
        out[k] = item;
      }
    }
    target[field.id] = out;
    return;
  }

  if (!BUILT_IN_TYPES.has(field.type)) {
    const formatted = pluginRegistry.formatPluginFieldValue(field.type, value, {
      id: field.id,
      label: field.label ?? field.id,
      type: field.type,
    });
    target[field.id] = formatted ?? value;
    return;
  }

  target[field.id] = value;
}

export function humanizeSubmission(
  data: Record<string, unknown>,
  schema: FormSchema,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data };
  for (const step of schema.steps ?? []) {
    for (const field of step.fields ?? []) {
      humanizeField(field as SchemaField, data, out);
    }
  }
  return out;
}
