import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GeoJsonFeatureCollection } from '../types'

const dataSourceAdd = vi.fn(async (dataSource) => dataSource)
const dataSourceRemove = vi.fn()
const viewerFlyTo = vi.fn(async () => {})
const geoJsonLoad = vi.fn()

vi.mock('cesium', () => {
  class MockColor {
    name: string
    alpha: number

    constructor(name: string, alpha = 1) {
      this.name = name
      this.alpha = alpha
    }

    withAlpha(alpha: number) {
      return new MockColor(this.name, alpha)
    }
  }

  class MockGeoJsonDataSource {
    static load = geoJsonLoad
  }

  return {
    Cartesian3: {
      fromDegrees: vi.fn(() => ({})),
      distance: vi.fn(() => 1000),
    },
    Cartographic: {
      fromCartesian: vi.fn(() => null),
    },
    Cesium3DTileset: class {},
    Cesium3DTileStyle: class {},
    Color: Object.assign(MockColor, {
      ORANGE: new MockColor('orange'),
      CYAN: new MockColor('cyan'),
      WHITE: new MockColor('white'),
    }),
    ColorMaterialProperty: class {
      constructor(public color: unknown) {}
    },
    ConstantProperty: class {
      constructor(public value: unknown) {}
    },
    createWorldTerrainAsync: vi.fn(),
    GeoJsonDataSource: MockGeoJsonDataSource,
    HeadingPitchRange: class {},
    Ion: { defaultAccessToken: '' },
    Math: {
      toDegrees: vi.fn((value) => value),
      toRadians: vi.fn((value) => value),
    },
    OpenStreetMapImageryProvider: class {},
    Rectangle: {
      fromDegrees: vi.fn(() => ({})),
    },
    SceneMode: { SCENE3D: 3 },
    Viewer: class {},
  }
})

import { CesiumManager } from './cesium-manager'

describe('CesiumManager GeoJSON layers', () => {
  const geojson: GeoJsonFeatureCollection = {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: null, properties: {} }],
  }

  beforeEach(() => {
    dataSourceAdd.mockClear()
    dataSourceRemove.mockClear()
    viewerFlyTo.mockClear()
    geoJsonLoad.mockReset()
    geoJsonLoad.mockResolvedValue({
      entities: {
        values: [{ point: {}, polyline: {}, polygon: {}, label: {}, billboard: {} }],
      },
      show: false,
    })
  })

  it('loads and caches a GeoJSON datasource', async () => {
    const manager = new CesiumManager()
    ;(manager as any).viewer = {
      dataSources: { add: dataSourceAdd, remove: dataSourceRemove },
      flyTo: viewerFlyTo,
    }

    await manager.loadGeoJsonLayer('roads', geojson, { zoomTo: true })

    expect(geoJsonLoad).toHaveBeenCalledTimes(1)
    expect(dataSourceAdd).toHaveBeenCalledTimes(1)
    expect(manager.hasGeoJsonLayer('roads')).toBe(true)
    expect(manager.getGeoJsonLayerState()).toEqual({ enabledDatasetNames: ['roads'] })
    expect(viewerFlyTo).toHaveBeenCalledTimes(1)
  })

  it('shows, hides, and removes cached layers without reloading', async () => {
    const manager = new CesiumManager()
    ;(manager as any).viewer = {
      dataSources: { add: dataSourceAdd, remove: dataSourceRemove },
      flyTo: viewerFlyTo,
    }

    await manager.loadGeoJsonLayer('parcels', geojson)
    manager.hideGeoJsonLayer('parcels')
    expect(manager.getGeoJsonLayerState()).toEqual({ enabledDatasetNames: [] })

    manager.showGeoJsonLayer('parcels')
    expect(manager.getGeoJsonLayerState()).toEqual({ enabledDatasetNames: ['parcels'] })

    await manager.loadGeoJsonLayer('parcels', geojson)
    expect(geoJsonLoad).toHaveBeenCalledTimes(1)

    manager.removeGeoJsonLayer('parcels')
    expect(manager.hasGeoJsonLayer('parcels')).toBe(false)
    expect(dataSourceRemove).toHaveBeenCalledTimes(1)
  })
})
