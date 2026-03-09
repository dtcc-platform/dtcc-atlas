export type LonLatBounds = {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
};

export type Map3DQuality = 'desktop' | 'mobile';

export function resolveQualityProfile(viewportWidth: number, maxTouchPoints: number): Map3DQuality {
  return viewportWidth <= 768 || maxTouchPoints > 0 ? 'mobile' : 'desktop';
}

function boundsCenter(bounds: LonLatBounds): { lon: number; lat: number } {
  return {
    lon: (bounds.minLon + bounds.maxLon) / 2,
    lat: (bounds.minLat + bounds.maxLat) / 2,
  };
}

export function expandBounds(bounds: LonLatBounds, factor: number): LonLatBounds {
  const center = boundsCenter(bounds);
  const halfWidth = ((bounds.maxLon - bounds.minLon) / 2) * factor;
  const halfHeight = ((bounds.maxLat - bounds.minLat) / 2) * factor;
  const minDelta = 0.002;
  return {
    minLon: center.lon - Math.max(halfWidth, minDelta),
    minLat: center.lat - Math.max(halfHeight, minDelta),
    maxLon: center.lon + Math.max(halfWidth, minDelta),
    maxLat: center.lat + Math.max(halfHeight, minDelta),
  };
}

export function clampCameraCenterToBounds(
  lon: number,
  lat: number,
  bounds: LonLatBounds,
): { lon: number; lat: number; clamped: boolean } {
  const nextLon = Math.min(bounds.maxLon, Math.max(bounds.minLon, lon));
  const nextLat = Math.min(bounds.maxLat, Math.max(bounds.minLat, lat));
  return {
    lon: nextLon,
    lat: nextLat,
    clamped: nextLon !== lon || nextLat !== lat,
  };
}
