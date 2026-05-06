import { useEffect, useMemo } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import type { CalculationField as CalculationFieldType } from '../../types/schema';
import { useCondition } from '../../hooks/useCondition';
import { FieldWrapper } from './FieldWrapper';
import { evaluateFormula, formatResult } from '../../lib/calculation';

interface Props {
  field: CalculationFieldType;
  prefix?: string;
}

// Resolves a field id to its current form value. If the calculation field
// lives inside a repeater (`prefix` is set), references with no leading
// "/" are resolved relative to that prefix; an absolute path can be
// expressed as "/fieldId.subFieldId".
function buildResolver(values: Record<string, unknown>, prefix?: string) {
  return (fieldId: string): unknown => {
    if (!fieldId) return undefined;
    let path = fieldId;
    let scope: Record<string, unknown> = values;
    if (path.startsWith('/')) {
      path = path.slice(1);
    } else if (prefix) {
      const root = prefix.split('.').reduce<unknown>((obj, key) => {
        if (obj && typeof obj === 'object') return (obj as Record<string, unknown>)[key];
        return undefined;
      }, values);
      if (root && typeof root === 'object') scope = root as Record<string, unknown>;
    }
    return path.split('.').reduce<unknown>((obj, key) => {
      if (obj && typeof obj === 'object') return (obj as Record<string, unknown>)[key];
      return undefined;
    }, scope);
  };
}

export function CalculationField({ field, prefix }: Props) {
  const visible = useCondition(field.condition, prefix);
  const { setValue } = useFormContext();
  // useWatch with no name returns ALL form values; we re-evaluate whenever
  // anything changes. Cheap enough for the tiny formulas these fields use.
  const values = useWatch() as Record<string, unknown>;

  const resolved = useMemo(() => {
    if (!visible) return null;
    const resolver = buildResolver(values, prefix);
    return evaluateFormula(field.steps ?? [], resolver);
  }, [visible, values, prefix, field.steps]);

  // Mirror the computed value into the form state so it ends up in the
  // submission payload (rounded to the configured decimals, stored as a
  // plain number – the `formatResult` text is for display only).
  const numericValue = resolved?.value ?? null;
  const fieldName = prefix ? `${prefix}.${field.id}` : field.id;
  useEffect(() => {
    if (!visible) {
      setValue(fieldName, undefined, { shouldDirty: false, shouldValidate: false });
      return;
    }
    if (numericValue === null) {
      setValue(fieldName, undefined, { shouldDirty: false, shouldValidate: false });
    } else {
      const decimals = field.decimals ?? 2;
      const finalValue = (field.asPercent ? numericValue * 100 : numericValue);
      const rounded = Math.round(finalValue * Math.pow(10, decimals)) / Math.pow(10, decimals);
      setValue(fieldName, rounded, { shouldDirty: false, shouldValidate: false });
    }
  }, [visible, numericValue, fieldName, field.decimals, field.asPercent, setValue]);

  if (!visible) return null;

  const incomplete = numericValue === null;
  if (incomplete && field.hideIfIncomplete) return null;

  const display = numericValue === null ? '' : formatResult(numericValue, field);

  return (
    <FieldWrapper label={field.label} required={false} helpText={field.helpText}>
      <div className="flex items-center w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50 text-gray-800">
        {display ? (
          <span className="font-mono">{display}</span>
        ) : (
          <span className="text-gray-400 italic">
            Wird berechnet, sobald alle Eingaben gefüllt sind …
          </span>
        )}
      </div>
    </FieldWrapper>
  );
}
