import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchDatasetGeoJsonPreview } from './dataset-api'

describe('fetchDatasetGeoJsonPreview', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns a parsed feature collection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          type: 'FeatureCollection',
          features: [{ type: 'Feature', geometry: null, properties: {} }],
        }),
      }),
    )

    const data = await fetchDatasetGeoJsonPreview('uploaded-layer')
    expect(data.type).toBe('FeatureCollection')
    expect(data.features).toHaveLength(1)
  })

  it('maps 415 to a preview-specific error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 415,
        statusText: 'Unsupported Media Type',
      }),
    )

    await expect(fetchDatasetGeoJsonPreview('bad-layer')).rejects.toThrow(
      'Preview not available for this dataset',
    )
  })

  it('rejects empty feature collections', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          type: 'FeatureCollection',
          features: [],
        }),
      }),
    )

    await expect(fetchDatasetGeoJsonPreview('empty-layer')).rejects.toThrow(
      'No renderable GeoJSON features',
    )
  })
})
