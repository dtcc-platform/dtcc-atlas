import { FormConfig } from '../types/form-fields';
import { FormSubmissionStatus } from '../types/form-state';
import { FormRenderer } from './form-renderer';
import { BoundingBox, DatasetInfo } from '../types';

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
  private _pixelStreamingConnected = false;
  private _sendToUE = false;

  // Callbacks
  private onDatasetSelected: ((datasetName: string) => void) | null = null;
  private onFormSubmit:
    | ((datasetName: string, values: Record<string, unknown>, sendToUE: boolean) => void)
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
  showDatasetList(datasets: DatasetInfo[]): void {
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
    this._sendToUE = false;
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
   * Set whether Pixel Streaming is currently connected.
   * When connected, the form will offer a "Send to UE" destination toggle.
   */
  setPixelStreamingConnected(connected: boolean): void {
    this._pixelStreamingConnected = connected;
  }

  /**
   * Register callback for form submission
   */
  onSubmit(
    callback: (datasetName: string, values: Record<string, unknown>, sendToUE: boolean) => void
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
  private renderDatasetList(datasets: DatasetInfo[]): void {
    // Count by type
    const vectorCount = datasets.filter(d => d.type === 'vector').length;
    const rasterCount = datasets.filter(d => d.type === 'raster').length;

    // Clear and rebuild content safely
    this.content.textContent = '';

    // Header
    const header = document.createElement('div');
    header.className = 'flex items-center justify-between mb-4 pb-3 border-b border-dtcc-border-light';

    const title = document.createElement('h3');
    title.className = 'm-0 text-base font-semibold text-dtcc-navy';
    title.textContent = 'Select Dataset';

    const countSpan = document.createElement('span');
    countSpan.className = 'text-xs text-dtcc-gray-dark';
    countSpan.textContent = `${datasets.length} available${vectorCount > 0 ? ` (${vectorCount} vector, ${rasterCount} raster)` : ''}`;

    header.appendChild(title);
    header.appendChild(countSpan);
    this.content.appendChild(header);

    // Buttons container
    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'flex flex-col gap-0 border border-dtcc-border-light rounded-lg overflow-hidden max-h-96 overflow-y-auto';

    datasets.forEach((dataset) => {
      const button = document.createElement('button');
      button.className = 'w-full px-4 py-3 bg-white hover:bg-dtcc-gray-lighter text-left border-b border-dtcc-border-light last:border-b-0 transition-colors flex items-center justify-between group';

      const leftDiv = document.createElement('div');
      leftDiv.className = 'flex items-center gap-2';

      // Type indicator dot
      const dot = document.createElement('span');
      if (dataset.type === 'vector') {
        dot.className = 'w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0';
      } else {
        dot.className = 'w-2 h-2 rounded-full bg-blue-500 flex-shrink-0';
      }
      leftDiv.appendChild(dot);

      // Dataset name
      const nameSpan = document.createElement('span');
      nameSpan.className = 'font-mono text-sm text-dtcc-navy';
      nameSpan.textContent = dataset.title || dataset.name.replace(/_/g, ' ');
      leftDiv.appendChild(nameSpan);

      // Arrow
      const arrow = document.createElement('span');
      arrow.className = 'text-dtcc-gray opacity-0 group-hover:opacity-100 transition-opacity';
      arrow.textContent = '→';

      button.appendChild(leftDiv);
      button.appendChild(arrow);

      button.addEventListener('click', () => {
        if (this.onDatasetSelected) {
          this.onDatasetSelected(dataset.name);
        }
      });

      buttonsContainer.appendChild(button);
    });

    this.content.appendChild(buttonsContainer);
  }

  /**
   * Render dataset form
   */
  private renderDatasetForm(formConfig: FormConfig): void {
    this._sendToUE = false;

    this.content.innerHTML = `
      <div class="flex items-center gap-3 mb-4 pb-3 border-b border-dtcc-border-light">
        <button class="p-2 hover:bg-dtcc-gray-lighter rounded transition-colors" id="back-button" title="Back to dataset list">
          <span class="w-4 h-4 block text-dtcc-gray-dark" id="back-icon"></span>
        </button>
        <h3 class="flex-1 m-0 text-base font-semibold text-dtcc-navy">${formConfig.title}</h3>
      </div>
      <div id="destination-toggle"></div>
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

    // Render destination toggle when Pixel Streaming is connected
    if (this._pixelStreamingConnected) {
      this.renderDestinationToggle();
    }

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
   * Render the Download / Send to UE destination toggle
   */
  private renderDestinationToggle(): void {
    const container = this.content.querySelector('#destination-toggle') as HTMLElement;
    if (!container) return;

    container.className = 'mb-4';
    container.innerHTML = `
      <div class="flex items-center gap-1 p-1 bg-dtcc-gray-lighter rounded-lg">
        <button type="button" id="dest-download" class="flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors bg-white text-dtcc-navy shadow-sm">
          Download
        </button>
        <button type="button" id="dest-ue" class="flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors text-dtcc-gray-dark hover:text-dtcc-navy">
          Send to UE
        </button>
      </div>
    `;

    const downloadBtn = container.querySelector('#dest-download') as HTMLButtonElement;
    const ueBtn = container.querySelector('#dest-ue') as HTMLButtonElement;

    const setActive = (sendToUE: boolean) => {
      this._sendToUE = sendToUE;

      if (sendToUE) {
        ueBtn.className = 'flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors bg-purple-600 text-white shadow-sm';
        downloadBtn.className = 'flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors text-dtcc-gray-dark hover:text-dtcc-navy';
      } else {
        downloadBtn.className = 'flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors bg-white text-dtcc-navy shadow-sm';
        ueBtn.className = 'flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors text-dtcc-gray-dark hover:text-dtcc-navy';
      }

      // Update submit button text
      const submitButton = this.content.querySelector('#submit-button') as HTMLButtonElement;
      if (submitButton) {
        submitButton.textContent = sendToUE ? 'Send to UE' : 'Download Dataset';
      }
    };

    downloadBtn.addEventListener('click', () => setActive(false));
    ueBtn.addEventListener('click', () => setActive(true));
  }

  /**
   * Handle form submission
   */
  private handleFormSubmit(values: Record<string, unknown>): void {
    if (this.onFormSubmit && this.currentDataset) {
      this.onFormSubmit(this.currentDataset, values, this._sendToUE);
    }
  }
}
