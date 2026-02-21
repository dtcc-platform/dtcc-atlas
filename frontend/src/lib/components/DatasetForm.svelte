<script lang="ts">
  import { selectedDataset, formConfig } from '../stores/datasets'
  import { activePanel } from '../stores/ui'
  import { bbox } from '../stores/map'
  import { formValidator } from '../forms/form-validator'
  import { jobService } from '../services/job-service'
  import { Icons } from '../ui/icons'
  import { FormFieldType } from '../types/form-fields'
  import type { FormField } from '../types/form-fields'
  import type { FormValues, FieldValidationError } from '../types/form-state'
  import { SubmissionState } from '../types/form-state'

  let values: FormValues = $state({})
  let submissionState: SubmissionState = $state(SubmissionState.IDLE)
  let submissionMessage: string = $state('')
  let fieldErrors: Record<string, string> = $state({})

  // Initialize form values from config defaults
  $effect(() => {
    if ($formConfig) {
      const defaults: FormValues = {}
      for (const field of $formConfig.fields) {
        if (field.type === FormFieldType.HIDDEN) {
          defaults[field.name] = field.value
        } else if (field.defaultValue !== undefined) {
          defaults[field.name] = field.defaultValue
        } else if (field.type === FormFieldType.CHECKBOX) {
          defaults[field.name] = false
        } else if (field.type === FormFieldType.NUMBER || field.type === FormFieldType.INTEGER) {
          defaults[field.name] = ''
        } else if (field.type === FormFieldType.SELECT) {
          defaults[field.name] = ''
        } else {
          defaults[field.name] = ''
        }
      }
      values = defaults
      submissionState = SubmissionState.IDLE
      submissionMessage = ''
      fieldErrors = {}
    }
  })

  function goBack() {
    activePanel.set('datasets')
  }

  function getFieldError(fieldName: string): string | undefined {
    return fieldErrors[fieldName]
  }

  function updateValue(fieldName: string, value: unknown) {
    values = { ...values, [fieldName]: value }
    // Clear field error on input
    if (fieldErrors[fieldName]) {
      const newErrors = { ...fieldErrors }
      delete newErrors[fieldName]
      fieldErrors = newErrors
    }
  }

  async function handleSubmit() {
    if (!$formConfig || !$bbox) return

    // Validate
    submissionState = SubmissionState.VALIDATING
    fieldErrors = {}

    const result = formValidator.validate($formConfig.fields, values)
    if (!result.valid) {
      const errorMap: Record<string, string> = {}
      for (const err of result.errors) {
        errorMap[err.fieldName] = err.message
      }
      fieldErrors = errorMap
      submissionState = SubmissionState.IDLE
      return
    }

    // Build parameters (exclude hidden fields already in bounds)
    const parameters: Record<string, unknown> = {}
    for (const field of $formConfig.fields) {
      if (field.type !== FormFieldType.HIDDEN) {
        const val = values[field.name]
        // Skip optional fields with empty/undefined/null values
        if (!field.required && (val === '' || val === undefined || val === null)) {
          continue
        }
        // Convert number strings to numbers
        if ((field.type === FormFieldType.NUMBER || field.type === FormFieldType.INTEGER) && typeof val === 'string' && val !== '') {
          parameters[field.name] = field.type === FormFieldType.INTEGER ? parseInt(val, 10) : parseFloat(val)
        } else {
          parameters[field.name] = val
        }
      }
    }

    // Submit
    submissionState = SubmissionState.SUBMITTING
    try {
      const bounds = [$bbox.minX, $bbox.minY, $bbox.maxX, $bbox.maxY]
      await jobService.submitJob({
        dataset: $formConfig.datasetName,
        bounds,
        parameters,
      })
      submissionState = SubmissionState.SUCCESS
      submissionMessage = 'Job submitted successfully!'
    } catch (err) {
      submissionState = SubmissionState.ERROR
      submissionMessage = err instanceof Error ? err.message : 'Submission failed'
    }
  }

  const title = $derived($selectedDataset?.title || $selectedDataset?.name || 'Configure Dataset')
  const isSubmitting = $derived(submissionState === SubmissionState.SUBMITTING)
  const visibleFields = $derived($formConfig?.fields.filter((f: FormField) => f.type !== FormFieldType.HIDDEN) ?? [])
</script>

<div class="p-5">
  <!-- Header with back button -->
  <div class="flex items-center gap-3 mb-5">
    <button
      class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-black/5 transition-colors cursor-pointer text-[#6b7280]"
      onclick={goBack}
    >
      <span class="w-4 h-4 block">{@html Icons.arrowLeft}</span>
    </button>
    <h3 class="text-[16px] font-semibold text-[#1a1a2e] truncate">{title}</h3>
  </div>

  {#if submissionState === SubmissionState.SUCCESS}
    <!-- Success state -->
    <div class="flex flex-col items-center py-8 gap-4">
      <div class="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center text-green-600">
        <span class="w-6 h-6 block">{@html Icons.check}</span>
      </div>
      <p class="text-[14px] font-medium text-[#1a1a2e]">{submissionMessage}</p>
      <p class="text-[12px] text-[#6b7280]">Your job is being processed</p>
      <button
        class="mt-2 px-4 py-2 text-[13px] rounded-lg bg-[#1a1a2e] text-white hover:bg-[#2d2d44] transition-colors cursor-pointer"
        onclick={goBack}
      >
        Back to datasets
      </button>
    </div>
  {:else if submissionState === SubmissionState.ERROR}
    <!-- Error state -->
    <div class="flex flex-col items-center py-8 gap-4">
      <div class="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center text-red-500">
        <span class="w-6 h-6 block">{@html Icons.close}</span>
      </div>
      <p class="text-[14px] font-medium text-[#1a1a2e]">Submission failed</p>
      <p class="text-[12px] text-red-500 text-center px-4">{submissionMessage}</p>
      <button
        class="mt-2 px-4 py-2 text-[13px] rounded-lg border border-[#e5e7eb] hover:bg-black/5 transition-colors cursor-pointer"
        onclick={() => { submissionState = SubmissionState.IDLE; submissionMessage = ''; }}
      >
        Try again
      </button>
    </div>
  {:else}
    <!-- Form fields -->
    <form class="flex flex-col gap-4" onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
      {#each visibleFields as field (field.name)}
        <div class="flex flex-col gap-1.5">
          <label for={field.name} class="text-[13px] font-medium text-[#1a1a2e]">
            {field.label}
            {#if field.required}
              <span class="text-orange-500">*</span>
            {/if}
          </label>

          {#if field.description}
            <p class="text-[11px] text-[#6b7280] -mt-0.5">{field.description}</p>
          {/if}

          {#if field.type === FormFieldType.TEXT}
            <input
              id={field.name}
              type="text"
              class="h-9 px-3 rounded-lg border text-[13px] outline-none transition-colors
                {getFieldError(field.name) ? 'border-red-400 focus:ring-2 focus:ring-red-200' : 'border-[#e5e7eb] focus:ring-2 focus:ring-orange-200 focus:border-orange-400'}"
              placeholder={field.placeholder ?? ''}
              value={values[field.name] ?? ''}
              oninput={(e) => updateValue(field.name, (e.target as HTMLInputElement).value)}
            />
          {:else if field.type === FormFieldType.NUMBER || field.type === FormFieldType.INTEGER}
            <input
              id={field.name}
              type="number"
              class="h-9 px-3 rounded-lg border text-[13px] outline-none transition-colors
                {getFieldError(field.name) ? 'border-red-400 focus:ring-2 focus:ring-red-200' : 'border-[#e5e7eb] focus:ring-2 focus:ring-orange-200 focus:border-orange-400'}"
              placeholder={field.min !== undefined ? `Min: ${field.min}` : ''}
              step={field.step ?? (field.type === FormFieldType.INTEGER ? 1 : 'any')}
              min={field.min}
              max={field.max}
              value={values[field.name] ?? ''}
              oninput={(e) => {
                const raw = (e.target as HTMLInputElement).value
                updateValue(field.name, raw === '' ? '' : (field.type === FormFieldType.INTEGER ? parseInt(raw, 10) : parseFloat(raw)))
              }}
            />
          {:else if field.type === FormFieldType.CHECKBOX}
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                id={field.name}
                type="checkbox"
                class="w-4 h-4 rounded border-[#e5e7eb] text-orange-500 focus:ring-orange-200 cursor-pointer accent-orange-500"
                checked={values[field.name] === true}
                onchange={(e) => updateValue(field.name, (e.target as HTMLInputElement).checked)}
              />
              <span class="text-[13px] text-[#6b7280]">{field.description || field.label}</span>
            </label>
          {:else if field.type === FormFieldType.SELECT}
            <select
              id={field.name}
              class="h-9 px-3 rounded-lg border text-[13px] outline-none transition-colors cursor-pointer appearance-none bg-white
                {getFieldError(field.name) ? 'border-red-400 focus:ring-2 focus:ring-red-200' : 'border-[#e5e7eb] focus:ring-2 focus:ring-orange-200 focus:border-orange-400'}"
              value={values[field.name] ?? ''}
              onchange={(e) => updateValue(field.name, (e.target as HTMLSelectElement).value)}
            >
              <option value="" disabled>Select {field.label.toLowerCase()}...</option>
              {#each field.options as opt}
                <option value={opt.value}>{opt.label}</option>
              {/each}
            </select>
          {:else if field.type === FormFieldType.SMART_UNION}
            <input
              id={field.name}
              type="text"
              class="h-9 px-3 rounded-lg border text-[13px] outline-none transition-colors
                {getFieldError(field.name) ? 'border-red-400 focus:ring-2 focus:ring-red-200' : 'border-[#e5e7eb] focus:ring-2 focus:ring-orange-200 focus:border-orange-400'}"
              placeholder={field.placeholder}
              value={values[field.name] ?? ''}
              oninput={(e) => updateValue(field.name, (e.target as HTMLInputElement).value)}
            />
          {/if}

          {#if getFieldError(field.name)}
            <p class="text-[11px] text-red-500">{getFieldError(field.name)}</p>
          {/if}
        </div>
      {/each}

      {#if !$bbox}
        <p class="text-[12px] text-orange-500 bg-orange-50 px-3 py-2 rounded-lg">
          Draw a bounding box on the map before submitting.
        </p>
      {/if}

      <button
        type="submit"
        disabled={isSubmitting || !$bbox}
        class="mt-2 h-10 rounded-lg text-[13px] font-medium transition-colors cursor-pointer
          {isSubmitting || !$bbox
            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
            : 'bg-[#1a1a2e] text-white hover:bg-[#2d2d44]'}"
      >
        {#if isSubmitting}
          Submitting...
        {:else}
          Submit Job
        {/if}
      </button>
    </form>
  {/if}
</div>
