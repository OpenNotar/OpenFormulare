import { useFormContext, useWatch } from 'react-hook-form';
import type { DateField as DateFieldType } from '../../types/schema';
import { useCondition } from '../../hooks/useCondition';
import { FieldWrapper } from './FieldWrapper';
import { getNestedError } from './utils';

interface Props {
  field: DateFieldType;
  prefix?: string;
}

const MIN_YEAR = 1900;
const MAX_FUTURE_YEARS = 10;

function validateDate(value: string): string | true {
  if (!value) return true;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return 'Bitte ein gültiges Datum eingeben';
  const year = Number(match[1]);
  const currentYear = new Date().getFullYear();
  if (year < MIN_YEAR) return `Das Jahr muss ab ${MIN_YEAR} liegen`;
  if (year > currentYear + MAX_FUTURE_YEARS) {
    return `Bitte ein realistisches Datum eingeben (höchstens ${currentYear + MAX_FUTURE_YEARS})`;
  }
  return true;
}

function isFuture(value: string | undefined): boolean {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date.getTime() > today.getTime();
}

export function DateField({ field, prefix }: Props) {
  const visible = useCondition(field.condition, prefix);
  const { register, formState: { errors } } = useFormContext();
  const name = prefix ? `${prefix}.${field.id}` : field.id;
  const value = useWatch({ name }) as string | undefined;

  if (!visible) return null;

  const error = getNestedError(errors, name);
  const futureHint = !error && isFuture(value);

  return (
    <FieldWrapper label={field.label} required={field.required} helpText={field.helpText} error={error?.message as string}>
      <input
        type="date"
        min={`${MIN_YEAR}-01-01`}
        max={`${new Date().getFullYear() + MAX_FUTURE_YEARS}-12-31`}
        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        {...register(name, {
          required: field.required ? 'Pflichtfeld' : false,
          validate: validateDate,
        })}
      />
      {futureHint && (
        <p className="mt-1 text-xs text-amber-600">
          Hinweis: Das eingegebene Datum liegt in der Zukunft. Bitte prüfen Sie, ob das gewollt ist.
        </p>
      )}
    </FieldWrapper>
  );
}
