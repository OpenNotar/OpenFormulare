import { Controller, useFormContext } from 'react-hook-form';
import type {
  StarsField as StarsFieldType,
  ScaleField as ScaleFieldType,
  YesNoField as YesNoFieldType,
} from '../../types/schema';
import { useCondition } from '../../hooks/useCondition';
import { FieldWrapper } from './FieldWrapper';
import { getNestedError } from './utils';

/**
 * Bewertungs-Felder fuer eigenstaendige OF-Dialoge sowie DiNo-Bewertungsboegen.
 * Die Werte:
 *   - stars/scale → number (gewählter numerischer Wert)
 *   - yesno       → 'yes' | 'no' (string fuer einheitliches Verhalten mit
 *                                 select/radio in conditions/export)
 *
 * Validierung: required = Pflichtfeld (kein Wert gesetzt).
 */

// ---------------- Stars ----------------
interface StarsProps {
  field: StarsFieldType;
  prefix?: string;
}

export function StarsField({ field, prefix }: StarsProps) {
  const visible = useCondition(field.condition, prefix);
  const { control, formState: { errors } } = useFormContext();
  if (!visible) return null;

  const name = prefix ? `${prefix}.${field.id}` : field.id;
  const error = getNestedError(errors, name);
  const max = field.maxStars ?? 5;
  const stars = Array.from({ length: max }, (_, i) => i + 1);

  return (
    <FieldWrapper
      label={field.label}
      required={field.required}
      helpText={field.helpText}
      error={error?.message as string}
    >
      <Controller
        name={name}
        control={control}
        rules={{
          validate: (v) =>
            field.required && (v === undefined || v === null || v === '')
              ? 'Pflichtfeld'
              : true,
        }}
        render={({ field: { value, onChange } }) => {
          const current = typeof value === 'number' ? value : null;
          return (
            <div className="flex items-center gap-1">
              {stars.map((n) => {
                const active = current != null && n <= current;
                return (
                  <button
                    key={n}
                    type="button"
                    aria-label={`${n} von ${max} Sternen`}
                    onClick={() => onChange(n)}
                    className={`text-3xl leading-none transition-colors ${
                      active ? 'text-amber-500' : 'text-gray-300 hover:text-amber-300'
                    }`}
                  >
                    ★
                  </button>
                );
              })}
              {current != null && (
                <span className="ml-2 text-sm text-gray-500">
                  {current}/{max}
                </span>
              )}
            </div>
          );
        }}
      />
    </FieldWrapper>
  );
}

// ---------------- Scale ----------------
interface ScaleProps {
  field: ScaleFieldType;
  prefix?: string;
}

export function ScaleField({ field, prefix }: ScaleProps) {
  const visible = useCondition(field.condition, prefix);
  const { control, formState: { errors } } = useFormContext();
  if (!visible) return null;

  const name = prefix ? `${prefix}.${field.id}` : field.id;
  const error = getNestedError(errors, name);
  const min = field.min ?? 1;
  const max = field.max ?? 10;
  const items: number[] = [];
  for (let i = min; i <= max; i++) items.push(i);

  return (
    <FieldWrapper
      label={field.label}
      required={field.required}
      helpText={field.helpText}
      error={error?.message as string}
    >
      <Controller
        name={name}
        control={control}
        rules={{
          validate: (v) =>
            field.required && (v === undefined || v === null || v === '')
              ? 'Pflichtfeld'
              : true,
        }}
        render={({ field: { value, onChange } }) => {
          const current = typeof value === 'number' ? value : null;
          return (
            <div>
              {(field.minLabel || field.maxLabel) && (
                <div className="flex justify-between text-xs text-gray-500 mb-1 px-1">
                  <span>{field.minLabel ?? ''}</span>
                  <span>{field.maxLabel ?? ''}</span>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {items.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => onChange(n)}
                    className={`min-w-[2.5rem] h-10 rounded border px-3 text-sm font-medium transition-colors ${
                      current === n
                        ? 'border-primary bg-primary text-white'
                        : 'border-gray-300 bg-white text-gray-700 hover:border-primary'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          );
        }}
      />
    </FieldWrapper>
  );
}

// ---------------- Yes/No ----------------
interface YesNoProps {
  field: YesNoFieldType;
  prefix?: string;
}

export function YesNoField({ field, prefix }: YesNoProps) {
  const visible = useCondition(field.condition, prefix);
  const { control, formState: { errors } } = useFormContext();
  if (!visible) return null;

  const name = prefix ? `${prefix}.${field.id}` : field.id;
  const error = getNestedError(errors, name);
  const yesLabel = field.yesLabel ?? 'Ja';
  const noLabel = field.noLabel ?? 'Nein';

  return (
    <FieldWrapper
      label={field.label}
      required={field.required}
      helpText={field.helpText}
      error={error?.message as string}
    >
      <Controller
        name={name}
        control={control}
        rules={{
          validate: (v) =>
            field.required && (v === undefined || v === null || v === '')
              ? 'Pflichtfeld'
              : true,
        }}
        render={({ field: { value, onChange } }) => (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onChange('yes')}
              className={`px-4 py-2 rounded border text-sm font-medium transition-colors ${
                value === 'yes'
                  ? 'border-primary bg-primary text-white'
                  : 'border-gray-300 bg-white text-gray-700 hover:border-primary'
              }`}
            >
              {yesLabel}
            </button>
            <button
              type="button"
              onClick={() => onChange('no')}
              className={`px-4 py-2 rounded border text-sm font-medium transition-colors ${
                value === 'no'
                  ? 'border-primary bg-primary text-white'
                  : 'border-gray-300 bg-white text-gray-700 hover:border-primary'
              }`}
            >
              {noLabel}
            </button>
          </div>
        )}
      />
    </FieldWrapper>
  );
}
