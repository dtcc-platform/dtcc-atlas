import {
  FormConfig,
  FormField,
  FormFieldType,
  TextFormField,
  NumberFormField,
  CheckboxFormField,
  SelectFormField,
  SmartUnionFormField,
} from '../types/form-fields';
import { FormSubmissionStatus, SubmissionState } from '../types/form-state';
import { formValidator } from '../forms/form-validator';
import { unionParser } from '../forms/union-parser';

/**
 * Renders and manages a dynamic form
 */
export class FormRenderer {
  private container: HTMLElement;
  private formConfig: FormConfig;
  private onSubmitCallback: (values: Record<string, unknown>) => void;

  private formElement: HTMLFormElement | null = null;
  private submitButton: HTMLButtonElement | null = null;
  private statusContainer: HTMLElement | null = null;

  constructor(
    container: HTMLElement,
    formConfig: FormConfig,
    onSubmit: (values: Record<string, unknown>) => void
  ) {
    this.container = container;
    this.formConfig = formConfig;
    this.onSubmitCallback = onSubmit;
  }

  /**
   * Render the complete form
   */
  render(): void {
    this.container.innerHTML = `
      <form class="flex flex-col gap-4" id="dataset-form">
        <div class="flex flex-col gap-5" id="form-fields"></div>
        <div class="hidden my-4" id="form-status"></div>
        <div class="mt-2 flex justify-center">
          <button type="submit" class="px-8 py-3 bg-dtcc-green text-white rounded cursor-pointer text-base font-semibold transition-colors hover:bg-dtcc-green-dark active:bg-dtcc-green-darker disabled:bg-dtcc-gray disabled:cursor-not-allowed" id="submit-button">
            Download Dataset
          </button>
        </div>
      </form>
    `;

    this.formElement = this.container.querySelector(
      '#dataset-form'
    ) as HTMLFormElement;
    this.submitButton = this.container.querySelector(
      '#submit-button'
    ) as HTMLButtonElement;
    this.statusContainer = this.container.querySelector(
      '#form-status'
    ) as HTMLElement;

    // Render fields
    const fieldsContainer = this.container.querySelector('#form-fields')!;
    this.formConfig.fields.forEach((field) => {
      const fieldElement = this.renderField(field);
      fieldsContainer.appendChild(fieldElement);
    });

    // Setup form submission
    this.formElement.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSubmit();
    });
  }

  /**
   * Render a single form field
   */
  private renderField(field: FormField): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'flex flex-col gap-2';
    wrapper.dataset.fieldName = field.name;

    // Field label
    const label = document.createElement('label');
    label.htmlFor = `field-${field.name}`;
    label.className = 'text-sm font-semibold text-dtcc-navy flex items-center gap-1';
    label.innerHTML = `
      ${field.label}
      ${field.required ? '<span class="text-dtcc-red font-bold">*</span>' : ''}
    `;
    wrapper.appendChild(label);

    // Field description
    if (field.description) {
      const desc = document.createElement('p');
      desc.className = 'text-xs text-dtcc-gray-dark m-0 italic';
      desc.textContent = field.description;
      wrapper.appendChild(desc);
    }

    // Field input
    const input = this.createInput(field);
    wrapper.appendChild(input);

    // Error container
    const error = document.createElement('div');
    error.className = 'text-xs text-dtcc-red hidden -mt-1';
    error.id = `error-${field.name}`;
    wrapper.appendChild(error);

    return wrapper;
  }

  /**
   * Create input element based on field type
   */
  private createInput(field: FormField): HTMLElement {
    switch (field.type) {
      case FormFieldType.TEXT:
        return this.createTextInput(field as TextFormField);
      case FormFieldType.NUMBER:
      case FormFieldType.INTEGER:
        return this.createNumberInput(field as NumberFormField);
      case FormFieldType.CHECKBOX:
        return this.createCheckboxInput(field as CheckboxFormField);
      case FormFieldType.SELECT:
        return this.createSelectInput(field as SelectFormField);
      case FormFieldType.SMART_UNION:
        return this.createSmartUnionInput(field as SmartUnionFormField);
      default:
        return document.createElement('div');
    }
  }

  /**
   * Create text input
   */
  private createTextInput(field: TextFormField): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.id = `field-${field.name}`;
    input.name = field.name;
    input.className = 'w-full px-3 py-2 border border-dtcc-border rounded text-sm transition-all focus:outline-none focus:border-dtcc-blue focus:ring-2 focus:ring-dtcc-blue/10 placeholder:text-dtcc-gray placeholder:italic';

    if (field.placeholder) input.placeholder = field.placeholder;
    if (field.defaultValue) input.value = String(field.defaultValue);
    if (field.required) input.required = true;
    if (field.pattern) input.pattern = field.pattern;
    if (field.minLength) input.minLength = field.minLength;
    if (field.maxLength) input.maxLength = field.maxLength;

    return input;
  }

  /**
   * Create number input
   */
  private createNumberInput(field: NumberFormField): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'number';
    input.id = `field-${field.name}`;
    input.name = field.name;
    input.className = 'w-full px-3 py-2 border border-dtcc-border rounded text-sm transition-all focus:outline-none focus:border-dtcc-blue focus:ring-2 focus:ring-dtcc-blue/10 placeholder:text-dtcc-gray placeholder:italic';

    if (field.defaultValue !== undefined)
      input.value = String(field.defaultValue);
    if (field.required) input.required = true;
    if (field.min !== undefined) input.min = String(field.min);
    if (field.max !== undefined) input.max = String(field.max);
    if (field.step !== undefined) input.step = String(field.step);

    return input;
  }

  /**
   * Create checkbox input
   */
  private createCheckboxInput(field: CheckboxFormField): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = `field-${field.name}`;
    input.name = field.name;
    input.className = 'w-5 h-5 cursor-pointer accent-dtcc-blue';
    input.checked = field.defaultValue === true;

    return input;
  }

  /**
   * Create select dropdown
   */
  private createSelectInput(field: SelectFormField): HTMLSelectElement {
    const select = document.createElement('select');
    select.id = `field-${field.name}`;
    select.name = field.name;
    select.className = 'w-full px-3 py-2 border border-dtcc-border rounded text-sm transition-all focus:outline-none focus:border-dtcc-blue focus:ring-2 focus:ring-dtcc-blue/10';

    if (field.required) select.required = true;

    // Add placeholder option
    if (!field.required) {
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = '-- Select --';
      select.appendChild(placeholder);
    }

    // Add options
    field.options.forEach((opt) => {
      const option = document.createElement('option');
      option.value = String(opt.value);
      option.textContent = opt.label;
      if (field.defaultValue === opt.value) {
        option.selected = true;
      }
      select.appendChild(option);
    });

    return select;
  }

  /**
   * Create smart union input
   */
  private createSmartUnionInput(field: SmartUnionFormField): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.id = `field-${field.name}`;
    input.name = field.name;
    input.className = 'w-full px-3 py-2 border border-dtcc-border rounded text-sm transition-all focus:outline-none focus:border-dtcc-blue focus:ring-2 focus:ring-dtcc-blue/10 placeholder:text-dtcc-gray placeholder:italic font-mono bg-dtcc-gray-lighter';
    input.placeholder = field.placeholder;

    if (field.defaultValue) input.value = String(field.defaultValue);
    if (field.required) input.required = true;

    // Store union info as data attribute for validation
    input.dataset.unionInfo = JSON.stringify(field.unionInfo);

    return input;
  }

  /**
   * Handle form submission
   */
  private handleSubmit(): void {
    // Collect form values
    const values = this.collectFormValues();

    // Validate
    const validation = formValidator.validate(this.formConfig.fields, values);

    if (!validation.valid) {
      this.displayValidationErrors(validation.errors);
      return;
    }

    // Clear errors
    this.clearErrors();

    // Call submit callback
    this.onSubmitCallback(values);
  }

  /**
   * Collect values from form inputs
   */
  private collectFormValues(): Record<string, unknown> {
    const values: Record<string, unknown> = {};

    this.formConfig.fields.forEach((field) => {
      const input = this.formElement?.elements.namedItem(
        field.name
      ) as HTMLInputElement | HTMLSelectElement;

      if (!input) return;

      switch (field.type) {
        case FormFieldType.CHECKBOX:
          values[field.name] = (input as HTMLInputElement).checked;
          break;

        case FormFieldType.NUMBER:
        case FormFieldType.INTEGER:
          const numValue = parseFloat(input.value);
          values[field.name] = isNaN(numValue) ? undefined : numValue;
          break;

        case FormFieldType.SMART_UNION:
          // Parse union value
          const unionInfo = JSON.parse(
            (input as HTMLInputElement).dataset.unionInfo || '{}'
          );
          const parseResult = unionParser.parse(input.value, unionInfo);
          values[field.name] = parseResult.success
            ? parseResult.value
            : input.value;
          break;

        default:
          values[field.name] = input.value || undefined;
      }
    });

    return values;
  }

  /**
   * Display validation errors
   */
  private displayValidationErrors(errors: any[]): void {
    this.clearErrors();

    errors.forEach((error) => {
      const errorElement = document.getElementById(`error-${error.fieldName}`);
      if (errorElement) {
        errorElement.textContent = error.message;
        errorElement.classList.remove('hidden');
      }
    });

    // Focus first error
    if (errors.length > 0) {
      const firstErrorField = this.formElement?.elements.namedItem(
        errors[0].fieldName
      ) as HTMLElement;
      firstErrorField?.focus();
    }
  }

  /**
   * Clear all error messages
   */
  private clearErrors(): void {
    const errorElements = this.container.querySelectorAll('.text-xs.text-dtcc-red');
    errorElements.forEach((el) => {
      el.textContent = '';
      el.classList.add('hidden');
    });
  }

  /**
   * Update submission status
   */
  updateSubmissionStatus(status: FormSubmissionStatus): void {
    if (!this.statusContainer || !this.submitButton) return;

    // Update button state
    this.submitButton.disabled =
      status.state !== SubmissionState.IDLE &&
      status.state !== SubmissionState.ERROR;

    // Update status display
    switch (status.state) {
      case SubmissionState.IDLE:
        this.statusContainer.innerHTML = '';
        this.statusContainer.className = 'hidden my-4';
        break;

      case SubmissionState.VALIDATING:
        this.statusContainer.innerHTML = `
          <div class="px-4 py-3 rounded bg-blue-50 text-blue-900 border-l-4 border-dtcc-blue flex items-center gap-2">
            <div class="spinner"></div><span>Validating...</span>
          </div>
        `;
        this.statusContainer.className = 'block my-4';
        break;

      case SubmissionState.SUBMITTING:
        this.statusContainer.innerHTML = `
          <div class="px-4 py-3 rounded bg-blue-50 text-blue-900 border-l-4 border-dtcc-blue flex items-center gap-2">
            <div class="spinner"></div><span>Submitting request...</span>
          </div>
        `;
        this.statusContainer.className = 'block my-4';
        break;

      case SubmissionState.SUCCESS:
        this.statusContainer.innerHTML = `
          <div class="px-4 py-3 rounded bg-green-50 text-green-900 border-l-4 border-dtcc-green flex items-center gap-2">
            <span>${status.message || 'Download request submitted successfully!'}</span>
          </div>
        `;
        this.statusContainer.className = 'block my-4';
        break;

      case SubmissionState.ERROR:
        this.statusContainer.innerHTML = `
          <div class="px-4 py-3 rounded bg-red-50 text-red-900 border-l-4 border-dtcc-red flex items-center gap-2">
            <span>${status.message || 'An error occurred. Please try again.'}</span>
          </div>
        `;
        this.statusContainer.className = 'block my-4';
        if (status.errors) {
          this.displayValidationErrors(status.errors);
        }
        break;
    }
  }
}
