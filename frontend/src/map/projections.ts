import proj4 from 'proj4';
import { register } from 'ol/proj/proj4';
import { get as getProjection } from 'ol/proj';

// SWEREF99 TM (EPSG:3006) - Swedish National Grid
// Definition from EPSG.io
const EPSG3006_DEF = '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs';

export function registerProjections(): void {
  // Register EPSG:3006 with proj4
  proj4.defs('EPSG:3006', EPSG3006_DEF);

  // Register with OpenLayers
  register(proj4);

  // Validate projection registration
  const projection = getProjection('EPSG:3006');
  if (!projection) {
    throw new Error('Failed to register EPSG:3006 projection');
  }

  console.log('Projections registered successfully');
}

export function transformCoordinates(
  coords: [number, number],
  fromCRS: string,
  toCRS: string
): [number, number] {
  return proj4(fromCRS, toCRS, coords);
}
