import { useFormContext } from 'react-hook-form';
import type { CheckboxField as CheckboxFieldType } from '../../types/schema';
import { useCondition } from '../../hooks/useCondition';
import { getNestedError } from './utils';

interface Props {
  field: CheckboxFieldType;
  prefix?: string;
}

export function CheckboxField({ field, prefix }: Props) {
  const visible = useCondition(field.condition, prefix);
  const { register, formState: { errors } } = useFormContext();
  if (!visible) return null;

  const name = prefix ? `${prefix}.${field.id}` : field.id;
  const error = getNestedError(errors, name);

  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-start gap-3 cursor-pointer group">
        <input
          type="checkbox"
          className="mt-0.5 accent-primary w-4 h-4 shrink-0"
          {...register(name, { required: field.required ? 'Pflichtfeld' : false })}
        />
        <span className="text-sm text-gray-700 leading-snug">
          {field.checkboxLabel}
          {field.required && <span className="text-red-500 ml-1">*</span>}
        </span>
      </label>
      {error && <p className="text-xs text-red-500 ml-7">{error.message as string}</p>}
    </div>
  );
}
