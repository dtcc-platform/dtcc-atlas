import { BoundingBox, DatasetRequest } from '../types';

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
