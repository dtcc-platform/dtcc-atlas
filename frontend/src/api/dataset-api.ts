import {
  BoundingBox,
  DatasetRequest,
  DatasetDownloadRequest,
  DatasetDownloadResponse,
  DatasetInfo,
} from '../types';
import { DatasetSchemaResponse } from '../types/json-schema';
import { API_BASE_URL } from '../config';

/**
 * Fetches the list of available datasets from the API
 * Returns DatasetInfo objects with name, type, and source
 */
export async function fetchDatasetList(): Promise<DatasetInfo[]> {
  const response = await fetch(`${API_BASE_URL}/datasets/list`);

  if (!response.ok) {
    throw new Error(`Failed to fetch dataset list: ${response.statusText}`);
  }

  const data = await response.json();

  // Handle both old format (string[]) and new format (DatasetInfo[])
  if (data.datasets && data.datasets.length > 0) {
    if (typeof data.datasets[0] === 'string') {
      // Old format: convert to DatasetInfo
      return data.datasets.map((name: string) => ({
        name,
        type: 'raster',
        source: 'dtcc-core'
      }));
    }
    // New format: already DatasetInfo[]
    return data.datasets;
  }

  return [];
}

/**
 * Fetches the JSON Schema for a specific dataset
 * @param datasetName - Name of the dataset
 * @returns JSON Schema object with field definitions
 * @throws Error if request fails or dataset not found
 */
export async function fetchDatasetSchema(
  datasetName: string
): Promise<DatasetSchemaResponse> {
  const response = await fetch(
    `${API_BASE_URL}/datasets/get_args/${encodeURIComponent(datasetName)}`
  );

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Dataset "${datasetName}" not found`);
    }
    throw new Error(`Failed to fetch schema: ${response.statusText}`);
  }

  const schema = await response.json();
  return schema as DatasetSchemaResponse;
}

/**
 * Submits a dataset download request and triggers file download
 * @param request - Dataset download request with bounds and parameters
 * @returns Success message
 * @throws Error if submission fails
 */
export async function submitDatasetDownload(
  request: DatasetDownloadRequest
): Promise<DatasetDownloadResponse> {
  const response = await fetch(`${API_BASE_URL}/datasets/download`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.detail ||
        errorData.message ||
        `Download request failed: ${response.statusText}`
    );
  }

  // Get the binary data as a blob
  const blob = await response.blob();

  // Extract filename from Content-Disposition header
  const contentDisposition = response.headers.get('Content-Disposition');
  let filename = `${request.dataset}_download`; // Default fallback

  if (contentDisposition) {
    const filenameMatch = contentDisposition.match(/filename=([^;]+)/);
    if (filenameMatch) {
      // Use the filename from server directly - it already has the correct extension
      filename = filenameMatch[1].replace(/['"]/g, '');
    }
  }

  // If no Content-Disposition header, add a generic extension
  if (!contentDisposition) {
    filename = `${filename}.bin`;
  }

  // Create a temporary URL for the blob
  const url = window.URL.createObjectURL(blob);

  // Create a temporary anchor element and trigger download
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();

  // Clean up
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);

  return {
    success: true,
    message: `Dataset downloaded successfully as ${filename}`,
  };
}

/**
 * Converts BoundingBox object to array format for API
 * @param bbox - BoundingBox object
 * @returns Array [minX, minY, maxX, maxY]
 */
export function bboxToArray(bbox: BoundingBox): number[] {
  return [bbox.minX, bbox.minY, bbox.maxX, bbox.maxY];
}

export async function requestDataset(bounds: BoundingBox): Promise<void> {
  // Mock implementation - console log the data
  const request: DatasetRequest = {
    bounds,
  };

  console.log('Dataset request:', {
    ...request,
    timestamp: new Date().toISOString(),
  });

  // Future implementation:
  // const response = await fetch('/api/dataset/download', {
  //   method: 'POST',
  //   headers: {
  //     'Content-Type': 'application/json',
  //   },
  //   body: JSON.stringify(request),
  // });
  //
  // if (!response.ok) {
  //   throw new Error(`API request failed: ${response.statusText}`);
  // }
  //
  // return response.json();
}
