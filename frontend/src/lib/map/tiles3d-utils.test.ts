import { describe, expect, it } from 'vitest'
import { parseTilesetAssetIds } from './tiles3d-utils'

describe('parseTilesetAssetIds', () => {
  it('parses comma-separated integers', () => {
    expect(parseTilesetAssetIds('123,456,789')).toEqual([123, 456, 789])
  })

  it('ignores invalid and deduplicates', () => {
    expect(parseTilesetAssetIds('100, ,abc,-2,100,42')).toEqual([100, 42])
  })

  it('returns empty for missing input', () => {
    expect(parseTilesetAssetIds(undefined)).toEqual([])
  })
})
