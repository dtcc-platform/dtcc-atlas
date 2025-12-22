import type { NominatimResult } from '../types';

/**
 * Search for locations using OpenStreetMap Nominatim API
 * Results are limited to Sweden only
 * @param query - The search query (e.g., "Stockholm", "Göteborg Central Station")
 * @returns Array of matching locations in Sweden
 * @throws Error if the API request fails
 */
export async function searchLocation(query: string): Promise<NominatimResult[]> {
  if (!query.trim()) {
    return [];
  }

  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
    query
  )}&format=json&limit=5&countrycodes=se`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'DTCC Dataset Downloader',
      },
    });

    if (!response.ok) {
      throw new Error(`Geocoding request failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Geocoding API error:', error);
    throw error;
  }
}
