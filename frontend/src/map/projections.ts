import proj4 from 'proj4';

// SWEREF99 TM (EPSG:3006) - Swedish National Grid
const EPSG3006_DEF = '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs';

export function registerProjections(): void {
  // Register EPSG:3006 with proj4
  proj4.defs('EPSG:3006', EPSG3006_DEF);

  console.log('Projections registered successfully');
}

export function transformCoordinates(
  coords: [number, number],
  fromCRS: string,
  toCRS: string
): [number, number] {
  return proj4(fromCRS, toCRS, coords);
}
