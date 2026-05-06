export type FieldType =
  | 'text'
  | 'email'
  | 'tel'
  | 'number'
  | 'textarea'
  | 'date'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'file'
  | 'repeater'
  | 'address'
  | 'business-address'
  | 'info'
  | 'person'
  | 'natural-person'
  | 'legal-person'
  | 'calculation'
  | 'embed'
  | 'multi-select';

export type ConditionOperator =
  | 'eq' | 'neq' | 'in'
  | 'lt' | 'gt' | 'lte' | 'gte'
  | 'set' | 'unset'
  | 'contains' | 'notContains';

export type ConditionValue =
  | string
  | string[]
  | number
  | { fieldRef: string };

export interface FieldCondition {
  fieldId: string;
  operator: ConditionOperator;
  value: ConditionValue;
}

export interface BaseField {
  id: string;
  label: string;
  required?: boolean;
  helpText?: string;
  condition?: FieldCondition;
  clearWhenHidden?: boolean;
}

export interface InputField extends BaseField {
  type: 'text' | 'email' | 'tel';
  placeholder?: string;
}

export interface NumberField extends BaseField {
  type: 'number';
  placeholder?: string;
  format?: 'euro' | 'percent' | 'dm' | 'plain';
  decimals?: number;
  prefix?: string;
  suffix?: string;
  min?: number;
  max?: number;
}

export interface TextareaField extends BaseField {
  type: 'textarea';
  placeholder?: string;
  rows?: number;
}

export interface DateField extends BaseField {
  type: 'date';
}

export interface OptionConfig {
  value: string;
  label?: string;
  condition?: FieldCondition;
}

export type FieldOption = string | OptionConfig;

export interface SelectField extends BaseField {
  type: 'select';
  options: FieldOption[];
  placeholder?: string;
}

export interface RadioField extends BaseField {
  type: 'radio';
  options: FieldOption[];
  layout?: 'horizontal' | 'vertical';
}

export interface MultiSelectField extends BaseField {
  type: 'multi-select';
  options: FieldOption[];
  layout?: 'horizontal' | 'vertical';
  minSelected?: number;
  maxSelected?: number;
}

export interface CheckboxField extends BaseField {
  type: 'checkbox';
  checkboxLabel: string;
}

export interface FileField extends BaseField {
  type: 'file';
  accept?: string;
  maxSizeMB?: number;
  maxFiles?: number;
}

export type PersonTemplateMode = 'natural' | 'legal' | 'both';

export type PersonFieldOverrides = Record<string, { required?: boolean }>;

export interface EmbedField extends BaseField {
  type: 'embed';
  dialogId: string;
  stepIds?: string[];
}

export interface RepeaterField extends BaseField {
  type: 'repeater';
  countField: string;
  personTemplate?: PersonTemplateMode;
  fieldOverrides?: PersonFieldOverrides;
  extraFields?: FormField[];
  maxItems?: number | { fieldRef: string };
  // Legacy
  fields?: FormField[];
  addressRequired?: boolean;
}

export interface AddressField extends BaseField {
  type: 'address';
}

export interface BusinessAddressField extends BaseField {
  type: 'business-address';
}

export interface InfoField extends BaseField {
  type: 'info';
  text: string;
  tone?: 'info' | 'warning' | 'success';
}

export type CalcOperand =
  | { kind: 'const'; value: number }
  | { kind: 'field'; fieldId: string };

export type CalcOperator = '+' | '-' | '*' | '/';

export interface CalcStep {
  operator?: CalcOperator;
  operand: CalcOperand;
}

export type CalculationFormat = 'euro' | 'percent' | 'dm' | 'plain';

export interface CalculationField extends BaseField {
  type: 'calculation';
  steps: CalcStep[];
  format?: CalculationFormat;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  asPercent?: boolean;
  hideIfIncomplete?: boolean;
}

export interface PersonField extends BaseField {
  type: 'person';
  fieldOverrides?: PersonFieldOverrides;
}

export interface NaturalPersonField extends BaseField {
  type: 'natural-person';
  fieldOverrides?: PersonFieldOverrides;
}

export interface LegalPersonField extends BaseField {
  type: 'legal-person';
  fieldOverrides?: PersonFieldOverrides;
}

export type FormField =
  | InputField
  | TextareaField
  | DateField
  | SelectField
  | RadioField
  | MultiSelectField
  | CheckboxField
  | FileField
  | RepeaterField
  | AddressField
  | BusinessAddressField
  | InfoField
  | PersonField
  | NaturalPersonField
  | LegalPersonField
  | CalculationField
  | EmbedField;

export interface FormStep {
  id: string;
  title: string;
  description?: string;
  fields: FormField[];
}

export interface FormSchema {
  id: string;
  title: string;
  description?: string;
  category?: string;
  categories?: string[];
  isActive?: boolean;
  isSystem?: boolean;
  createdAt?: string;
  updatedAt?: string;
  steps: FormStep[];
}
