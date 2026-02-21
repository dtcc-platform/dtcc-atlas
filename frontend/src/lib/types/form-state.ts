/**
 * Form submission states
 */
export enum SubmissionState {
  IDLE = 'idle',
  VALIDATING = 'validating',
  SUBMITTING = 'submitting',
  SUCCESS = 'success',
  ERROR = 'error',
}

/**
 * Validation error for a single field
 */
export interface FieldValidationError {
  fieldName: string;
  message: string;
}

/**
 * Form validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: FieldValidationError[];
}

/**
 * Form submission status
 */
export interface FormSubmissionStatus {
  state: SubmissionState;
  message?: string;
  errors?: FieldValidationError[];
}

/**
 * Parsed form values (ready for API submission)
 */
export interface FormValues {
  [fieldName: string]: unknown;
}
