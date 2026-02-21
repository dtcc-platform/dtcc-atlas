import type { JSONSchema, JSONSchemaProperty } from '../types/json-schema';
import {
  type FormConfig,
  type FormField,
  FormFieldType,
  type UnionTypeInfo,
  type TextFormField,
  type NumberFormField,
  type CheckboxFormField,
  type SelectFormField,
  type SmartUnionFormField,
} from '../types/form-fields';

/**
 * Main parser class for JSON Schema → FormConfig
 */
export class SchemaParser {
  /**
   * Parse JSON Schema into FormConfig
   * @param schema - JSON Schema from backend
   * @param datasetName - Name of the dataset
   * @param hiddenFields - Field names to hide (e.g., 'bounds')
   * @returns FormConfig ready for rendering
   */
  parse(
    schema: JSONSchema,
    datasetName: string,
    hiddenFields: string[] = ['bounds']
  ): FormConfig {
    const fields: FormField[] = [];
    const requiredFields = new Set(schema.required || []);

    // Add filename field at the top
    fields.push({
      name: 'filename',
      label: 'Filename',
      description: 'Name for the downloaded file (without extension)',
      required: true,
      defaultValue: datasetName,
      type: FormFieldType.TEXT,
      placeholder: 'Enter filename',
    });

    for (const [fieldName, property] of Object.entries(schema.properties)) {
      // Skip hidden fields
      if (hiddenFields.includes(fieldName)) {
        continue;
      }

      const field = this.parseProperty(
        fieldName,
        property,
        requiredFields.has(fieldName)
      );

      if (field) {
        fields.push(field);
      }
    }

    return {
      datasetName,
      title: schema.title || datasetName,
      fields,
    };
  }

  /**
   * Parse a single property into a FormField
   */
  private parseProperty(
    name: string,
    property: JSONSchemaProperty,
    required: boolean
  ): FormField | null {
    const baseField = {
      name,
      label: property.title || this.humanizeName(name),
      description: property.description,
      required,
      defaultValue: property.default,
    };

    // Handle anyOf (Union types)
    if (property.anyOf && property.anyOf.length > 0) {
      return this.parseUnionType(baseField, property);
    }

    // Handle enum (Literal types)
    if (property.enum && property.enum.length > 0) {
      return this.parseEnumType(baseField, property);
    }

    // Handle primitive types
    switch (property.type) {
      case 'string':
        return this.parseStringType(baseField, property);
      case 'number':
      case 'integer':
        return this.parseNumberType(baseField, property);
      case 'boolean':
        return this.parseBooleanType(baseField, property);
      default:
        console.warn(`Unsupported field type for ${name}:`, property.type);
        return null;
    }
  }

  /**
   * Parse string type field
   */
  private parseStringType(
    base: any,
    property: JSONSchemaProperty
  ): TextFormField {
    return {
      ...base,
      type: FormFieldType.TEXT,
      pattern: property.pattern,
      minLength: property.minLength,
      maxLength: property.maxLength,
      placeholder: property.description || `Enter ${base.label.toLowerCase()}`,
    };
  }

  /**
   * Parse number/integer type field
   */
  private parseNumberType(
    base: any,
    property: JSONSchemaProperty
  ): NumberFormField {
    const isInteger = property.type === 'integer';
    return {
      ...base,
      type: isInteger ? FormFieldType.INTEGER : FormFieldType.NUMBER,
      min: property.minimum,
      max: property.maximum,
      step: isInteger ? 1 : 0.01,
    };
  }

  /**
   * Parse boolean type field
   */
  private parseBooleanType(
    base: any,
    property: JSONSchemaProperty
  ): CheckboxFormField {
    return {
      ...base,
      type: FormFieldType.CHECKBOX,
      defaultValue: property.default === true,
    };
  }

  /**
   * Parse enum type (simple select dropdown)
   */
  private parseEnumType(
    base: any,
    property: JSONSchemaProperty
  ): SelectFormField {
    const options = (property.enum || []).map((value) => ({
      value,
      label: String(value),
    }));

    return {
      ...base,
      type: FormFieldType.SELECT,
      options,
    };
  }

  /**
   * Parse anyOf union types
   * Determines if it's a simple optional or complex union
   */
  private parseUnionType(base: any, property: JSONSchemaProperty): FormField {
    const anyOf = property.anyOf || [];

    // Filter out null type (for Optional fields)
    const nonNullTypes = anyOf.filter((t) => t.type !== 'null');

    // If only one non-null type, treat as that type
    if (nonNullTypes.length === 1) {
      const parsedField = this.parseProperty(
        base.name,
        nonNullTypes[0],
        base.required
      );
      return parsedField || this.createSmartUnionField(base, property);
    }

    // Complex union - use smart union field
    return this.createSmartUnionField(base, property);
  }

  /**
   * Create smart union field for complex types
   * Example: int | list[int] | Literal["all", "terrain"]
   */
  private createSmartUnionField(
    base: any,
    property: JSONSchemaProperty
  ): SmartUnionFormField {
    const unionInfo = this.analyzeUnionType(property.anyOf || []);
    const placeholder = this.generateUnionPlaceholder(unionInfo);

    return {
      ...base,
      type: FormFieldType.SMART_UNION,
      unionInfo,
      placeholder,
      rawSchema: property,
    };
  }

  /**
   * Analyze union type to extract type information
   */
  private analyzeUnionType(anyOf: JSONSchemaProperty[]): UnionTypeInfo {
    const info: UnionTypeInfo = {
      hasInteger: false,
      hasIntegerArray: false,
      hasString: false,
      literalValues: [],
    };

    for (const type of anyOf) {
      if (type.type === 'null') continue;

      if (type.type === 'integer') {
        info.hasInteger = true;
      } else if (type.type === 'string') {
        if (type.enum) {
          info.literalValues.push(...type.enum.map(String));
        } else {
          info.hasString = true;
        }
      } else if (type.type === 'array' && type.items?.type === 'integer') {
        info.hasIntegerArray = true;
      } else if (type.enum) {
        info.literalValues.push(...type.enum.map(String));
      }
    }

    return info;
  }

  /**
   * Generate helpful placeholder text from union info
   */
  private generateUnionPlaceholder(info: UnionTypeInfo): string {
    const parts: string[] = [];

    if (info.hasInteger) parts.push('5');
    if (info.hasIntegerArray) parts.push('1,2,3');
    if (info.literalValues.length > 0) {
      parts.push(info.literalValues.slice(0, 2).join(' or '));
    }
    if (info.hasString) parts.push('text');

    return parts.join(' | ') || 'Enter value';
  }

  /**
   * Convert snake_case to Title Case
   */
  private humanizeName(name: string): string {
    return name
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}

// Export singleton instance
export const schemaParser = new SchemaParser();
