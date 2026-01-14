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
import { LocalBookmarkStorage } from './storage/local-bookmark-storage';
import { BookmarkManager } from './bookmarks/bookmark-manager';
import { SaveBookmarkDialog } from './ui/save-bookmark-dialog';
import { BookmarkPanel } from './ui/bookmark-panel';
import { SearchBox } from './ui/search-box';
import { MIN_BBOX_AREA_M2 } from './config';
import proj4 from 'proj4';
import { fromLonLat } from 'ol/proj';
import { Icons } from './ui/icons';

// Main application initialization
async function initializeApp(): Promise<void> {
  try {
    // Register coordinate system projections
    registerProjections();

    // Initialize map
    const map = mapManager.initializeMap('map');

    // Initialize toolbar icons
    const drawIcon = document.getElementById('draw-icon');
    const clearIcon = document.getElementById('clear-icon');
    const bookmarkIcon = document.getElementById('bookmark-icon');
    const listIcon = document.getElementById('list-icon');
    const searchIcon = document.getElementById('search-icon');
    const closeBookmarksIcon = document.getElementById('close-bookmarks-icon');

    if (drawIcon) drawIcon.innerHTML = Icons.draw;
    if (clearIcon) clearIcon.innerHTML = Icons.clear;
    if (bookmarkIcon) bookmarkIcon.innerHTML = Icons.bookmark;
    if (listIcon) listIcon.innerHTML = Icons.list;
    if (searchIcon) searchIcon.innerHTML = Icons.search;
    if (closeBookmarksIcon) closeBookmarksIcon.innerHTML = Icons.close;

    // Initialize search icons
    const searchInputIcon = document.getElementById('search-input-icon');
    const closeSearchIcon = document.getElementById('close-search-icon');
    if (searchInputIcon) searchInputIcon.innerHTML = Icons.search;
    if (closeSearchIcon) closeSearchIcon.innerHTML = Icons.close;

    // Create bounding box drawer
    const bboxDrawer = new BBoxDrawer(map);

    // Create dataset dialog
    const datasetDialog = new DatasetDialog();

    // Initialize bookmark system
    const bookmarkStorage = new LocalBookmarkStorage();
    const bookmarkManager = new BookmarkManager(bookmarkStorage);
    const saveBookmarkDialog = new SaveBookmarkDialog();
    const bookmarkPanel = new BookmarkPanel();

    // Initialize bookmark manager and load bookmarks
    await bookmarkManager.initialize();

    // Create search box
    const searchBox = new SearchBox();

    // Handle search result selection
    searchBox.onResultSelect((lat: number, lon: number, boundingbox?: number[]) => {
      const view = map.getView();

      if (boundingbox && boundingbox.length === 4) {
        // If we have a bounding box, fit the view to it
        // Nominatim format: [south, north, west, east] in WGS84
        const [south, north, west, east] = boundingbox;
        const southWest = fromLonLat([west, south]);
        const northEast = fromLonLat([east, north]);
        const extent = [...southWest, ...northEast];

        view.fit(extent, {
          padding: [50, 50, 50, 50],
          duration: 500,
        });
      } else {
        // Otherwise, just center on the coordinates with appropriate zoom
        const center = fromLonLat([lon, lat]);
        view.animate({
          center: center,
          zoom: 12, // Default zoom for specific locations
          duration: 500,
        });
      }
    });

    // Get UI elements
    const drawButton = document.getElementById('draw-bbox') as HTMLButtonElement;
    const clearButton = document.getElementById('clear-bbox') as HTMLButtonElement;
    const saveBookmarkBtn = document.getElementById('save-bookmark') as HTMLButtonElement;
    const toggleBookmarksBtn = document.getElementById('toggle-bookmarks') as HTMLButtonElement;
    const bookmarkCountSpan = document.getElementById('bookmark-count') as HTMLSpanElement;
    const bookmarkListCount = document.getElementById('bookmark-list-count') as HTMLSpanElement;

    if (!drawButton || !clearButton || !saveBookmarkBtn || !toggleBookmarksBtn || !bookmarkCountSpan) {
      throw new Error('Required UI elements not found');
    }

    // Search toggle elements
    const toggleSearchBtn = document.getElementById('toggle-search') as HTMLButtonElement;
    const searchBoxEl = document.getElementById('search-box');
    const searchInput = document.getElementById('search-input') as HTMLInputElement;
    const closeSearchBtn = document.getElementById('close-search') as HTMLButtonElement;

    // Search toggle button
    toggleSearchBtn?.addEventListener('click', () => {
      if (searchBoxEl?.classList.contains('hidden')) {
        searchBoxEl.classList.remove('hidden');
        searchInput?.focus();
      } else {
        searchBoxEl?.classList.add('hidden');
      }
    });

    closeSearchBtn?.addEventListener('click', () => {
      searchBoxEl?.classList.add('hidden');
    });

    // Close search on Escape key
    searchInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        searchBoxEl?.classList.add('hidden');
      }
    });

    // Enable drawing when button is clicked
    drawButton.addEventListener('click', () => {
      bboxDrawer.enableDrawing();
      drawButton.setAttribute('data-state', 'active');
      drawButton.disabled = true;
    });

    // Clear bounding box
    clearButton.addEventListener('click', () => {
      bboxDrawer.clearBoundingBox();
      drawButton.setAttribute('data-state', 'idle');
      drawButton.disabled = false;
      datasetDialog.hide();
      appState.reset();

      // Hide bbox status in header
      const bboxStatus = document.getElementById('bbox-status');
      if (bboxStatus) {
        bboxStatus.classList.add('hidden');
        bboxStatus.classList.remove('flex');
      }
    });

    // Save bookmark button
    saveBookmarkBtn.addEventListener('click', () => {
      const bbox = appState.getBbox();
      if (bbox) {
        saveBookmarkDialog.show(bbox);
      }
    });

    // Toggle bookmarks panel
    toggleBookmarksBtn.addEventListener('click', () => {
      bookmarkPanel.toggle();
    });

    // Save bookmark dialog callback
    saveBookmarkDialog.onSave(async (name: string, bbox: BoundingBox) => {
      try {
        await bookmarkManager.saveBookmark(name, bbox);
        saveBookmarkDialog.hide();
      } catch (error) {
        console.error('Error saving bookmark:', error);
        alert('Failed to save bookmark. Please try again.');
      }
    });

    // Load bookmark callback
    bookmarkPanel.onLoad((bookmark) => {
      // Clear existing bbox - this now fully resets the interaction
      bboxDrawer.clearBoundingBox();

      // Load the bookmark extent (this will automatically enable drawing)
      bboxDrawer.loadExtent(bookmark.bbox);

      // Center and zoom map to fit the bookmark extent
      const view = map.getView();
      const bbox = bookmark.bbox;

      // Transform bbox corners from EPSG:3006 to EPSG:3857 for map view
      const [minX, minY] = proj4('EPSG:3006', 'EPSG:3857', [bbox.minX, bbox.minY]);
      const [maxX, maxY] = proj4('EPSG:3006', 'EPSG:3857', [bbox.maxX, bbox.maxY]);

      // Fit the view to the extent with some padding
      view.fit([minX, minY, maxX, maxY], {
        padding: [500, 500, 500, 50], // Add 50px padding on all sides
        duration: 500, // Smooth animation duration in ms
      });

      // Update UI to reflect that a bbox is loaded (not actively drawing)
      drawButton.setAttribute('data-state', 'idle');
      drawButton.disabled = false;

      // Hide bookmark panel
      bookmarkPanel.hide();
    });

    // Delete bookmark callback
    bookmarkPanel.onDelete(async (id: string) => {
      if (confirm('Delete this bookmark?')) {
        try {
          await bookmarkManager.deleteBookmark(id);
        } catch (error) {
          console.error('Error deleting bookmark:', error);
          alert('Failed to delete bookmark. Please try again.');
        }
      }
    });

    // Update UI when bookmarks change
    bookmarkManager.on('bookmarks-changed', (bookmarks) => {
      bookmarkPanel.render(bookmarks);
      bookmarkCountSpan.textContent = bookmarks.length.toString();
      if (bookmarkListCount) {
        bookmarkListCount.textContent = bookmarks.length.toString();
      }
    });

    // Enable/disable save button based on bbox state
    appState.on('bbox-changed', (bbox) => {
      saveBookmarkBtn.disabled = !bbox;
    });

    // Handle bounding box drawn event
    bboxDrawer.onBBoxDrawn(async (bbox: BoundingBox) => {
      // Reset draw button state - drawing auto-disables after completion
      drawButton.setAttribute('data-state', 'idle');
      drawButton.disabled = false;

      // Store in centralized state
      appState.setBbox(bbox);

      // Update header area display
      const area = bboxDrawer.getCurrentBBoxArea();
      if (area) {
        const areaKm2 = area.areaM2 / 1_000_000;
        const areaDisplay = document.getElementById('area-display');
        const bboxStatus = document.getElementById('bbox-status');
        if (areaDisplay && bboxStatus) {
          areaDisplay.textContent = `${areaKm2.toFixed(2)} km²`;
          bboxStatus.classList.remove('hidden');
          bboxStatus.classList.add('flex');
        }
      }

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

    // Handle back button (return to dataset list)
    datasetDialog.onBack(() => {
      const datasets = appState.getDatasets();
      if (datasets && datasets.length > 0) {
        datasetDialog.showDatasetList(datasets);
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

        // Validate bounding box area
        const bboxArea = bboxDrawer.getCurrentBBoxArea();
        if (!bboxArea) {
          datasetDialog.updateSubmissionStatus({
            state: SubmissionState.ERROR,
            message: 'Invalid bounding box. Please draw a new bounding box.',
          });
          return;
        }

        if (!bboxArea.isValid) {
          datasetDialog.updateSubmissionStatus({
            state: SubmissionState.ERROR,
            message: `Bounding box area (${bboxArea.areaM2.toFixed(2)} m²) is too small. Minimum area is ${MIN_BBOX_AREA_M2} m².`,
          });
          return;
        }

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
            const datasets = appState.getDatasets();
            if (datasets && datasets.length > 0) {
            datasetDialog.showDatasetList(datasets);
            } else {
            datasetDialog.hide();
            }
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
