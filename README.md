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
2. Click "Draw Bounding Box" button
3. Drag on the map to create a rectangle
   - The bounding box size is automatically constrained to the maximum allowed area (10 km² by default)
   - You cannot drag beyond this limit - the box will stop growing when the maximum is reached
4. Release to capture the area
5. Coordinates are automatically converted to EPSG:3006 (SWEREF99 TM)
6. The bounding box coordinates and area are displayed and logged to console
7. Click "Clear" to remove the bounding box and draw a new one

**Note**: The bounding box is constrained in real-time, so you cannot draw an area larger than the configured maximum.

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
