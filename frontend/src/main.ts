import '../style.css';
import { registerProjections } from './map/projections';
import { mapManager } from './map/map-manager';
import { BBoxDrawer } from './map/bbox-drawer';
import {
  fetchDatasetList,
  fetchDatasetSchema,
  submitDatasetDownload,
  bboxToArray,
} from './api/dataset-api';
import { BoundingBox } from './types';
import { DatasetDialog } from './ui/dataset-dialog';
import { schemaParser } from './forms/schema-parser';
import { SubmissionState } from './types/form-state';
import { appState } from './state/app-state';

// Main application initialization
function initializeApp(): void {
  try {
    // Register coordinate system projections
    registerProjections();

    // Initialize map
    const map = mapManager.initializeMap('map');

    // Create bounding box drawer
    const bboxDrawer = new BBoxDrawer(map);

    // Create dataset dialog
    const datasetDialog = new DatasetDialog();

    // Get UI elements
    const drawButton = document.getElementById('draw-bbox') as HTMLButtonElement;
    const clearButton = document.getElementById('clear-bbox') as HTMLButtonElement;
    const coordinatesDisplay = document.getElementById('coordinates') as HTMLPreElement;

    if (!drawButton || !clearButton || !coordinatesDisplay) {
      throw new Error('Required UI elements not found');
    }

    // Enable drawing when button is clicked
    drawButton.addEventListener('click', () => {
      bboxDrawer.enableDrawing();
      drawButton.disabled = true;
      drawButton.textContent = 'Drawing Active';
    });

    // Clear bounding box
    clearButton.addEventListener('click', () => {
      bboxDrawer.clearBoundingBox();
      bboxDrawer.disableDrawing();
      coordinatesDisplay.textContent = 'No area selected';
      drawButton.disabled = false;
      drawButton.textContent = 'Draw Bounding Box';
      datasetDialog.hide();
      appState.reset();
    });

    // Handle bounding box drawn event
    bboxDrawer.onBBoxDrawn(async (bbox: BoundingBox) => {
      // Note: Don't disable drawing - the Extent interaction handles both drawing and editing
      // Users can continue to resize and move the box after initial draw

      // Store in centralized state
      appState.setBbox(bbox);

      // Display coordinates
      const displayText = `Min X: ${bbox.minX.toFixed(2)} m
Min Y: ${bbox.minY.toFixed(2)} m
Max X: ${bbox.maxX.toFixed(2)} m
Max Y: ${bbox.maxY.toFixed(2)} m
CRS: ${bbox.crs}`;

      coordinatesDisplay.textContent = displayText;

      // Fetch and show dataset selection dialog
      try {
        const datasets = await fetchDatasetList();
        appState.setDatasets(datasets);
        datasetDialog.showDatasetList(datasets);
      } catch (error) {
        console.error('Error fetching dataset list:', error);
        alert('Failed to fetch dataset list. Make sure the server is running.');
      }
    });

    // Handle dataset selection (fetch schema and show form)
    datasetDialog.onSelect(async (datasetName: string) => {
      const bbox = appState.getBbox();
      if (!bbox) {
        alert('No bounding box selected');
        return;
      }

      try {
        // Fetch dataset schema
        const schema = await fetchDatasetSchema(datasetName);

        // Parse schema to form config
        const formConfig = schemaParser.parse(schema, datasetName, ['bounds']);

        // Show form
        datasetDialog.showDatasetForm(formConfig, bbox);
      } catch (error) {
        console.error('Error fetching dataset schema:', error);
        alert(`Failed to load form for dataset "${datasetName}"`);
      }
    });

    // Handle form submission
    datasetDialog.onSubmit(
      async (datasetName: string, values: Record<string, unknown>) => {
        const bbox = appState.getBbox();
        if (!bbox) {
          alert('No bounding box selected');
          return;
        }

        // Update status: validating
        datasetDialog.updateSubmissionStatus({
          state: SubmissionState.VALIDATING,
        });

        // Small delay to show validating state
        await new Promise((resolve) => setTimeout(resolve, 300));

        // Update status: submitting
        datasetDialog.updateSubmissionStatus({
          state: SubmissionState.SUBMITTING,
        });

        try {
          // Extract filename from form values
          const filename = values.filename as string || datasetName;

          // Remove filename from parameters (it's not a dataset parameter)
          const { filename: _, ...parameters } = values;

          // Prepare request
          const request = {
            dataset: datasetName,
            bounds: bboxToArray(bbox),
            parameters,
            filename, // Pass filename separately
          };

          // Submit to backend
          const response = await submitDatasetDownload(request);

          // Update status: success
          datasetDialog.updateSubmissionStatus({
            state: SubmissionState.SUCCESS,
            message:
              response.message || 'Download request submitted successfully!',
          });

          // Auto-close dialog after 3 seconds
          setTimeout(() => {
            datasetDialog.hide();
          }, 3000);
        } catch (error: any) {
          console.error('Error submitting download request:', error);

          // Update status: error
          datasetDialog.updateSubmissionStatus({
            state: SubmissionState.ERROR,
            message: error.message || 'Failed to submit download request',
          });
        }
      }
    );

    console.log('Application initialized successfully');
  } catch (error) {
    console.error('Failed to initialize application:', error);
    alert('Application initialization failed. Please refresh the page.');
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}
