/**
 * JSON Schema type definitions matching Pydantic output
 * Based on JSON Schema Draft 7 specification
 */

// Base JSON Schema types
export type JSONSchemaType =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'array'
  | 'object'
  | 'null';

/**
 * Property definition for a single field in JSON Schema
 */
export interface JSONSchemaProperty {
  type?: JSONSchemaType;
  title?: string;
  description?: string;
  default?: unknown;
  enum?: Array<string | number>;
  anyOf?: JSONSchemaProperty[];
  items?: JSONSchemaProperty;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  pattern?: string;
}

/**
 * Complete JSON Schema structure
 * Represents the schema returned by Pydantic's model_json_schema()
 */
export interface JSONSchema {
  type: 'object';
  title: string;
  description?: string;
  properties: Record<string, JSONSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

/**
 * API response from /api/v1/datasets/get_args/{dataset_name}
 */
export interface DatasetSchemaResponse extends JSONSchema {}
