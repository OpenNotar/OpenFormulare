import { useFormContext } from 'react-hook-form';
import type { SelectField as SelectFieldType } from '../../types/schema';
import { resolveOption } from '../../types/schema';
import { useCondition, evaluateCondition } from '../../hooks/useCondition';
import { useI18n } from '../../i18n/context';
import { interpolate } from '../../hooks/useInterpolated';
import { FieldWrapper } from './FieldWrapper';
import { getNestedError } from './utils';

interface Props {
  field: SelectFieldType;
  prefix?: string;
}

export function SelectField({ field, prefix }: Props) {
  const visible = useCondition(field.condition, prefix);
  const { register, formState: { errors }, watch } = useFormContext();
  const { t } = useI18n();
  if (!visible) return null;

  const name = prefix ? `${prefix}.${field.id}` : field.id;
  const error = getNestedError(errors, name);

  const allValues = watch();
  const visibleOptions = field.options
    .map(resolveOption)
    .filter((opt) => evaluateCondition(opt.condition, allValues, prefix));

  return (
    <FieldWrapper label={field.label} required={field.required} helpText={field.helpText} error={error?.message as string}>
      <select
        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white"
        {...register(name, { required: field.required ? t('required') : false })}
      >
        <option value="">{field.placeholder || t('pleaseSelect')}</option>
        {visibleOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {interpolate(opt.label ?? opt.value, allValues, prefix)}
          </option>
        ))}
      </select>
    </FieldWrapper>
  );
}
