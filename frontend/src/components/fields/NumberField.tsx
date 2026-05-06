import { useFormContext } from 'react-hook-form';
import type { NumberField as NumberFieldType } from '../../types/schema';
import { useCondition } from '../../hooks/useCondition';
import { FieldWrapper } from './FieldWrapper';
import { getNestedError } from './utils';

interface Props {
  field: NumberFieldType;
  prefix?: string;
}

function presetSuffix(field: NumberFieldType): string | undefined {
  if (field.suffix) return field.suffix;
  switch (field.format) {
    case 'euro': return '€';
    case 'dm': return 'DM';
    case 'percent': return '%';
    default: return undefined;
  }
}

function stepFor(decimals: number): string {
  if (decimals <= 0) return '1';
  return `0.${'0'.repeat(decimals - 1)}1`;
}

export function NumberField({ field, prefix }: Props) {
  const visible = useCondition(field.condition, prefix);
  const { register, formState: { errors }, getValues, setValue } = useFormContext();
  if (!visible) return null;

  const name = prefix ? `${prefix}.${field.id}` : field.id;
  const error = getNestedError(errors, name);
  const decimals = field.decimals ?? 2;
  const suffix = presetSuffix(field);
  const showPrefix = !!field.prefix;
  const showSuffix = !!suffix;

  // On blur: snap the value to the configured number of decimals so the
  // submission payload matches what the user sees. Empty stays empty.
  function handleBlur() {
    const raw = getValues(name);
    if (raw === undefined || raw === null || raw === '') return;
    const num = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'));
    if (!Number.isFinite(num)) return;
    const factor = Math.pow(10, decimals);
    const rounded = Math.round(num * factor) / factor;
    if (rounded !== raw) setValue(name, rounded, { shouldDirty: false, shouldValidate: false });
  }

  return (
    <FieldWrapper label={field.label} required={field.required} helpText={field.helpText} error={error?.message as string}>
      <div className={`flex items-stretch w-full border rounded-md transition-colors focus-within:ring-2 focus-within:ring-primary focus-within:border-transparent ${error ? 'border-red-300' : 'border-gray-300'}`}>
        {showPrefix && (
          <span className="px-3 py-2 text-sm text-gray-500 bg-gray-50 border-r border-gray-200 rounded-l-md">
            {field.prefix}
          </span>
        )}
        <input
          type="number"
          inputMode="decimal"
          step={stepFor(decimals)}
          min={field.min}
          max={field.max}
          placeholder={field.placeholder}
          className="flex-1 min-w-0 px-3 py-2 text-sm bg-transparent rounded-md focus:outline-none disabled:bg-gray-50"
          {...register(name, {
            required: field.required ? 'Pflichtfeld' : false,
            valueAsNumber: true,
            ...(typeof field.min === 'number' && { min: { value: field.min, message: `Mindestens ${field.min}` } }),
            ...(typeof field.max === 'number' && { max: { value: field.max, message: `Höchstens ${field.max}` } }),
            onBlur: handleBlur,
          })}
        />
        {showSuffix && (
          <span className="px-3 py-2 text-sm text-gray-500 bg-gray-50 border-l border-gray-200 rounded-r-md">
            {suffix}
          </span>
        )}
      </div>
    </FieldWrapper>
  );
}
