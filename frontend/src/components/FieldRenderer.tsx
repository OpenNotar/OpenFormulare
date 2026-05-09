import type { FormField } from '../types/schema';
import { useCondition } from '../hooks/useCondition';
import { useClearWhenHidden } from '../hooks/useClearWhenHidden';
import { FieldPrefixContext } from '../hooks/useInterpolated';
import { TextField } from './fields/TextField';
import { NumberField } from './fields/NumberField';
import { SelectField } from './fields/SelectField';
import { RadioField } from './fields/RadioField';
import { MultiSelectField } from './fields/MultiSelectField';
import { CheckboxField } from './fields/CheckboxField';
import { TextareaField } from './fields/TextareaField';
import { DateField } from './fields/DateField';
import { FileField } from './fields/FileField';
import { RepeaterField } from './fields/RepeaterField';
import { AddressField } from './fields/AddressField';
import { BusinessAddressField } from './fields/BusinessAddressField';
import { InfoField } from './fields/InfoField';
import { PersonField, NaturalPersonField, LegalPersonField } from './fields/PersonFields';
import { CalculationField } from './fields/CalculationField';
import { EmbedField } from './fields/EmbedField';
import {
  StarsField,
  ScaleField,
  YesNoField,
} from './fields/RatingField';
import { PluginField } from './fields/PluginField';

interface Props {
  field: FormField;
  prefix?: string;
}

export function FieldRenderer({ field, prefix }: Props) {
  // Centralized auto-clear: when a field is hidden by its condition and
  // declared `clearWhenHidden`, drop its value from the form state. Each
  // field component still does its own visibility check below; the
  // duplicate `useCondition` evaluation here is cheap because watch()
  // returns the same memoised snapshot.
  const visible = useCondition(field.condition, prefix);
  const name = prefix ? `${prefix}.${field.id}` : field.id;
  useClearWhenHidden(name, visible, field.clearWhenHidden);

  return (
    // Make the current scope available to descendants so labels with
    // `{feldId}` placeholders resolve in the right context (top-level,
    // repeater item, embed, …).
    <FieldPrefixContext.Provider value={prefix}>
      {renderField(field, prefix)}
    </FieldPrefixContext.Provider>
  );
}

function renderField(field: FormField, prefix?: string) {
  switch (field.type) {
    case 'text':
    case 'email':
    case 'tel':
      return <TextField field={field} prefix={prefix} />;
    case 'number':
      return <NumberField field={field} prefix={prefix} />;
    case 'select':
      return <SelectField field={field} prefix={prefix} />;
    case 'radio':
      return <RadioField field={field} prefix={prefix} />;
    case 'multi-select':
      return <MultiSelectField field={field} prefix={prefix} />;
    case 'checkbox':
      return <CheckboxField field={field} prefix={prefix} />;
    case 'textarea':
      return <TextareaField field={field} prefix={prefix} />;
    case 'date':
      return <DateField field={field} prefix={prefix} />;
    case 'file':
      return <FileField field={field} prefix={prefix} />;
    case 'repeater':
      return <RepeaterField field={field} prefix={prefix} />;
    case 'address':
      return <AddressField field={field} prefix={prefix} />;
    case 'business-address':
      return <BusinessAddressField field={field} prefix={prefix} />;
    case 'info':
      return <InfoField field={field} prefix={prefix} />;
    case 'person':
      return <PersonField field={field} prefix={prefix} />;
    case 'natural-person':
      return <NaturalPersonField field={field} prefix={prefix} />;
    case 'legal-person':
      return <LegalPersonField field={field} prefix={prefix} />;
    case 'calculation':
      return <CalculationField field={field} prefix={prefix} />;
    case 'embed':
      return <EmbedField field={field} prefix={prefix} />;
    case 'stars':
      return <StarsField field={field} prefix={prefix} />;
    case 'scale':
      return <ScaleField field={field} prefix={prefix} />;
    case 'yesno':
      return <YesNoField field={field} prefix={prefix} />;
    default:
      // Unknown type → assume it was contributed by a plugin and let the
      // generic plugin renderer resolve its metadata.
      return <PluginField field={field} prefix={prefix} />;
  }
}
