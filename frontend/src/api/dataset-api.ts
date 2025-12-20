import { BoundingBox, DatasetRequest } from '../types';
import { API_BASE_URL } from '../config';

/**
 * Fetches the list of available datasets from the API
 */
export async function fetchDatasetList(): Promise<string[]> {
  const response = await fetch(`${API_BASE_URL}/datasets/list`);

  if (!response.ok) {
    throw new Error(`Failed to fetch dataset list: ${response.statusText}`);
  }

  const data = await response.json();
  return data.datasets;
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
