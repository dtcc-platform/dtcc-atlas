import { FormConfig } from '../types/form-fields';
import { FormSubmissionStatus } from '../types/form-state';
import { FormRenderer } from './form-renderer';
import { BoundingBox } from '../types';

/**
 * Dialog view states
 */
enum DialogView {
  DATASET_LIST = 'dataset-list',
  DATASET_FORM = 'form',
}

/**
 * Enhanced DatasetDialog with form support
 * Manages two views: dataset selection and dataset configuration form
 */
export class DatasetDialog {
  private dialog: HTMLElement;
  private content: HTMLElement;
  // @ts-expect-error - currentView is kept for future state management features
  private currentView: DialogView = DialogView.DATASET_LIST;
  private formRenderer: FormRenderer | null = null;
  private currentDataset: string | null = null;

  // Callbacks
  private onDatasetSelected: ((datasetName: string) => void) | null = null;
  private onFormSubmit:
    | ((datasetName: string, values: Record<string, unknown>) => void)
    | null = null;
  private onBackButtonClick: (() => void) | null = null;

  constructor() {
    const dialog = document.getElementById('dataset-dialog');
    if (!dialog) {
      throw new Error('Dataset dialog element not found');
    }

    this.dialog = dialog;

    // Get or create content container
    let content = dialog.querySelector(
      '.dataset-dialog-content'
    ) as HTMLElement;
    if (!content) {
      content = document.createElement('div');
      content.className = 'dataset-dialog-content';
      dialog.appendChild(content);
    }
    this.content = content;
  }

  /**
   * Show dataset selection view
   */
  showDatasetList(datasets: string[]): void {
    this.currentView = DialogView.DATASET_LIST;
    this.renderDatasetList(datasets);
    this.dialog.classList.remove('hidden');
  }

  /**
   * Show dataset form view
   */
  showDatasetForm(formConfig: FormConfig, _bounds: BoundingBox): void {
    this.currentView = DialogView.DATASET_FORM;
    this.currentDataset = formConfig.datasetName;

    this.renderDatasetForm(formConfig);
    this.dialog.classList.remove('hidden');
  }

  /**
   * Hide dialog
   */
  hide(): void {
    this.dialog.classList.add('hidden');
    this.formRenderer = null;
  }

  /**
   * Check if dialog is currently visible
   */
  isVisible(): boolean {
    return !this.dialog.classList.contains('hidden');
  }

  /**
   * Update submission status
   */
  updateSubmissionStatus(status: FormSubmissionStatus): void {
    if (this.formRenderer) {
      this.formRenderer.updateSubmissionStatus(status);
    }
  }

  /**
   * Register callback for dataset selection
   */
  onSelect(callback: (datasetName: string) => void): void {
    this.onDatasetSelected = callback;
  }

  /**
   * Register callback for form submission
   */
  onSubmit(
    callback: (datasetName: string, values: Record<string, unknown>) => void
  ): void {
    this.onFormSubmit = callback;
  }

  /**
   * Register callback for back button
   */
  onBack(callback: () => void): void {
    this.onBackButtonClick = callback;
  }

  // PRIVATE METHODS

  /**
   * Render dataset selection buttons
   */
  private renderDatasetList(datasets: string[]): void {
    this.content.innerHTML = `
      <div class="flex items-center justify-between mb-4 pb-3 border-b border-dtcc-border-light">
        <h3 class="m-0 text-base font-semibold text-dtcc-navy">Select Dataset</h3>
        <span class="text-xs text-dtcc-gray-dark">${datasets.length} available</span>
      </div>
      <div id="dataset-buttons" class="flex flex-col gap-0 border border-dtcc-border-light rounded-lg overflow-hidden"></div>
    `;

    const buttonsContainer = this.content.querySelector('#dataset-buttons')!;

    datasets.forEach((datasetName) => {
      const button = document.createElement('button');
      button.className = 'w-full px-4 py-3 bg-white hover:bg-dtcc-gray-lighter text-left border-b border-dtcc-border-light last:border-b-0 transition-colors flex items-center justify-between group';
      button.innerHTML = `
        <span class="font-mono text-sm text-dtcc-navy">${datasetName}</span>
        <span class="text-dtcc-gray opacity-0 group-hover:opacity-100 transition-opacity">→</span>
      `;
      button.addEventListener('click', () => {
        if (this.onDatasetSelected) {
          this.onDatasetSelected(datasetName);
        }
      });
      buttonsContainer.appendChild(button);
    });
  }

  /**
   * Render dataset form
   */
  private renderDatasetForm(formConfig: FormConfig): void {
    this.content.innerHTML = `
      <div class="flex items-center gap-3 mb-4 pb-3 border-b border-dtcc-border-light">
        <button class="p-2 hover:bg-dtcc-gray-lighter rounded transition-colors" id="back-button" title="Back to dataset list">
          <span class="w-4 h-4 block text-dtcc-gray-dark" id="back-icon"></span>
        </button>
        <h3 class="flex-1 m-0 text-base font-semibold text-dtcc-navy">${formConfig.title}</h3>
      </div>
      <div id="form-container"></div>
    `;

    // Add back icon
    const backIcon = this.content.querySelector('#back-icon');
    if (backIcon) {
      backIcon.innerHTML = `<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>`;
    }

    // Setup back button
    const backButton = this.content.querySelector('#back-button');
    backButton?.addEventListener('click', () => {
      if (this.onBackButtonClick) {
        this.onBackButtonClick();
      }
    });

    // Render form
    const formContainer = this.content.querySelector(
      '#form-container'
    )! as HTMLElement;
    this.formRenderer = new FormRenderer(
      formContainer,
      formConfig,
      (values) => this.handleFormSubmit(values)
    );
    this.formRenderer.render();
  }

  /**
   * Handle form submission
   */
  private handleFormSubmit(values: Record<string, unknown>): void {
    if (this.onFormSubmit && this.currentDataset) {
      this.onFormSubmit(this.currentDataset, values);
    }
  }
}
