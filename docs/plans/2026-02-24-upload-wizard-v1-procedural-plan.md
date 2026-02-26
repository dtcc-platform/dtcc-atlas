# DTCC Atlas Upload Wizard V1 (Procedural) Plan

Date: 2026-02-24  
Status: Implemented in dtcc-atlas (V1 baseline)  
Owner: dtcc-atlas

## 1. Goal

Implement a fully procedural (non-LLM-dependent) Upload Wizard that lets users upload files/folders, automatically detects data type, ingests to Atlas-managed storage, and exposes uploaded datasets as first-class candidates in the existing dataset workflow.

## 2. V1 Scope

### In scope
- UI: Upload wizard flow in Atlas frontend:
  - select files/folder
  - review procedural detection results
  - trigger ingestion
  - see completion/failures
- Backend:
  - upload batch endpoint (multipart files)
  - procedural detection + grouping
  - ingestion pipeline
  - SQLite catalog
  - listing uploaded datasets
- Atlas integration:
  - include uploaded datasets in `/api/v1/datasets/list`
  - support uploaded datasets in `/api/v1/datasets/get_args/{name}`
  - support uploaded datasets in `/api/v1/datasets/download`
  - support uploaded datasets in async jobs path (`/api/v1/jobs/*`)

### Out of scope (deferred)
- AI/LLM-assisted detection or remediation
- access control / multi-tenant auth model
- resumable/chunked upload protocol for extremely large uploads
- full automated harmonization/conflation across multiple uploaded datasets

## 3. Architecture

### 3.1 Repo split (V1)
- `dtcc-atlas`:
  - Upload Wizard UX
  - upload APIs
  - ingestion orchestration
  - storage and SQLite catalog
  - endpoint/job integration
- `dtcc-core`:
  - reused as dependency for procedural file introspection and IO loading
  - no mandatory upstream refactor in V1

### 3.2 Storage layout
- Raw immutable uploads:
  - `data/uploads/raw/<batch_id>/...`
- Catalog-managed canonical datasets:
  - `data/catalog/datasets/<dataset_name>/v<version>/...`
- SQLite:
  - `data/catalog/atlas_catalog.db`

### 3.3 Procedural pipeline
1. Accept upload batch (multipart)
2. Persist raw files
3. Group related files (sidecar sets)
4. Detect type by extension + inspection + parse attempt
5. Produce candidates with confidence and warnings
6. User confirms/overrides
7. Ingest selected candidates
8. Register dataset versions in catalog
9. Expose in existing dataset and jobs flows

## 4. Data Model (SQLite)

### Tables
- `upload_batches`
  - id, created_at, status, root_dir, file_count, total_bytes
- `upload_files`
  - id, batch_id, rel_path, abs_path, ext, size, sha256
- `upload_candidates`
  - id, batch_id, candidate_key, name, inferred_type, role, confidence
  - primary_rel_path, group_rel_paths_json
  - warnings_json, metadata_json
- `uploaded_datasets`
  - id, dataset_name, title, version, inferred_type, role
  - source_batch_id, storage_dir, primary_file, format
  - crs, bounds_json, metadata_json, status, created_at

## 5. API (V1)

### Upload APIs
- `POST /api/v1/uploads/batches`
  - multipart files
  - response: batch metadata + detection candidates
- `GET /api/v1/uploads/batches/{batch_id}`
  - response: batch + candidates
- `POST /api/v1/uploads/batches/{batch_id}/ingest`
  - request: per-candidate keep/name/role/crs overrides
  - response: per-candidate ingest results
- `GET /api/v1/uploads/datasets`
  - response: all uploaded datasets from catalog

### Existing API integration
- `/api/v1/datasets/list`: include uploaded entries
- `/api/v1/datasets/get_args/{dataset_name}`: return schema for uploaded datasets
- `/api/v1/datasets/download`: handle uploaded datasets
- `/api/v1/jobs/*`: allow uploaded datasets in worker path

## 6. Detection strategy (procedural)

### Grouping
- Shapefile sidecar groups (`.shp/.shx/.dbf/.prj/...`)
- XDMF+H5 pairs (`.xdmf` + `.h5`)
- single-file candidates otherwise

### Type inference
- suffix map:
  - point cloud: `.las`, `.laz`, `.csv`
  - raster: `.tif`, `.tiff`, `.asc`, `.png`, `.jpg`
  - vector: `.geojson`, `.json`, `.gpkg`, `.shp`
  - mesh: `.obj`, `.stl`, `.ply`, `.vtk`, `.vtu`, `.xdmf`, `.inp`, `.bdf`
  - city model: `CityJSON` (`.json`, `.json.zip`, content signature)
- confidence:
  - high: extension + successful inspection/parse
  - medium: extension suggests type but inspection fails
  - low: unknown

### Inspection
- Use `dtcc_core.io.info_*` where applicable
- collect bounds/crs/count/type metadata when available

## 7. Ingestion behavior

### Canonicalization
- Copy raw grouped files to dataset version directory.
- For vector datasets:
  - produce canonical `data.geojson` for uniform clipping/download behavior.
- For other datasets:
  - keep primary file path and metadata.

### Versioning
- Preserve immutable version directories (`v1`, `v2`, ...).
- New ingestion with same dataset name increments version.

## 8. Frontend UX V1

### Wizard states
- `select` -> `review` -> `ingesting` -> `complete`

### Capabilities
- file/folder selection (`multiple`, `webkitdirectory`)
- review candidates + edit name/role/crs
- run ingest
- completion summary with quick follow-up action

## 9. Testing strategy

### Backend
- catalog schema + CRUD smoke tests
- detection grouping/type inference tests
- ingestion success/failure tests (tmp dirs)
- API route tests for batch/ingest/list

### Frontend
- basic interaction checks via manual verification in V1
- full component tests deferred

## 10. Future V1.1/V2 extensions
- Add LLM assist mode for warning explanation and suggestions
- Add resumable uploads for large datasets
- Add ACL/multi-user ownership model
- Move shared ingestion primitives to `dtcc-core` public API

## 11. Implementation snapshot (current branch)

### Implemented
- Backend upload module (`server/upload`):
  - batch upload endpoint with raw staging
  - procedural grouping/type detection
  - candidate review payloads
  - ingestion into versioned catalog storage
  - SQLite catalog persistence
- Integration into existing Atlas APIs:
  - uploaded datasets included in dataset list
  - uploaded schemas available through `get_args`
  - uploaded downloads available in sync API
  - uploaded datasets supported by async job worker
- Frontend UX:
  - Upload wizard panel with `select -> review -> ingesting -> complete`
  - candidate overrides (keep/name/role/crs)
  - toolbar entry and side-panel routing
  - post-ingest dataset list refresh
- Validation:
  - frontend production build passes
  - targeted upload unit tests added and passing

### Deferred by design
- No LLM/MCP path in V1
- No resumable/chunked uploads
- No auth/multi-tenant ownership
- No generic ingestion library extraction to `dtcc-core` yet
