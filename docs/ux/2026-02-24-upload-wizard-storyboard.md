# DTCC Atlas Upload Wizard Storyboard

Date: 2026-02-24  
Status: Draft for team discussion

## Objective
Enable users to drop in their own data and have DTCC Atlas automatically detect, ingest, and expose it as first-class datasets for visualization, analysis, and simulation.

## Primary User Story
As an analyst/planner, I want to upload a folder of geospatial files without knowing all format details, so Atlas can make the data usable in the same workflows as built-in datasets.

## Storyboard Frames

### Frame 1: Entry Point
User sees a new `Upload Data` action in the toolbar/header and an empty-state CTA inside the datasets panel.

Intent:
- Make upload discoverable from where dataset work already starts.
- Position this as part of normal workflow, not an admin-only side path.

Success signal:
- User immediately understands "I can bring my own files here."

### Frame 2: File Drop
Upload Wizard opens as a modal/panel:
- Drop zone supports both files and folders.
- User can browse manually or drag-and-drop.
- Wizard shows selected items count and total size.

Intent:
- Keep the first step frictionless.

Success signal:
- User can add mixed inputs in one shot.

### Frame 3: Auto Detection + Grouping
System scans files and shows a review table:
- Grouped logical dataset candidates (not raw files).
- Inferred type (point cloud, raster, buildings/vector, city model, mesh, unknown).
- Confidence (high/medium/low).
- CRS and bounds (if detected).
- Warnings (missing sidecar, unsupported geometry, mixed CRS).

Intent:
- Make "automagic" visible and explainable.

Success signal:
- User trusts detection but can override.

### Frame 4: User Confirmation
For each candidate, user can set:
- Dataset name
- Intended role (buildings, terrain, point cloud, road network, generic vector)
- CRS override (if needed)
- Keep/discard toggle

Intent:
- Put user in control of ambiguous or risky decisions.

Success signal:
- User can fix uncertain cases without leaving wizard.

### Frame 5: Ingestion
User clicks `Ingest`.
Progress view shows pipeline stages:
- Upload/stage
- Parse/validate
- Transform/normalize
- Register in Atlas catalog

Per-dataset status:
- Success
- Success with warnings
- Failed (with actionable reason)

Intent:
- Make long-running jobs transparent and recoverable.

Success signal:
- User can continue with partial success instead of full rollback.

### Frame 6: Completion
Wizard completion screen shows:
- Newly available datasets
- One-click `Open in Datasets`
- Optional "Use as preferred local source" toggle

Intent:
- Bridge directly into the existing map + dataset workflow.

Success signal:
- Uploaded data appears as first-class Atlas datasets.

### Frame 7: First-Class Use
User draws area and sees uploaded datasets in list with source badges:
- `user-uploaded`
- `dtcc-core`
- `published-vector`

User runs download/simulation; backend uses uploaded source where applicable.

Intent:
- Confirm the feature promise end-to-end.

Success signal:
- No distinction in user capability between uploaded and built-in data.

## UX Design Principles
- Progressive disclosure: simple first step, detail only when needed.
- Explainability over opacity: show what was detected and why.
- Safe defaults + explicit overrides.
- Recoverability: partial success and targeted retry.
- Provenance visibility: always show source and version.

## Open Questions For Team Review
1. Wizard as full-screen flow or right-side panel flow?
2. Should low-confidence detections block ingestion by default?
3. Should role mapping be required or optional in v1?
4. Should ingestion auto-publish immediately or create a draft state first?

