import { JSONSchemaProperty } from './json-schema';

/**
 * Enum for field types after schema analysis
 */
export enum FormFieldType {
  TEXT = 'text',
  NUMBER = 'number',
  INTEGER = 'integer',
  CHECKBOX = 'checkbox',
  SELECT = 'select',
  SMART_UNION = 'smart_union',
  HIDDEN = 'hidden',
}

/**
 * Union type analysis for smart input parsing
 */
export interface UnionTypeInfo {
  hasInteger: boolean;
  hasIntegerArray: boolean;
  hasString: boolean;
  literalValues: string[];
}

/**
 * Base field configuration
 */
interface BaseFormField {
  name: string;
  label: string;
  description?: string;
  required: boolean;
  defaultValue?: unknown;
}

/**
 * Text field (string type)
 */
export interface TextFormField extends BaseFormField {
  type: FormFieldType.TEXT;
  placeholder?: string;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
}

/**
 * Number field (number or integer type)
 */
export interface NumberFormField extends BaseFormField {
  type: FormFieldType.NUMBER | FormFieldType.INTEGER;
  min?: number;
  max?: number;
  step?: number;
}

/**
 * Checkbox field (boolean type)
 */
export interface CheckboxFormField extends BaseFormField {
  type: FormFieldType.CHECKBOX;
  defaultValue: boolean;
}

/**
 * Select dropdown (enum type)
 */
export interface SelectFormField extends BaseFormField {
  type: FormFieldType.SELECT;
  options: Array<{ value: string | number; label: string }>;
}

/**
 * Smart union field (complex anyOf types)
 */
export interface SmartUnionFormField extends BaseFormField {
  type: FormFieldType.SMART_UNION;
  unionInfo: UnionTypeInfo;
  placeholder: string;
  rawSchema: JSONSchemaProperty;
}

/**
 * Hidden field (auto-injected values like bounds)
 */
export interface HiddenFormField extends BaseFormField {
  type: FormFieldType.HIDDEN;
  value: unknown;
}

/**
 * Discriminated union of all field types
 */
export type FormField =
  | TextFormField
  | NumberFormField
  | CheckboxFormField
  | SelectFormField
  | SmartUnionFormField
  | HiddenFormField;

/**
 * Complete form configuration
 */
export interface FormConfig {
  datasetName: string;
  title: string;
  fields: FormField[];
}
