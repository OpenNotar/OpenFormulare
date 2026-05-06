import { useFormContext } from 'react-hook-form';
import type { RadioField as RadioFieldType } from '../../types/schema';
import { resolveOption } from '../../types/schema';
import { useCondition, evaluateCondition } from '../../hooks/useCondition';
import { interpolate } from '../../hooks/useInterpolated';
import { FieldWrapper } from './FieldWrapper';
import { getNestedError } from './utils';

interface Props {
  field: RadioFieldType;
  prefix?: string;
}

export function RadioField({ field, prefix }: Props) {
  const visible = useCondition(field.condition, prefix);
  const { register, formState: { errors }, watch } = useFormContext();
  if (!visible) return null;

  const name = prefix ? `${prefix}.${field.id}` : field.id;
  const error = getNestedError(errors, name);

  // Filter options whose per-option condition does not match.
  const allValues = watch();
  const visibleOptions = field.options
    .map(resolveOption)
    .filter((opt) => evaluateCondition(opt.condition, allValues, prefix));

  return (
    <FieldWrapper label={field.label} required={field.required} helpText={field.helpText} error={error?.message as string}>
      <div className={`flex gap-4 flex-wrap ${field.layout === 'vertical' ? 'flex-col gap-2' : 'flex-row'}`}>
        {visibleOptions.map((opt) => {
          const display = interpolate(opt.label ?? opt.value, allValues, prefix);
          return (
            <label key={opt.value} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
              <input
                type="radio"
                value={opt.value}
                className="accent-primary w-4 h-4"
                {...register(name, { required: field.required ? 'Pflichtfeld' : false })}
              />
              {display}
            </label>
          );
        })}
      </div>
    </FieldWrapper>
  );
}
