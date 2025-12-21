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
    this.dialog.classList.add('visible');
  }

  /**
   * Show dataset form view
   */
  showDatasetForm(formConfig: FormConfig, _bounds: BoundingBox): void {
    this.currentView = DialogView.DATASET_FORM;
    this.currentDataset = formConfig.datasetName;

    this.renderDatasetForm(formConfig);
    this.dialog.classList.add('visible');
  }

  /**
   * Hide dialog
   */
  hide(): void {
    this.dialog.classList.remove('visible');
    this.formRenderer = null;
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

  // PRIVATE METHODS

  /**
   * Render dataset selection buttons
   */
  private renderDatasetList(datasets: string[]): void {
    this.content.innerHTML = `
      <div class="dialog-header">
        <h3>Select Dataset</h3>
      </div>
      <div class="dataset-buttons" id="dataset-buttons"></div>
    `;

    const buttonsContainer = this.content.querySelector('#dataset-buttons')!;

    datasets.forEach((datasetName) => {
      const button = document.createElement('button');
      button.className = 'dataset-button';
      button.textContent = datasetName;
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
      <div class="dialog-header">
        <button class="back-button" id="back-button">← Back</button>
        <h3>${formConfig.title}</h3>
      </div>
      <div class="form-container" id="form-container"></div>
    `;

    // Setup back button
    const backButton = this.content.querySelector('#back-button');
    backButton?.addEventListener('click', () => {
      this.hide();
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
