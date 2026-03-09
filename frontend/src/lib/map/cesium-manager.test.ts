import { describe, expect, it } from 'vitest'
import {
  clampCameraCenterToBounds,
  expandBounds,
  resolveQualityProfile,
  type LonLatBounds,
} from './map3d-utils'

describe('resolveQualityProfile', () => {
  it('returns mobile for narrow viewport', () => {
    expect(resolveQualityProfile(600, 0)).toBe('mobile')
  })

  it('returns mobile for touch-first devices', () => {
    expect(resolveQualityProfile(1440, 2)).toBe('mobile')
  })

  it('returns desktop for wide non-touch devices', () => {
    expect(resolveQualityProfile(1440, 0)).toBe('desktop')
  })
})

describe('expandBounds', () => {
  it('expands bounds with factor and preserves center', () => {
    const input: LonLatBounds = { minLon: 10, minLat: 59, maxLon: 11, maxLat: 60 }
    const output = expandBounds(input, 2)
    expect(output.minLon).toBeCloseTo(9.5)
    expect(output.maxLon).toBeCloseTo(11.5)
    expect(output.minLat).toBeCloseTo(58.5)
    expect(output.maxLat).toBeCloseTo(60.5)
  })
})

describe('clampCameraCenterToBounds', () => {
  it('clamps coordinates outside bounds', () => {
    const bounds: LonLatBounds = { minLon: 10, minLat: 59, maxLon: 11, maxLat: 60 }
    const clamped = clampCameraCenterToBounds(12, 58, bounds)
    expect(clamped.lon).toBe(11)
    expect(clamped.lat).toBe(59)
    expect(clamped.clamped).toBe(true)
  })

  it('keeps coordinates unchanged when inside bounds', () => {
    const bounds: LonLatBounds = { minLon: 10, minLat: 59, maxLon: 11, maxLat: 60 }
    const clamped = clampCameraCenterToBounds(10.4, 59.6, bounds)
    expect(clamped.lon).toBe(10.4)
    expect(clamped.lat).toBe(59.6)
    expect(clamped.clamped).toBe(false)
  })
})
