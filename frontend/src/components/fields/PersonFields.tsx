// Renderers for `person` / `natural-person` / `legal-person` field types.
// They pull their inner field set from the global person templates
// configured via /api/admin/settings/person-templates and apply the
// dialog-level `fieldOverrides` (currently the `required` flag) on top.
//
// `legal-person` includes the Geschäftsanschrift+Sitz toggle as a fixed
// part of its template – there is no separate `business-address` field to
// add manually anymore.

import type {
  FormField,
  PersonField as PersonFieldType,
  NaturalPersonField as NaturalPersonFieldType,
  LegalPersonField as LegalPersonFieldType,
  PersonFieldOverrides,
} from '../../types/schema';
import { useCondition } from '../../hooks/useCondition';
import { usePersonTemplates } from '../../hooks/usePersonTemplates';
import { FieldRenderer } from '../FieldRenderer';
import { FieldWrapper } from './FieldWrapper';

function applyOverrides(template: FormField[], overrides?: PersonFieldOverrides): FormField[] {
  if (!overrides) return template;
  return template.map((f) => {
    const override = overrides[f.id];
    if (!override) return f;
    return { ...f, ...(override.required !== undefined ? { required: override.required } : {}) } as FormField;
  });
}

interface PersonGroupProps {
  baseField: PersonFieldType | NaturalPersonFieldType | LegalPersonFieldType;
  innerFields: FormField[];
  prefix?: string;
}

function PersonGroup({ baseField, innerFields, prefix }: PersonGroupProps) {
  const visible = useCondition(baseField.condition, prefix);
  if (!visible) return null;
  const groupName = prefix ? `${prefix}.${baseField.id}` : baseField.id;
  return (
    <FieldWrapper label={baseField.label} required={baseField.required} helpText={baseField.helpText}>
      <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50/50 p-4">
        {innerFields.map((f) => (
          <FieldRenderer key={f.id} field={f} prefix={groupName} />
        ))}
      </div>
    </FieldWrapper>
  );
}

function MissingTemplate({ kind }: { kind: 'natural' | 'legal' }) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      Keine Vorlage für {kind === 'natural' ? 'natürliche' : 'juristische'} Personen konfiguriert. Im
      Admin-Bereich unter <em>Einstellungen → Personen-Vorlagen</em> festlegen.
    </div>
  );
}

// ---------------------------------------------------------------------------
// natural-person
// ---------------------------------------------------------------------------

export function NaturalPersonField({ field, prefix }: { field: NaturalPersonFieldType; prefix?: string }) {
  const { naturalTemplate } = usePersonTemplates();
  if (!naturalTemplate) {
    const visible = useCondition(field.condition, prefix);
    if (!visible) return null;
    return <FieldWrapper label={field.label}><MissingTemplate kind="natural" /></FieldWrapper>;
  }
  const inner = applyOverrides(naturalTemplate, field.fieldOverrides);
  return <PersonGroup baseField={field} innerFields={inner} prefix={prefix} />;
}

// ---------------------------------------------------------------------------
// legal-person
// ---------------------------------------------------------------------------

export function LegalPersonField({ field, prefix }: { field: LegalPersonFieldType; prefix?: string }) {
  const { legalTemplate } = usePersonTemplates();
  if (!legalTemplate) {
    const visible = useCondition(field.condition, prefix);
    if (!visible) return null;
    return <FieldWrapper label={field.label}><MissingTemplate kind="legal" /></FieldWrapper>;
  }
  const inner = applyOverrides(legalTemplate, field.fieldOverrides);
  return <PersonGroup baseField={field} innerFields={inner} prefix={prefix} />;
}

// ---------------------------------------------------------------------------
// person (typ radio + conditional templates)
// ---------------------------------------------------------------------------

export function PersonField({ field, prefix }: { field: PersonFieldType; prefix?: string }) {
  const { naturalTemplate, legalTemplate } = usePersonTemplates();
  const overrides = field.fieldOverrides;

  const typField: FormField = {
    id: 'typ',
    type: 'radio',
    label: 'Typ',
    options: ['Natürliche Person', 'Juristische Person'],
    layout: 'horizontal',
    required: true,
  };

  const natural = applyOverrides(naturalTemplate ?? [], overrides).map((f) => ({
    ...f,
    condition: { fieldId: 'typ', operator: 'eq' as const, value: 'Natürliche Person' },
  }));
  const legal = applyOverrides(legalTemplate ?? [], overrides).map((f) => ({
    ...f,
    condition: { fieldId: 'typ', operator: 'eq' as const, value: 'Juristische Person' },
  }));

  const inner: FormField[] = [typField, ...natural, ...legal];
  return <PersonGroup baseField={field} innerFields={inner} prefix={prefix} />;
}
