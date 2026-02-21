import {
  type FormField,
  FormFieldType,
  type SmartUnionFormField,
  type NumberFormField,
  type TextFormField,
  type SelectFormField,
} from '../types/form-fields';
import type {
  ValidationResult,
  FieldValidationError,
} from '../types/form-state';
import { unionParser } from './union-parser';

/**
 * Validates form values against field configurations
 */
export class FormValidator {
  /**
   * Validate all form fields
   * @param fields - Form field configurations
   * @param values - User-entered values
   * @returns Validation result with errors
   */
  validate(
    fields: FormField[],
    values: Record<string, unknown>
  ): ValidationResult {
    const errors: FieldValidationError[] = [];

    for (const field of fields) {
      const value = values[field.name];
      const fieldErrors = this.validateField(field, value);
      errors.push(...fieldErrors);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate a single field
   */
  private validateField(
    field: FormField,
    value: unknown
  ): FieldValidationError[] {
    const errors: FieldValidationError[] = [];

    // Required field check
    if (
      field.required &&
      (value === undefined || value === null || value === '')
    ) {
      errors.push({
        fieldName: field.name,
        message: `${field.label} is required`,
      });
      return errors; // Don't validate further if missing
    }

    // Skip validation for optional empty fields (except SELECT fields which need special handling)
    if (
      !field.required &&
      field.type !== FormFieldType.SELECT &&
      (value === undefined || value === null || value === '')
    ) {
      return errors;
    }

    // Type-specific validation
    switch (field.type) {
      case FormFieldType.TEXT:
        this.validateText(field, value as string, errors);
        break;
      case FormFieldType.NUMBER:
      case FormFieldType.INTEGER:
        this.validateNumber(field, value as number, errors);
        break;
      case FormFieldType.CHECKBOX:
        this.validateBoolean(field, value as boolean, errors);
        break;
      case FormFieldType.SELECT:
        this.validateSelect(field, value, errors);
        break;
      case FormFieldType.SMART_UNION:
        this.validateSmartUnion(field, value as string, errors);
        break;
    }

    return errors;
  }

  /**
   * Validate text field
   */
  private validateText(
    field: TextFormField,
    value: string,
    errors: FieldValidationError[]
  ): void {
    if (field.minLength && value.length < field.minLength) {
      errors.push({
        fieldName: field.name,
        message: `Minimum length is ${field.minLength}`,
      });
    }

    if (field.maxLength && value.length > field.maxLength) {
      errors.push({
        fieldName: field.name,
        message: `Maximum length is ${field.maxLength}`,
      });
    }

    if (field.pattern && !new RegExp(field.pattern).test(value)) {
      errors.push({
        fieldName: field.name,
        message: `Invalid format`,
      });
    }
  }

  /**
   * Validate number field
   */
  private validateNumber(
    field: NumberFormField,
    value: number,
    errors: FieldValidationError[]
  ): void {
    if (typeof value !== 'number' || isNaN(value)) {
      errors.push({
        fieldName: field.name,
        message: 'Must be a valid number',
      });
      return;
    }

    if (field.type === FormFieldType.INTEGER && !Number.isInteger(value)) {
      errors.push({
        fieldName: field.name,
        message: 'Must be an integer',
      });
    }

    if (field.min !== undefined && value < field.min) {
      errors.push({
        fieldName: field.name,
        message: `Minimum value is ${field.min}`,
      });
    }

    if (field.max !== undefined && value > field.max) {
      errors.push({
        fieldName: field.name,
        message: `Maximum value is ${field.max}`,
      });
    }
  }

  /**
   * Validate boolean field
   */
  private validateBoolean(
    field: FormField,
    value: boolean,
    errors: FieldValidationError[]
  ): void {
    if (typeof value !== 'boolean') {
      errors.push({
        fieldName: field.name,
        message: 'Must be true or false',
      });
    }
  }

  /**
   * Validate select field
   */
  private validateSelect(
    field: SelectFormField,
    value: unknown,
    errors: FieldValidationError[]
  ): void {
    // Check if a valid option has been selected (not the placeholder)
    if (value === undefined || value === null || value === '') {
      errors.push({
        fieldName: field.name,
        message: `Please select a ${field.label.toLowerCase()}`,
      });
      return;
    }

    const validValues = field.options.map((opt) => opt.value);
    if (!validValues.includes(value as string | number)) {
      errors.push({
        fieldName: field.name,
        message: `Must be one of: ${validValues.join(', ')}`,
      });
    }
  }

  /**
   * Validate smart union field
   */
  private validateSmartUnion(
    field: SmartUnionFormField,
    value: string,
    errors: FieldValidationError[]
  ): void {
    const parseResult = unionParser.parse(value, field.unionInfo);
    if (!parseResult.success) {
      errors.push({
        fieldName: field.name,
        message: parseResult.error || 'Invalid value',
      });
    }
  }
}

// Export singleton
export const formValidator = new FormValidator();
