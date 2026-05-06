// Renderer for `embed` fields. Pulls the steps of the referenced dialog
// at runtime and inlines them. The embedded data lives under the embed
// field's id (e.g. `hr_data.firma`), so the host's own field IDs don't
// collide with the embedded ones.
//
// Conditions inside the embedded dialog:
//   - relative `fieldId` (e.g. "rechtsform") resolves to `<embedId>.rechtsform`
//   - absolute `fieldId` ("/...") resolves to the form root
// This is the same convention used by `RepeaterField`, so no special
// case handling is needed in `useCondition`.

import { createContext, useContext } from 'react';
import type { EmbedField as EmbedFieldType, FormField } from '../../types/schema';
import { useCondition } from '../../hooks/useCondition';
import { useDialog } from '../../hooks/useDialog';
import { FieldRenderer } from '../FieldRenderer';
import { FieldWrapper } from './FieldWrapper';

interface Props {
  field: EmbedFieldType;
  prefix?: string;
}

// Tracks the currently-embedded dialog ids in the React tree so an embed
// chain can never recurse into itself (e.g. dialog A embeds B embeds A).
const EmbedDepthContext = createContext<string[]>([]);

const MAX_DEPTH = 4;

export function EmbedField({ field, prefix }: Props) {
  const visible = useCondition(field.condition, prefix);
  const ancestors = useContext(EmbedDepthContext);

  if (!visible) return null;
  if (!field.dialogId) {
    return (
      <FieldWrapper label={field.label}>
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          Embed-Feld konfigurieren: Es ist noch kein Dialog ausgewählt.
        </p>
      </FieldWrapper>
    );
  }
  if (ancestors.includes(field.dialogId) || ancestors.length >= MAX_DEPTH) {
    return (
      <FieldWrapper label={field.label}>
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          Rekursion erkannt – „{field.dialogId}" ist bereits eingebettet.
        </p>
      </FieldWrapper>
    );
  }

  return <EmbedBody field={field} prefix={prefix} ancestors={ancestors} />;
}

interface BodyProps extends Props {
  ancestors: string[];
}

function EmbedBody({ field, prefix, ancestors }: BodyProps) {
  const { dialog, error, loading } = useDialog(field.dialogId);

  const embedName = prefix ? `${prefix}.${field.id}` : field.id;
  const nextAncestors = [...ancestors, field.dialogId];

  return (
    <FieldWrapper label={field.label} required={false} helpText={field.helpText}>
      {loading && (
        <p className="text-xs text-gray-400 italic">Wird geladen …</p>
      )}
      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          Dialog „{field.dialogId}" konnte nicht geladen werden: {error}
        </p>
      )}
      {dialog && (
        <EmbedDepthContext.Provider value={nextAncestors}>
          <div className="rounded-lg border border-blue-200 bg-blue-50/30 p-4 space-y-6">
            {dialog.steps
              .filter((step) => step.id !== 'kontakt')
              .filter((step) => !field.stepIds || field.stepIds.length === 0 || field.stepIds.includes(step.id))
              .map((step) => (
                <div key={step.id} className="space-y-4">
                  <h4 className="text-sm font-semibold text-blue-900 pb-2 border-b border-blue-200">
                    {step.title}
                  </h4>
                  <div className="space-y-4">
                    {step.fields.map((f: FormField) => (
                      <FieldRenderer key={f.id} field={f} prefix={embedName} />
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </EmbedDepthContext.Provider>
      )}
    </FieldWrapper>
  );
}
