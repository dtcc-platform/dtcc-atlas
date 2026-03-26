import { describe, expect, it } from 'vitest'
import { get } from 'svelte/store'
import {
  disableGeoJsonLayer,
  enableGeoJsonLayer,
  enabledGeoJsonLayers,
  geoJsonLayerErrors,
  geoJsonLayerStatusByDataset,
  setGeoJsonLayerError,
  setGeoJsonLayerStatus,
} from './ui'

describe('GeoJSON layer UI stores', () => {
  it('tracks enabled layers without duplicates', () => {
    enabledGeoJsonLayers.set([])
    enableGeoJsonLayer('roads')
    enableGeoJsonLayer('roads')
    enableGeoJsonLayer('parcels')

    expect(get(enabledGeoJsonLayers)).toEqual(['roads', 'parcels'])

    disableGeoJsonLayer('roads')
    expect(get(enabledGeoJsonLayers)).toEqual(['parcels'])
  })

  it('stores per-layer status and error state', () => {
    geoJsonLayerStatusByDataset.set({})
    geoJsonLayerErrors.set({})

    setGeoJsonLayerStatus('roads', 'loading')
    setGeoJsonLayerError('roads', 'Preview not available')

    expect(get(geoJsonLayerStatusByDataset)).toEqual({ roads: 'loading' })
    expect(get(geoJsonLayerErrors)).toEqual({ roads: 'Preview not available' })
  })
})
