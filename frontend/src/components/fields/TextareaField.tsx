import { useFormContext } from 'react-hook-form';
import type { TextareaField as TextareaFieldType } from '../../types/schema';
import { useCondition } from '../../hooks/useCondition';
import { FieldWrapper } from './FieldWrapper';
import { getNestedError } from './utils';

interface Props {
  field: TextareaFieldType;
  prefix?: string;
}

export function TextareaField({ field, prefix }: Props) {
  const visible = useCondition(field.condition, prefix);
  const { register, formState: { errors } } = useFormContext();
  if (!visible) return null;

  const name = prefix ? `${prefix}.${field.id}` : field.id;
  const error = getNestedError(errors, name);

  return (
    <FieldWrapper label={field.label} required={field.required} helpText={field.helpText} error={error?.message as string}>
      <textarea
        rows={field.rows ?? 4}
        placeholder={field.placeholder}
        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-y"
        {...register(name, { required: field.required ? 'Pflichtfeld' : false })}
      />
    </FieldWrapper>
  );
}
