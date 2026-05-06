// Multi-select rendered as a list of checkboxes. Stores the selected
// values as a string[] – combine with the `contains` / `notContains`
// condition operators for downstream conditional fields.

import { Controller, useFormContext } from 'react-hook-form';
import type { MultiSelectField as MultiSelectFieldType } from '../../types/schema';
import { resolveOption } from '../../types/schema';
import { useCondition, evaluateCondition } from '../../hooks/useCondition';
import { interpolate } from '../../hooks/useInterpolated';
import { FieldWrapper } from './FieldWrapper';
import { getNestedError } from './utils';

interface Props {
  field: MultiSelectFieldType;
  prefix?: string;
}

export function MultiSelectField({ field, prefix }: Props) {
  const visible = useCondition(field.condition, prefix);
  const { control, formState: { errors }, watch } = useFormContext();
  if (!visible) return null;

  const name = prefix ? `${prefix}.${field.id}` : field.id;
  const error = getNestedError(errors, name);
  const allValues = watch();
  const visibleOptions = field.options
    .map(resolveOption)
    .filter((opt) => evaluateCondition(opt.condition, allValues, prefix));

  return (
    <FieldWrapper label={field.label} required={field.required} helpText={field.helpText} error={error?.message as string}>
      <Controller
        control={control}
        name={name}
        defaultValue={[]}
        rules={{
          validate: (value: unknown) => {
            const arr = Array.isArray(value) ? value : [];
            if (field.required && arr.length === 0) return 'Pflichtfeld';
            if (typeof field.minSelected === 'number' && arr.length < field.minSelected) {
              return `Bitte mindestens ${field.minSelected} auswählen`;
            }
            if (typeof field.maxSelected === 'number' && arr.length > field.maxSelected) {
              return `Bitte höchstens ${field.maxSelected} auswählen`;
            }
            return true;
          },
        }}
        render={({ field: rhf }) => {
          const selected: string[] = Array.isArray(rhf.value) ? rhf.value : [];
          const toggle = (value: string) => {
            const next = selected.includes(value)
              ? selected.filter((v) => v !== value)
              : [...selected, value];
            rhf.onChange(next);
          };
          return (
            <div className={`flex gap-3 flex-wrap ${field.layout === 'horizontal' ? 'flex-row' : 'flex-col'}`}>
              {visibleOptions.map((opt) => {
                const checked = selected.includes(opt.value);
                const display = interpolate(opt.label ?? opt.value, allValues, prefix);
                return (
                  <label key={opt.value} className="flex items-start gap-2 cursor-pointer text-sm text-gray-700">
                    <input
                      type="checkbox"
                      className="mt-0.5 accent-primary w-4 h-4 shrink-0"
                      checked={checked}
                      onChange={() => toggle(opt.value)}
                    />
                    <span>{display}</span>
                  </label>
                );
              })}
            </div>
          );
        }}
      />
    </FieldWrapper>
  );
}
