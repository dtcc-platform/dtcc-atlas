# DTCC Atlas UI Rehaul Design

**Date**: 2026-02-21
**Status**: Approved
**Approach**: Svelte + Mapbox Studio-inspired redesign

## Context

DTCC Atlas is a map-based geospatial data tool for downloading Swedish urban datasets. Current UI is built with vanilla TypeScript, MapLibre GL JS, and TailwindCSS v4. Primary users are researchers and city planners.

### Problems with current UI
- Left toolbar is wide (180px) and dominates the screen
- Panel system is inconsistent — panels appear/disappear unpredictably
- Dataset workflow (draw bbox -> select dataset -> fill form -> download) feels disjointed
- Form titles show schema class names (e.g., "BuildingArgs") instead of human-readable names
- Job tracker takes up a full panel for minimal information
- Overall aesthetic is functional but unpolished

## Design Direction

Clean and minimal, inspired by Mapbox Studio. Dark chrome header, map fills the entire viewport, floating glass-effect controls, progressive disclosure.

## 1. Overall Layout

```
+-----------------------------------------------------------+
|  * DTCC Atlas                    Area: 2.4 km2    * Ready |  <- dark navy bar (32px)
+-----------------------------------------------------------+
|                                                           |
|  [--]                                                     |
|  [--]  <- compact icon toolbar                            |
|  [--]     (48px wide, floating,                           |
|  [--]      glass effect)              +----------------+  |
|                                       | Right Panel    |  |
|              FULL-SCREEN MAP          | (slides in)    |  |
|                                       |                |  |
|                +----------+           |                |  |
|                | drawn    |           |                |  |
|                | bbox     |           |                |  |
|                +----------+           +----------------+  |
|                                                           |
|                                    +-------------------+  |
|                                    | * 2 jobs running  |  |  <- toast tray
|                                    +-------------------+  |
+-----------------------------------------------------------+
```

- Header: 32px (slimmer than current 40px), deep navy (#1a1a2e)
- Toolbar: 48px wide icon-only buttons, grouped with dividers, glass background
- Right panel: Single slide-in container for datasets, forms, bookmarks
- Job tracker: Compact toast/pill at bottom-right, expandable on click
- Search: Floating command palette (Cmd+K), centered

## 2. Core Workflow: Draw -> Configure -> Download

Linear guided flow within one panel:

1. **No bbox**: Map shows subtle empty state prompt ("Draw an area to get started")
2. **Bbox drawn**: Right panel slides in with dataset list automatically
3. **Dataset selected**: Panel transitions to form view with back arrow
4. **Form submitted**: Inline success confirmation, option to pick another dataset or close. Job appears in toast tray.

Key changes:
- Panel appears automatically after drawing bbox (no manual "Datasets" click needed)
- Dataset names are human-readable (not schema class names)
- Post-submit keeps user in flow rather than dumping them

## 3. Compact Toolbar

48px wide, icon-only, three groups separated by dividers:

- **Actions**: Draw area, Clear, Save bookmark
- **Views**: Bookmarks, Datasets (badge dot when count > 0)
- **Tools**: Search, 3D toggle

Behaviors:
- Tooltip on hover (appears right of button)
- Active state: orange-tinted background
- Disabled state: dimmed opacity
- Badge: small colored dot (not number)

## 4. Search — Command Palette

Centered floating box triggered by toolbar icon or keyboard shortcut:
- Nominatim-powered location search
- Results as dropdown list below input
- Dismiss on Escape or selection
- Spotlight/Cmd+K aesthetic

## 5. Job Toast Tray

Bottom-right, minimal footprint:

- **Collapsed**: Small pill showing "* N jobs running"
- **Expanded**: Compact list with status per job, download links for completed, "Clear completed" action
- Replaces the current full-panel job tracker

## 6. Visual Design

### Colors
- Header: `#1a1a2e` (deep navy)
- Toolbar/panels bg: `#ffffff` at 80% opacity + `backdrop-blur` (glass)
- Primary accent: `#e35a1d` (DTCC orange)
- Success: `#22c55e`
- Text primary: `#1a1a2e`
- Text secondary: `#6b7280`
- Borders: `#e5e7eb`

### Typography (Montserrat)
- Header: 13px semibold
- Panel titles: 16px semibold
- Body/labels: 13px regular
- Help text: 12px secondary

### Form Fields
- 36px height, light border, orange focus ring
- 8px vertical gaps (tighter than current)
- Rounded-lg buttons, orange fill primary, ghost secondary

### Animations
- Panel slide-in: 200ms ease-out
- Tooltip fade: 100ms
- Toast appear: 150ms slide-up
- Map controls restyled to match glass aesthetic

## 7. Svelte Architecture

### Component Tree
```
App.svelte
  Header.svelte
  Toolbar.svelte
    ToolbarButton.svelte
  MapView.svelte
  SidePanel.svelte
    DatasetList.svelte
    DatasetForm.svelte
    BookmarkList.svelte
  SearchPalette.svelte
  JobTray.svelte
    JobItem.svelte
  EmptyState.svelte
```

### State Management (Svelte stores)
- `mapStore` — bbox, projection, view state
- `datasetStore` — available datasets, selected dataset, form state
- `jobStore` — active/completed jobs, SSE connection
- `bookmarkStore` — saved bookmarks (localStorage-backed)
- `uiStore` — active panel, search visibility, 3D mode

### Key Decisions
- SidePanel is a single container rendering different child views based on `uiStore.activePanel`
- MapLibre stays imperative, wrapped in MapView.svelte with onMount/onDestroy
- Form rendering remains dynamic (JSON schema -> Svelte form components)
- SSE/API layer ports directly, wired to stores instead of callbacks

### File Structure
```
frontend/src/
  App.svelte
  main.ts
  lib/
    components/          (Svelte components)
    stores/              (Svelte stores)
    api/                 (dataset-api, geocoding-api - port from current)
    services/            (job-service, notification - port from current)
    map/                 (map-manager, bbox-drawer, projections - port from current)
    forms/               (schema-parser, validator - port from current)
    types/               (TypeScript interfaces - unchanged)
  app.css                (Tailwind + custom theme)
  vite.config.ts
```

### Migration Strategy
API layer, services, map code, form parsing, and types port over nearly unchanged. The rewrite is concentrated in the UI layer: replacing ~7 class-based DOM manipulation components with ~12 Svelte components.
