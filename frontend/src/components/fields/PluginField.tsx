// Generic renderer for plugin-contributed field types.
//
// Plugins describe their fields via metadata (id, label, behavior). At render
// time we look up the metadata in the in-memory cache and render the field
// using a built-in HTML control matching the behavior. This lets plugin
// authors add new field *types* (with their own id) without shipping React
// code that runs in the OpenFormulare frontend.
//
// Anything beyond the basic shapes covered here (text/number/textarea/select/
// checkbox/date) requires bundling a custom React component – planned for a
// future "plugin frontend extensions" milestone.

import { useEffect, useState } from 'react';
import { useFormContext } from 'react-hook-form';

import type { FormField } from '../../types/schema';
import {
  listPluginFieldTypes,
  type PluginFieldTypeInfo,
} from '../../lib/pluginsApi';
import { FieldWrapper } from './FieldWrapper';
import { getNestedError } from './utils';
import { CalendarField } from './CalendarField';
import { useI18n } from '../../i18n/context';

interface Props {
  field: FormField;
  prefix?: string;
}

export function PluginField({ field, prefix }: Props) {
  const { register, formState: { errors } } = useFormContext();
  const { t } = useI18n();
  const [info, setInfo] = useState<PluginFieldTypeInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    listPluginFieldTypes().then((types) => {
      if (cancelled) return;
      const match = types.find((t) => t.id === field.type) ?? null;
      setInfo(match);
    });
    return () => { cancelled = true; };
  }, [field.type]);

  const name = prefix ? `${prefix}.${field.id}` : field.id;
  const error = getNestedError(errors, name);
  const behavior = info?.behavior ?? 'text';

  // Calendar behaviour gets a dedicated picker component – no generic
  // fallback path. Also catch the well-known plugin field-type ids so the
  // calendar field works even before the registry has loaded.
  const fieldTypeStr = field.type as string;
  if (
    behavior === 'calendar' ||
    fieldTypeStr === 'terminfindung' ||
    fieldTypeStr === 'calendar'
  ) {
    return <CalendarField field={field} prefix={prefix} />;
  }

  // Common props shared by every fallback shape.
  const reg = register(name, {
    required: field.required ? t('required') : false,
  });

  const baseClass =
    'w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:bg-gray-50';

  // Field types are a union; `placeholder` and `options` only exist on
  // some members, so we narrow via `as` to a generic shape.
  const generic = field as unknown as {
    placeholder?: string;
    options?: Array<{ value: string; label: string }>;
  };

  let control: JSX.Element;
  switch (behavior) {
    case 'number':
      control = <input type="number" className={baseClass} placeholder={generic.placeholder} {...reg} />;
      break;
    case 'textarea':
      control = <textarea className={baseClass} rows={4} placeholder={generic.placeholder} {...reg} />;
      break;
    case 'checkbox':
      control = (
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" {...reg} /> {field.label}
        </label>
      );
      break;
    case 'date':
      control = <input type="date" className={baseClass} {...reg} />;
      break;
    case 'select':
      control = (
        <select className={baseClass} {...reg}>
          <option value="">— {t('pleaseSelect')} —</option>
          {(generic.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      );
      break;
    case 'text':
    default:
      control = <input type="text" className={baseClass} placeholder={generic.placeholder} {...reg} />;
  }

  if (behavior === 'checkbox') {
    return (
      <FieldWrapper label="" required={field.required} helpText={field.helpText} error={error?.message as string}>
        {control}
      </FieldWrapper>
    );
  }

  return (
    <FieldWrapper label={field.label} required={field.required} helpText={field.helpText} error={error?.message as string}>
      {control}
    </FieldWrapper>
  );
}
