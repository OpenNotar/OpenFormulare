import { useEffect, useMemo } from 'react';
import { useFieldArray, useFormContext } from 'react-hook-form';
import type { FormField, RepeaterField as RepeaterFieldType, PersonFieldOverrides } from '../../types/schema';
import { useCondition } from '../../hooks/useCondition';
import { FieldRenderer } from '../FieldRenderer';
import { FieldWrapper } from './FieldWrapper';
import { usePersonTemplates } from '../../hooks/usePersonTemplates';

interface Props {
  field: RepeaterFieldType;
  prefix?: string;
}

// Apply per-template-field `required` overrides. Same shape as PersonField.
function applyOverrides(template: FormField[], overrides?: PersonFieldOverrides): FormField[] {
  if (!overrides) return template;
  return template
    .filter((f) => overrides[f.id]?.hidden !== true)
    .map((f) => {
      const o = overrides[f.id];
      if (!o) return f;
      return {
        ...f,
        ...(o.required !== undefined ? { required: o.required } : {}),
        ...(o.label ? { label: o.label } : {}),
        ...(o.helpText ? { helpText: o.helpText } : {}),
      } as FormField;
    });
}

// Legacy helper – still used to honour `addressRequired === false` from old
// data. New repeaters express the same intent via fieldOverrides.
function overrideAddressRequired(fields: FormField[], required: boolean): FormField[] {
  return fields.map((f) => {
    if (f.type === 'address' || f.type === 'business-address') {
      return { ...f, required } as FormField;
    }
    if (f.type === 'repeater') {
      return { ...f, fields: f.fields ? overrideAddressRequired(f.fields, required) : f.fields } as FormField;
    }
    return f;
  });
}

export function RepeaterField({ field, prefix }: Props) {
  const visible = useCondition(field.condition, prefix);
  const { watch, control } = useFormContext();
  const fullCountName = prefix ? `${prefix}.${field.countField}` : field.countField;
  const fullArrayName = prefix ? `${prefix}.${field.id}` : field.id;
  const { fields, append, remove } = useFieldArray({ control, name: fullArrayName });
  const countValue = watch(fullCountName);
  const parsed = parseInt(countValue, 10);
  let count = isNaN(parsed) ? 0 : Math.max(0, parsed);

  // Resolve maxItems – either fixed number or a `{fieldRef: ...}` pointer
  // to another field. Caps the entry count silently.
  if (field.maxItems !== undefined) {
    let cap: number | null = null;
    if (typeof field.maxItems === 'number') {
      cap = field.maxItems;
    } else if (field.maxItems && typeof field.maxItems === 'object' && 'fieldRef' in field.maxItems) {
      const ref = (field.maxItems as { fieldRef: string }).fieldRef;
      const refKey = ref.startsWith('/') ? ref.slice(1) : (prefix ? `${prefix}.${ref}` : ref);
      const refValue = watch(refKey);
      const n = typeof refValue === 'number' ? refValue : Number(String(refValue ?? '').replace(',', '.'));
      if (Number.isFinite(n)) cap = n;
    }
    if (cap !== null && cap >= 0) count = Math.min(count, cap);
  }

  const { naturalTemplate, legalTemplate } = usePersonTemplates();

  // Build the effective inner field set:
  //   personTemplate fields (with overrides applied) + extraFields
  // Falls back to the legacy `fields` array when no template is set.
  const innerFields = useMemo<FormField[]>(() => {
    let base: FormField[] = [];

    if (field.personTemplate === 'natural') {
      base = applyOverrides(naturalTemplate ?? [], field.fieldOverrides);
    } else if (field.personTemplate === 'legal') {
      base = applyOverrides(legalTemplate ?? [], field.fieldOverrides);
    } else if (field.personTemplate === 'both') {
      const typField: FormField = {
        id: 'typ',
        type: 'radio',
        label: 'Typ',
        options: ['Natürliche Person', 'Juristische Person'],
        layout: 'horizontal',
        required: true,
      };
      const natural = applyOverrides(naturalTemplate ?? [], field.fieldOverrides).map((f) => ({
        ...f,
        condition: { fieldId: 'typ', operator: 'eq' as const, value: 'Natürliche Person' },
      }));
      const legal = applyOverrides(legalTemplate ?? [], field.fieldOverrides).map((f) => ({
        ...f,
        condition: { fieldId: 'typ', operator: 'eq' as const, value: 'Juristische Person' },
      }));
      base = [typField, ...natural, ...legal];
    } else if (field.fields) {
      // Legacy: inline fields without a template.
      base = field.fields;
    }

    if (field.extraFields && field.extraFields.length > 0) {
      base = [...base, ...field.extraFields];
    }

    if (field.addressRequired === false) {
      base = overrideAddressRequired(base, false);
    }
    return base;
  }, [field.fields, field.personTemplate, field.fieldOverrides, field.extraFields, field.addressRequired, naturalTemplate, legalTemplate]);

  useEffect(() => {
    if (!visible) return;
    if (count > fields.length) {
      for (let i = fields.length; i < count; i++) append({}, { shouldFocus: false });
    } else if (count < fields.length) {
      for (let i = fields.length - 1; i >= count; i--) remove(i);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, visible]);

  if (!visible) return null;

  return (
    <FieldWrapper label={field.label} required={field.required} helpText={field.helpText}>
    <div className="space-y-6">
      {fields.map((item, index) => (
        <div key={item.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-600 mb-4 pb-2 border-b border-gray-200">
            {field.label || 'Person'} {index + 1}
          </h4>
          <div className="space-y-4">
            {innerFields.map((f) => (
              <FieldRenderer key={f.id} field={f} prefix={`${fullArrayName}.${index}`} />
            ))}
          </div>
        </div>
      ))}
    </div>
    </FieldWrapper>
  );
}
