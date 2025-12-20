import '../style.css';
import { registerProjections } from './map/projections';
import { mapManager } from './map/map-manager';
import { BBoxDrawer } from './map/bbox-drawer';
import { requestDataset, fetchDatasetList } from './api/dataset-api';
import { BoundingBox } from './types';
import { DatasetDialog } from './ui/dataset-dialog';

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
    });

    // Handle bounding box drawn event
    bboxDrawer.onBBoxDrawn(async (bbox: BoundingBox) => {
      // Note: Don't disable drawing - the Extent interaction handles both drawing and editing
      // Users can continue to resize and move the box after initial draw

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
        datasetDialog.show(datasets);
      } catch (error) {
        console.error('Error fetching dataset list:', error);
        alert('Failed to fetch dataset list. Make sure the server is running.');
      }
    });

    // Handle dataset selection
    datasetDialog.onSelect((datasetName: string) => {
      console.log('Selected dataset:', datasetName);
      // Future: Trigger download with the selected dataset
      datasetDialog.hide();
    });

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
