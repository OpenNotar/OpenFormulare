// Lightweight templating for label / helpText / option text. Replaces
// `{feldId}` placeholders with the live form value, so a label like
// "Wohnt überwiegend bei {p1_vorname} {p1_nachname}" reads as
// "Wohnt überwiegend bei Anna Müller" once Person 1 has been filled in.
//
// Path semantics:
//   - relative (`feldId`): resolved against the current FieldPrefixContext
//     (so embed/repeater scopes work automatically)
//   - absolute (`/feldId.subfield`): resolved from the form root
//
// Missing/empty values render as an empty string – callers that want a
// fallback can write the entire literal (e.g. just "Person 1" without
// braces) instead.

import { createContext, useContext } from 'react';
import { useFormContext } from 'react-hook-form';

export const FieldPrefixContext = createContext<string | undefined>(undefined);

function readPath(values: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((obj, k) => {
    if (obj && typeof obj === 'object') return (obj as Record<string, unknown>)[k];
    return undefined;
  }, values);
}

export function interpolate(text: string, values: unknown, prefix?: string): string {
  if (!text || !text.includes('{')) return text;
  return text.replace(/\{([^}]+)\}/g, (_match, ref: string) => {
    const path = ref.trim();
    if (!path) return '';
    let key: string;
    if (path.startsWith('/')) {
      key = path.slice(1);
    } else {
      key = prefix ? `${prefix}.${path}` : path;
    }
    const v = readPath(values, key);
    if (v === undefined || v === null || v === '') return '';
    if (typeof v === 'object') return '';
    return String(v);
  });
}

export function useInterpolated(text: string | undefined): string | undefined {
  const prefix = useContext(FieldPrefixContext);
  const ctx = useFormContext();
  // Allow usage outside a FormProvider (e.g. in editor previews where no
  // form context exists) – just return the raw text in that case.
  if (!text || !ctx || !text.includes('{')) return text;
  return interpolate(text, ctx.watch(), prefix);
}
