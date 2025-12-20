# DTCC Dataset Downloader

A tool for downloading and processing DTCC datasets with an interactive map interface.

## Project Structure

- `frontend/` - TypeScript web application for interactive map-based dataset selection
- Python backend using FastAPI (to be developed)

## Frontend Application

The frontend is a vanilla TypeScript application built with Vite that allows users to:
- View a 2D map centered on Sweden
- Draw bounding boxes on the map
- Automatically convert coordinates to EPSG:3006 (SWEREF99 TM)
- Send bounding box data to the backend (currently mocked)

### Technology Stack

- **TypeScript** - Type-safe development
- **Vite** - Fast build tool with hot module replacement
- **OpenLayers** - Mapping library with excellent projection support
- **proj4** - Coordinate transformation library

### Setup

```bash
cd frontend
npm install
```

### Running the Development Server

```bash
cd frontend
npm run dev
```

This will start the development server at http://localhost:3000 with hot reloading enabled.

### Usage

1. The map will load centered on Sweden
2. **Draw**: Click and drag on the map to create a bounding box rectangle
   - The bounding box size is automatically constrained to the maximum allowed area (10 km² by default)
   - If you try to resize beyond this limit, the change will be reverted
3. **Resize**: After drawing, click and drag the corners or edges to resize
   - The box stays axis-aligned (edges remain parallel to map axes)
   - Cannot create arbitrary polygons or rotated rectangles
   - Size constraints apply during resize operations
4. **Move**: Click and drag anywhere inside the box to move it
5. Coordinates are automatically updated and converted to EPSG:3006 (SWEREF99 TM)
6. The bounding box coordinates and area are displayed and logged to console
7. Click "Clear Bounding Box" to remove and draw a new one

**Features**:
- Area constraint enforcement (prevents exceeding maximum size)
- Smooth dragging to reposition the bounding box
- Axis-aligned bounding box maintained at all times
- Resize via corners or edges (edges stay parallel to axes)
- Prevents creation of arbitrary polygons or rotated rectangles
- Automatic coordinate updates when moving or resizing
- Built on OpenLayers' Extent interaction for reliability

### Building for Production

```bash
cd frontend
npm run build
```

The built files will be in `frontend/dist/`.

### Preview Production Build

```bash
cd frontend
npm run preview
```

## Backend (To Be Developed)

The backend will provide an endpoint at `POST /api/dataset/download` to receive bounding box requests and process dataset downloads.

Expected request format:
```json
{
  "bounds": {
    "minX": 319180.0,
    "minY": 6399862.0,
    "maxX": 320500.0,
    "maxY": 6401200.0,
    "crs": "EPSG:3006"
  }
}
```

## Configuration

### Maximum Bounding Box Area

The application enforces a maximum bounding box area to prevent excessively large dataset requests. By default, this is set to **10 km²**.

To change this limit:
1. Open `frontend/src/config.ts`
2. Modify the `MAX_BBOX_AREA_KM2` constant:
   ```typescript
   export const MAX_BBOX_AREA_KM2 = 10; // Change this value
   ```
3. Save the file (the dev server will hot-reload)

This setting is **not exposed in the UI** and must be changed in the source code.

## Development

The frontend is configured to proxy API requests to `http://localhost:8000` when the backend is running.

## Coordinate Systems

- **Display**: EPSG:3857 (Web Mercator) - Standard web mapping projection
- **Output**: EPSG:3006 (SWEREF99 TM) - Swedish National Grid
- All transformations are handled automatically on the client side

## Testing Validation Points

You can verify coordinate transformations using these known locations:
- **Stockholm**: ~(674032, 6580822) in EPSG:3006
- **G�teborg**: ~(319180, 6399862) in EPSG:3006
- **Malm�**: ~(373050, 6161400) in EPSG:3006
