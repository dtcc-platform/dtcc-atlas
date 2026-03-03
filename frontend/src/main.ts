import '../style.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import { registerProjections } from './map/projections';
import { mapManager } from './map/map-manager';
import { BBoxDrawer } from './map/bbox-drawer';
import {
  fetchDatasetList,
  fetchDatasetSchema,
  bboxToArray,
} from './api/dataset-api';
import { BoundingBox, SavedBookmark } from './types';
import { DatasetDialog } from './ui/dataset-dialog';
import { schemaParser } from './forms/schema-parser';
import { SubmissionState } from './types/form-state';
import { appState } from './state/app-state';
import { LocalBookmarkStorage } from './storage/local-bookmark-storage';
import { BookmarkManager } from './bookmarks/bookmark-manager';
import { SaveBookmarkDialog } from './ui/save-bookmark-dialog';
import { BookmarkPanel } from './ui/bookmark-panel';
import { SearchBox } from './ui/search-box';
import { JobTracker } from './ui/job-tracker';
import { jobService } from './services/job-service';
import { artifactBridge } from './services/artifact-bridge';
import { MIN_BBOX_AREA_M2 } from './config';
import proj4 from 'proj4';
import { Icons } from './ui/icons';
import { PixelStreamPanel } from './ui/pixel-stream-panel';

// Debounce timer for bbox changes to prevent excessive API calls
let bboxDebounceTimer: number | null = null;
const BBOX_DEBOUNCE_DELAY = 500; // ms - wait for user to finish adjusting bbox

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
    const jobsIcon = document.getElementById('jobs-icon');
    const closeJobsIcon = document.getElementById('close-jobs-icon');
    const pixelStreamIcon = document.getElementById('pixel-stream-icon');

    if (drawIcon) drawIcon.innerHTML = Icons.draw;
    if (clearIcon) clearIcon.innerHTML = Icons.clear;
    if (bookmarkIcon) bookmarkIcon.innerHTML = Icons.bookmark;
    if (listIcon) listIcon.innerHTML = Icons.list;
    if (searchIcon) searchIcon.innerHTML = Icons.search;
    if (closeBookmarksIcon) closeBookmarksIcon.innerHTML = Icons.close;
    if (jobsIcon) jobsIcon.innerHTML = Icons.download;
    if (closeJobsIcon) closeJobsIcon.innerHTML = Icons.close;
    if (pixelStreamIcon) pixelStreamIcon.innerHTML = Icons.stream;

    // Initialize search icons
    const searchInputIcon = document.getElementById('search-input-icon');
    const closeSearchIcon = document.getElementById('close-search-icon');
    if (searchInputIcon) searchInputIcon.innerHTML = Icons.search;
    if (closeSearchIcon) closeSearchIcon.innerHTML = Icons.close;

    // Initialize view toggle icon
    const viewIcon = document.getElementById('view-icon');
    if (viewIcon) viewIcon.innerHTML = Icons.view3d;

    // Create bounding box drawer
    const bboxDrawer = new BBoxDrawer(map);

    // Create dataset dialog
    const datasetDialog = new DatasetDialog();

    // Initialize bookmark system
    const bookmarkStorage = new LocalBookmarkStorage();
    const bookmarkManager = new BookmarkManager(bookmarkStorage);
    const saveBookmarkDialog = new SaveBookmarkDialog();
    const bookmarkPanel = new BookmarkPanel();

    // Create search box
    const searchBox = new SearchBox();

    // Initialize job tracker
    const jobTracker = new JobTracker();
    await jobTracker.initialize();

    // Handle search result selection
    searchBox.onResultSelect((lat: number, lon: number, boundingbox?: number[]) => {
      if (boundingbox && boundingbox.length === 4) {
        // If we have a bounding box, fit the view to it
        // Nominatim format: [south, north, west, east] in WGS84
        const [south, north, west, east] = boundingbox;
        map.fitBounds(
          [[west, south], [east, north]],
          { padding: 50, duration: 500 }
        );
      } else {
        // Otherwise, just center on the coordinates with appropriate zoom
        map.flyTo({
          center: [lon, lat],
          zoom: 12,
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

    const syncBookmarksUI = (bookmarks: SavedBookmark[]): void => {
      bookmarkPanel.render(bookmarks);
      bookmarkCountSpan.textContent = bookmarks.length.toString();
      if (bookmarkListCount) {
        bookmarkListCount.textContent = bookmarks.length.toString();
      }
    };

    // initialize() emits the initial bookmark state, so subscribe before loading.
    bookmarkManager.on('bookmarks-changed', syncBookmarksUI);
    await bookmarkManager.initialize();

    // Search toggle elements
    const toggleSearchBtn = document.getElementById('toggle-search') as HTMLButtonElement;
    const searchBoxEl = document.getElementById('search-box');
    const searchInput = document.getElementById('search-input') as HTMLInputElement;
    const closeSearchBtn = document.getElementById('close-search') as HTMLButtonElement;
    const areaDisplay = document.getElementById('area-display');
    const bboxStatus = document.getElementById('bbox-status');
    const pixelStreamPanel = new PixelStreamPanel();

    // Start the artifact bridge (listens for artifact_ready SSE events)
    artifactBridge.start();
    artifactBridge.onWarning((msg) => {
      console.warn(msg);
    });

    // Track Pixel Streaming connection state and sync with artifact bridge + dataset dialog
    let psConnectionPollId: number | null = null;
    let lastPsConnected = false;

    const checkPsConnection = (): void => {
      const connected = pixelStreamPanel.isConnected();
      if (connected !== lastPsConnected) {
        lastPsConnected = connected;
        if (connected) {
          artifactBridge.setPixelStreaming(pixelStreamPanel.getPixelStreaming());
          datasetDialog.setPixelStreamingConnected(true);
          jobTracker.setPixelStreamingConnected(true);
        } else {
          artifactBridge.setPixelStreaming(null);
          datasetDialog.setPixelStreamingConnected(false);
          jobTracker.setPixelStreamingConnected(false);
        }
      }
    };

    // Poll PS connection state every second (lightweight boolean check)
    psConnectionPollId = window.setInterval(checkPsConnection, 1000);
    checkPsConnection();
    // Suppress unused-variable warning - interval cleared on page unload
    void psConnectionPollId;

    jobTracker.onVisualize(async (job) => {
      const pixelStreaming = pixelStreamPanel.getPixelStreaming();
      if (!pixelStreaming || !pixelStreamPanel.isConnected()) {
        console.warn(`Pixel Streaming not connected. Unable to visualize job ${job.id}.`);
        return;
      }

      const backendBase = import.meta.env.VITE_BACKEND_BASE_URL?.trim() || window.location.origin;
      const base = backendBase.replace(/\/+$/, '');
      const rawRelative = job.download_url || `/api/v1/jobs/${job.id}/download`;
      const relative = rawRelative.startsWith('/') ? rawRelative : `/${rawRelative}`;
      const downloadUrl = `${base}${relative}`;

      try {
        const response = await fetch(downloadUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }

        // Current contract: visualize payloads are always JSON content.
        const fileContents = await response.json();
        const boundsRaw = job.params?.bounds;
        const bounds = Array.isArray(boundsRaw)
          ? boundsRaw.map((value) => Number(value)).filter((value) => Number.isFinite(value))
          : [];

        pixelStreaming.emitUIInteraction({
          type: 'LoadDatasetJson',
          job_id: job.id,
          dataset: job.dataset,
          filename: job.filename,
          bounds,
          data: fileContents,
        } as Record<string, unknown>);

        console.info(`Sent dataset JSON to UE from job tracker: ${job.id} (${job.dataset})`);
      } catch (error) {
        console.error(`Failed to visualize job ${job.id}:`, error);
      }
    });

    const emitCesiumOriginFromBbox = (bbox: BoundingBox): void => {
      const pixelStreaming = pixelStreamPanel.getPixelStreaming();
      if (!pixelStreaming || !pixelStreamPanel.isConnected()) {
        return;
      }

      const centerX = (bbox.minX + bbox.maxX) / 2;
      const centerY = (bbox.minY + bbox.maxY) / 2;
      const [lon, lat] = proj4('EPSG:3006', 'EPSG:4326', [centerX, centerY]) as [number, number];

      pixelStreaming.emitUIInteraction({
        cesiumOrigin: {
          lat,
          lon,
          height: 100,
        },
      } as Record<string, unknown>);
    };

    const setDrawButtonActive = (): void => {
      drawButton.setAttribute('data-state', 'active');
      drawButton.disabled = true;
    };

    const setDrawButtonIdle = (): void => {
      drawButton.setAttribute('data-state', 'idle');
      drawButton.disabled = false;
    };

    const hideBBoxStatus = (): void => {
      if (bboxStatus) {
        bboxStatus.classList.add('hidden');
        bboxStatus.classList.remove('flex');
      }
      if (areaDisplay) {
        areaDisplay.textContent = '--';
      }
    };

    const clearSelectionAndResetUI = (keepDrawMode: boolean): void => {
      if (keepDrawMode && bboxDrawer.isDrawing()) {
        bboxDrawer.clearSelectionKeepDrawing();
        setDrawButtonActive();
      } else {
        bboxDrawer.clearBoundingBox();
        setDrawButtonIdle();
      }

      datasetDialog.hide();
      appState.setBbox(null);
      appState.setDatasets([]);
      hideBBoxStatus();
    };

    let lastOpenedPanel: 'bookmarks' | 'jobs' | null = null;

    const closeVisibleSidePanel = (): boolean => {
      const isBookmarksVisible = bookmarkPanel.isVisible();
      const isJobsVisible = jobTracker.isVisible();

      if (!isBookmarksVisible && !isJobsVisible) {
        return false;
      }

      if (isBookmarksVisible && isJobsVisible) {
        if (lastOpenedPanel === 'bookmarks') {
          bookmarkPanel.hide();
          lastOpenedPanel = 'jobs';
          return true;
        }

        if (lastOpenedPanel === 'jobs') {
          jobTracker.hide();
          lastOpenedPanel = 'bookmarks';
          return true;
        }

        bookmarkPanel.hide();
        lastOpenedPanel = 'jobs';
        return true;
      }

      if (isBookmarksVisible) {
        bookmarkPanel.hide();
      } else {
        jobTracker.hide();
      }

      lastOpenedPanel = null;
      return true;
    };

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

    // View toggle button
    const toggleViewBtn = document.getElementById('toggle-view') as HTMLButtonElement;
    const viewLabel = document.getElementById('view-label');

    toggleViewBtn?.addEventListener('click', () => {
      if (pixelStreamPanel.isVisible()) {
        pixelStreamPanel.hide();
      }

      const is3D = mapManager.toggle3DView();

      // Update button appearance
      if (viewIcon) viewIcon.innerHTML = is3D ? Icons.view2d : Icons.view3d;
      if (viewLabel) viewLabel.textContent = is3D ? '2D View' : '3D View';
      toggleViewBtn.setAttribute('data-view', is3D ? '3d' : '2d');
      toggleViewBtn.setAttribute('data-tooltip', is3D ? 'Switch to 2D view' : 'Switch to 3D view');
    });

    // Enable drawing when button is clicked
    drawButton.addEventListener('click', () => {
      bboxDrawer.enableDrawing();
      setDrawButtonActive();
    });

    // Clear bounding box
    clearButton.addEventListener('click', () => {
      clearSelectionAndResetUI(false);
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
      if (bookmarkPanel.isVisible()) {
        bookmarkPanel.hide();
        if (lastOpenedPanel === 'bookmarks') {
          lastOpenedPanel = jobTracker.isVisible() ? 'jobs' : null;
        }
      } else {
        bookmarkPanel.show();
        lastOpenedPanel = 'bookmarks';
      }
    });

    // Toggle job tracker panel
    const toggleJobsBtn = document.getElementById('toggle-jobs') as HTMLButtonElement;
    toggleJobsBtn?.addEventListener('click', () => {
      if (jobTracker.isVisible()) {
        jobTracker.hide();
        if (lastOpenedPanel === 'jobs') {
          lastOpenedPanel = bookmarkPanel.isVisible() ? 'bookmarks' : null;
        }
      } else {
        jobTracker.show();
        lastOpenedPanel = 'jobs';
      }
    });

    // Centralized Escape handling - one action per press
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') {
        return;
      }

      if (saveBookmarkDialog.isVisible()) {
        e.preventDefault();
        saveBookmarkDialog.hide();
        return;
      }

      if (searchBoxEl && !searchBoxEl.classList.contains('hidden')) {
        e.preventDefault();
        searchBoxEl.classList.add('hidden');
        return;
      }

      if (pixelStreamPanel.isVisible()) {
        e.preventDefault();
        pixelStreamPanel.hide();
        return;
      }

      if (closeVisibleSidePanel()) {
        e.preventDefault();
        return;
      }

      if (!bboxDrawer.isDrawing()) {
        return;
      }

      e.preventDefault();

      if (bboxDrawer.hasSelection()) {
        clearSelectionAndResetUI(true);
        return;
      }

      bboxDrawer.cancelDrawing();
      setDrawButtonIdle();
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
      const bbox = bookmark.bbox;

      // Transform bbox corners from EPSG:3006 to WGS84 (lon/lat) for MapLibre
      const [minLon, minLat] = proj4('EPSG:3006', 'EPSG:4326', [bbox.minX, bbox.minY]);
      const [maxLon, maxLat] = proj4('EPSG:3006', 'EPSG:4326', [bbox.maxX, bbox.maxY]);

      // Fit the view to the extent with some padding
      map.fitBounds(
        [[minLon, minLat], [maxLon, maxLat]],
        { padding: 50, duration: 500 }
      );

      // Update UI to reflect that a bbox is loaded (not actively drawing)
      setDrawButtonIdle();

      // Hide bookmark panel
      bookmarkPanel.hide();
      if (lastOpenedPanel === 'bookmarks') {
        lastOpenedPanel = jobTracker.isVisible() ? 'jobs' : null;
      }
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

    // Enable/disable save button based on bbox state
    appState.on('bbox-changed', (bbox) => {
      saveBookmarkBtn.disabled = !bbox;
    });

    // Handle bounding box drawn event
    bboxDrawer.onBBoxDrawn(async (bbox: BoundingBox) => {
      if (bboxDrawer.isDrawing()) {
        setDrawButtonActive();
      } else {
        setDrawButtonIdle();
      }

      // Store in centralized state (immediate feedback)
      appState.setBbox(bbox);
      emitCesiumOriginFromBbox(bbox);

      // Update header area display (immediate feedback)
      const area = bboxDrawer.getCurrentBBoxArea();
      if (area) {
        const areaKm2 = area.areaM2 / 1_000_000;
        if (areaDisplay && bboxStatus) {
          areaDisplay.textContent = `${areaKm2.toFixed(2)} km²`;
          bboxStatus.classList.remove('hidden');
          bboxStatus.classList.add('flex');
        }
      }

      // Clear any existing debounce timer
      if (bboxDebounceTimer !== null) {
        window.clearTimeout(bboxDebounceTimer);
      }

      // If dialog is not visible (first draw), fetch immediately
      // If dialog is already visible (adjusting bbox), debounce the API call
      const isDialogVisible = datasetDialog.isVisible();

      const fetchAndShowDatasets = async () => {
        try {
          const datasets = await fetchDatasetList();
          appState.setDatasets(datasets);
          datasetDialog.showDatasetList(datasets);
        } catch (error) {
          console.error('Error fetching dataset list:', error);
          alert('Failed to fetch dataset list. Make sure the server is running.');
        }
      };

      if (isDialogVisible) {
        // Dialog already visible - debounce to prevent excessive calls during adjustment
        bboxDebounceTimer = window.setTimeout(fetchAndShowDatasets, BBOX_DEBOUNCE_DELAY);
      } else {
        // First draw - fetch immediately for better UX
        await fetchAndShowDatasets();
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

    // Handle form submission - submit to job queue or UE artifact pipeline
    datasetDialog.onSubmit(
      async (datasetName: string, values: Record<string, unknown>, sendToUE: boolean) => {
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
            filename,
          };

          if (sendToUE) {
            // Submit to UE artifact pipeline
            const response = await jobService.submitArtifact(request);

            // Add job to tracker with UE artifact tag
            jobTracker.addJob({
              id: response.artifact_id,
              dataset: datasetName,
              status: response.status as 'queued',
              filename: null,
              error: null,
              created_at: new Date().toISOString(),
              completed_at: null,
              download_url: null,
              params: { ...parameters, bounds: bboxToArray(bbox), __ue_artifact: true },
            });

            // Update status: success
            datasetDialog.updateSubmissionStatus({
              state: SubmissionState.SUCCESS,
              message: 'Artifact submitted! It will be sent to UE when ready.',
            });
          } else {
            // Submit to regular job queue
            const response = await jobService.submitJob(request);

            // Add job to tracker with initial state
            jobTracker.addJob({
              id: response.job_id,
              dataset: datasetName,
              status: response.status as 'queued',
              filename: null,
              error: null,
              created_at: new Date().toISOString(),
              completed_at: null,
              download_url: null,
            });

            // Update status: success
            datasetDialog.updateSubmissionStatus({
              state: SubmissionState.SUCCESS,
              message: 'Job submitted! Track progress in Datasets panel.',
            });
          }

          // Show job tracker panel
          jobTracker.show();
          lastOpenedPanel = 'jobs';

          // Return to dataset list after brief delay
          setTimeout(() => {
            const datasets = appState.getDatasets();
            if (datasets && datasets.length > 0) {
              datasetDialog.showDatasetList(datasets);
            } else {
              datasetDialog.hide();
            }
          }, 2000);
        } catch (error: any) {
          console.error('Error submitting job:', error);

          // Update status: error
          datasetDialog.updateSubmissionStatus({
            state: SubmissionState.ERROR,
            message: error.message || 'Failed to submit job',
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
