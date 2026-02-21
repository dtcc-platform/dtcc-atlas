# DTCC Atlas UI Rehaul — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rewrite the DTCC Atlas frontend from vanilla TypeScript to Svelte with a Mapbox Studio-inspired design — compact icon toolbar, slide-in side panel, command palette search, toast job tray.

**Architecture:** Svelte 5 with Tailwind CSS v4 on Vite. MapLibre GL JS stays imperative, wrapped in a Svelte component. All existing API, service, map, and form-parsing code ports over with minimal changes. UI layer is fully rewritten as ~12 Svelte components with Svelte stores for state management.

**Tech Stack:** Svelte 5, Vite 6, TailwindCSS 4, MapLibre GL JS 4.7, proj4, TypeScript 5

**Design doc:** `docs/plans/2026-02-21-ui-rehaul-design.md`

---

## Task 1: Scaffold Svelte project alongside existing frontend

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/tsconfig.json`
- Create: `frontend/svelte.config.js`
- Create: `frontend/src/main.ts` (replace existing)
- Create: `frontend/src/App.svelte`
- Create: `frontend/src/app.css`

**Step 1: Install Svelte dependencies**

```bash
cd /Users/vasnas/scratch/dtcc-atlas/frontend
npm install svelte @sveltejs/vite-plugin-svelte
```

**Step 2: Update vite.config.ts for Svelte**

```ts
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte(), tailwindcss()],
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  }
})
```

**Step 3: Create svelte.config.js**

```js
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

export default {
  preprocess: vitePreprocess()
}
```

**Step 4: Update tsconfig.json for Svelte**

Add to compilerOptions:
```json
{
  "verbatimModuleSyntax": true,
  "moduleResolution": "bundler",
  "types": ["svelte"]
}
```

**Step 5: Create minimal App.svelte**

```svelte
<script lang="ts">
</script>

<div class="h-screen w-screen bg-gray-100">
  <p class="text-center pt-20 text-xl">DTCC Atlas — Svelte scaffold working</p>
</div>

<style>
</style>
```

**Step 6: Replace main.ts with Svelte mount**

```ts
import { mount } from 'svelte'
import App from './App.svelte'
import './app.css'

const app = mount(App, { target: document.getElementById('app')! })

export default app
```

**Step 7: Simplify index.html**

Replace the entire body content with just:
```html
<div id="app"></div>
<script type="module" src="/src/main.ts"></script>
```
Remove all existing toolbar/panel/dialog HTML — Svelte components will generate it.

**Step 8: Create app.css with Tailwind + DTCC theme**

Port the color palette and custom utilities from existing `style.css` (219 lines). Keep:
- `@import "tailwindcss"`
- `@theme` block with DTCC color variables
- Montserrat font import
- Spinner animation
- Tooltip CSS (can be ported to Svelte components later)

Drop: toolbar-btn, badge, shadow utilities (will be inline Tailwind in Svelte components).

**Step 9: Verify scaffold runs**

```bash
cd /Users/vasnas/scratch/dtcc-atlas/frontend && npm run dev
```

Open browser — should show "DTCC Atlas — Svelte scaffold working".

**Step 10: Commit**

```bash
git add frontend/
git commit -m "Scaffold Svelte 5 project with Vite and Tailwind"
```

---

## Task 2: Port types, config, and API layer

**Files:**
- Move: `frontend/src/types/*` → `frontend/src/lib/types/*` (unchanged content)
- Move: `frontend/src/config.ts` → `frontend/src/lib/config.ts` (unchanged)
- Move: `frontend/src/api/*` → `frontend/src/lib/api/*` (unchanged)
- Move: `frontend/src/forms/*` → `frontend/src/lib/forms/*` (unchanged)
- Move: `frontend/src/services/*` → `frontend/src/lib/services/*` (unchanged)
- Move: `frontend/src/map/projections.ts` → `frontend/src/lib/map/projections.ts` (unchanged)
- Move: `frontend/src/map/map-manager.ts` → `frontend/src/lib/map/map-manager.ts` (unchanged)
- Move: `frontend/src/map/bbox-drawer.ts` → `frontend/src/lib/map/bbox-drawer.ts` (unchanged)
- Move: `frontend/src/storage/*` → `frontend/src/lib/storage/*` (unchanged)
- Move: `frontend/src/bookmarks/*` → `frontend/src/lib/bookmarks/*` (unchanged)

**Step 1: Create lib directory structure**

```bash
cd /Users/vasnas/scratch/dtcc-atlas/frontend/src
mkdir -p lib/{types,api,forms,services,map,storage,bookmarks,stores,components}
```

**Step 2: Copy all non-UI source files into lib/**

```bash
cp src/types/* lib/types/
cp src/config.ts lib/config.ts
cp src/api/* lib/api/
cp src/forms/* lib/forms/
cp src/services/* lib/services/
cp src/map/* lib/map/
cp src/storage/* lib/storage/
cp src/bookmarks/* lib/bookmarks/
```

**Step 3: Fix import paths**

All internal imports need updating from `../types/` to `../types/` etc. — since the relative structure is preserved within `lib/`, most imports stay the same. Only imports that crossed from `ui/` into other directories need no changes since we're not porting the old `ui/` files.

Verify no broken imports:
```bash
cd /Users/vasnas/scratch/dtcc-atlas/frontend && npx tsc --noEmit
```

**Step 4: Verify dev server still starts**

```bash
npm run dev
```

**Step 5: Commit**

```bash
git add frontend/src/lib/
git commit -m "Port types, config, API, services, map, and form modules to lib/"
```

---

## Task 3: Create Svelte stores

**Files:**
- Create: `frontend/src/lib/stores/ui.ts`
- Create: `frontend/src/lib/stores/map.ts`
- Create: `frontend/src/lib/stores/datasets.ts`
- Create: `frontend/src/lib/stores/jobs.ts`
- Create: `frontend/src/lib/stores/bookmarks.ts`

**Step 1: Create uiStore**

```ts
// frontend/src/lib/stores/ui.ts
import { writable } from 'svelte/store'

export type PanelView = 'datasets' | 'dataset-form' | 'bookmarks' | null

export const activePanel = writable<PanelView>(null)
export const searchOpen = writable(false)
export const is3D = writable(false)
export const drawingActive = writable(false)

export function closeAllPanels() {
  activePanel.set(null)
  searchOpen.set(false)
}
```

**Step 2: Create mapStore**

```ts
// frontend/src/lib/stores/map.ts
import { writable, derived } from 'svelte/store'
import type { BoundingBox } from '../types'

export const bbox = writable<BoundingBox | null>(null)
export const bboxArea = derived(bbox, ($bbox) => {
  if (!$bbox) return 0
  const dx = $bbox.maxX - $bbox.minX
  const dy = $bbox.maxY - $bbox.minY
  return (dx * dy) / 1_000_000 // km²
})
```

**Step 3: Create datasetStore**

```ts
// frontend/src/lib/stores/datasets.ts
import { writable } from 'svelte/store'
import type { DatasetInfo } from '../types'
import type { FormConfig } from '../types/form-fields'

export const datasets = writable<DatasetInfo[]>([])
export const selectedDataset = writable<DatasetInfo | null>(null)
export const formConfig = writable<FormConfig | null>(null)
```

**Step 4: Create jobStore**

```ts
// frontend/src/lib/stores/jobs.ts
import { writable, derived } from 'svelte/store'
import type { Job } from '../services/job-service'

export const jobs = writable<Job[]>([])
export const activeJobCount = derived(jobs, ($jobs) =>
  $jobs.filter(j => j.status === 'queued' || j.status === 'processing').length
)
export const completedJobs = derived(jobs, ($jobs) =>
  $jobs.filter(j => j.status === 'complete' || j.status === 'failed')
)
export const jobTrayExpanded = writable(false)
```

**Step 5: Create bookmarkStore**

```ts
// frontend/src/lib/stores/bookmarks.ts
import { writable, derived } from 'svelte/store'
import type { SavedBookmark } from '../types/bookmarks'

export const bookmarks = writable<SavedBookmark[]>([])
export const bookmarkCount = derived(bookmarks, ($b) => $b.length)
```

**Step 6: Verify compilation**

```bash
cd /Users/vasnas/scratch/dtcc-atlas/frontend && npx tsc --noEmit
```

**Step 7: Commit**

```bash
git add frontend/src/lib/stores/
git commit -m "Add Svelte stores for UI, map, datasets, jobs, and bookmarks"
```

---

## Task 4: Build Header component

**Files:**
- Create: `frontend/src/lib/components/Header.svelte`

**Step 1: Create Header.svelte**

```svelte
<script lang="ts">
  import { bboxArea } from '../stores/map'
  import { jobService } from '../services/job-service'

  let connected = $state(false)

  $effect(() => {
    const interval = setInterval(() => {
      connected = jobService.isConnected()
    }, 2000)
    return () => clearInterval(interval)
  })
</script>

<header class="h-8 bg-[#1a1a2e] text-white flex items-center justify-between px-4 z-50">
  <div class="flex items-center gap-2">
    <h1 class="text-[13px] font-semibold tracking-tight">DTCC Atlas</h1>
    <span class="text-[11px] text-white/40 font-mono">v0.2.0</span>
  </div>
  <div class="flex items-center gap-4 text-[12px]">
    {#if $bboxArea > 0}
      <div class="flex items-center gap-1.5">
        <div class="w-1.5 h-1.5 rounded-full bg-[#e35a1d]"></div>
        <span class="text-white/60">Area:</span>
        <span class="font-mono">{$bboxArea.toFixed(2)} km²</span>
      </div>
    {/if}
    <div class="flex items-center gap-1.5">
      <div class="w-1.5 h-1.5 rounded-full {connected ? 'bg-green-400' : 'bg-red-400'}"></div>
      <span class="text-white/60">{connected ? 'Ready' : 'Disconnected'}</span>
    </div>
  </div>
</header>
```

**Step 2: Wire into App.svelte**

```svelte
<script lang="ts">
  import Header from './lib/components/Header.svelte'
</script>

<div class="h-screen w-screen flex flex-col">
  <Header />
  <div class="flex-1 relative">
    <p class="text-center pt-20">Map will go here</p>
  </div>
</div>
```

**Step 3: Verify in browser**

Dark navy header bar with "DTCC Atlas v0.2.0" and a status indicator.

**Step 4: Commit**

```bash
git add frontend/src/lib/components/Header.svelte frontend/src/App.svelte
git commit -m "Add Header component with status indicators"
```

---

## Task 5: Build MapView component

**Files:**
- Create: `frontend/src/lib/components/MapView.svelte`
- Modify: `frontend/src/App.svelte`

**Step 1: Create MapView.svelte**

This wraps the imperative MapLibre map and BBoxDrawer. Uses `onMount`/`onDestroy`.

```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { mapManager } from '../map/map-manager'
  import { BBoxDrawer } from '../map/bbox-drawer'
  import { registerProjections } from '../map/projections'
  import { bbox } from '../stores/map'
  import { datasets } from '../stores/datasets'
  import { activePanel, drawingActive } from '../stores/ui'
  import { fetchDatasetList } from '../api/dataset-api'
  import type { BoundingBox } from '../types'

  let mapContainer: HTMLDivElement
  let drawer: BBoxDrawer | null = null

  onMount(() => {
    registerProjections()
    const map = mapManager.initializeMap(mapContainer)

    drawer = new BBoxDrawer(map)
    drawer.onBBoxDrawn((drawnBbox: BoundingBox) => {
      bbox.set(drawnBbox)
      drawingActive.set(false)

      // Auto-fetch datasets and open panel
      fetchDatasetList().then((list) => {
        datasets.set(list)
        activePanel.set('datasets')
      })
    })
  })

  // React to drawingActive store changes
  $effect(() => {
    if (!drawer) return
    if ($drawingActive) {
      drawer.enableDrawing()
    } else {
      drawer.disableDrawing()
    }
  })

  onDestroy(() => {
    drawer?.clearBoundingBox()
  })

  export function clearBbox() {
    drawer?.clearBoundingBox()
    bbox.set(null)
    activePanel.set(null)
  }

  export function loadBbox(b: BoundingBox) {
    drawer?.loadExtent(b)
    bbox.set(b)
    fetchDatasetList().then((list) => {
      datasets.set(list)
      activePanel.set('datasets')
    })
  }

  export function toggle3D() {
    mapManager.toggle3DView()
  }

  export function flyTo(lon: number, lat: number) {
    mapManager.getMap()?.flyTo({ center: [lon, lat], zoom: 14 })
  }
</script>

<div bind:this={mapContainer} class="absolute inset-0"></div>
```

**Step 2: Wire into App.svelte**

```svelte
<script lang="ts">
  import Header from './lib/components/Header.svelte'
  import MapView from './lib/components/MapView.svelte'
</script>

<div class="h-screen w-screen flex flex-col">
  <Header />
  <div class="flex-1 relative overflow-hidden">
    <MapView />
  </div>
</div>
```

**Step 3: Verify map renders**

Browser should show the full-screen MapLibre map with Sweden centered.

**Step 4: Commit**

```bash
git add frontend/src/lib/components/MapView.svelte frontend/src/App.svelte
git commit -m "Add MapView component wrapping MapLibre and BBoxDrawer"
```

---

## Task 6: Build Toolbar component

**Files:**
- Create: `frontend/src/lib/components/Toolbar.svelte`
- Create: `frontend/src/lib/components/ToolbarButton.svelte`
- Modify: `frontend/src/App.svelte`

**Step 1: Create ToolbarButton.svelte**

```svelte
<script lang="ts">
  interface Props {
    icon: string
    label: string
    active?: boolean
    disabled?: boolean
    badge?: boolean
    onclick?: () => void
  }

  let { icon, label, active = false, disabled = false, badge = false, onclick }: Props = $props()
</script>

<button
  class="relative w-10 h-10 flex items-center justify-center rounded-lg transition-colors
    {active ? 'bg-[#e35a1d]/10 text-[#e35a1d]' : 'text-[#1a1a2e]/70 hover:bg-black/5'}
    {disabled ? 'opacity-30 pointer-events-none' : 'cursor-pointer'}"
  {disabled}
  onclick={onclick}
  title={label}
>
  {@html icon}
  {#if badge}
    <div class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#e35a1d]"></div>
  {/if}
</button>
```

**Step 2: Create Toolbar.svelte**

Uses icon SVGs from the existing `icons.ts`. Dispatches actions via stores and callbacks.

```svelte
<script lang="ts">
  import ToolbarButton from './ToolbarButton.svelte'
  import { Icons } from '../ui/icons'
  import { drawingActive, activePanel, searchOpen } from '../stores/ui'
  import { bbox } from '../stores/map'
  import { bookmarkCount } from '../stores/bookmarks'
  import { activeJobCount } from '../stores/jobs'

  interface Props {
    onClear?: () => void
    onSave?: () => void
    onToggle3D?: () => void
  }

  let { onClear, onSave, onToggle3D }: Props = $props()
</script>

<div class="absolute top-4 left-4 z-40 flex flex-col bg-white/80 backdrop-blur-lg rounded-xl shadow-lg border border-black/5 p-1 gap-0.5">
  <!-- Actions -->
  <ToolbarButton
    icon={Icons.draw}
    label="Draw area"
    active={$drawingActive}
    onclick={() => drawingActive.update(v => !v)}
  />
  <ToolbarButton
    icon={Icons.clear}
    label="Clear"
    disabled={!$bbox}
    onclick={onClear}
  />
  <ToolbarButton
    icon={Icons.bookmark}
    label="Save bookmark"
    disabled={!$bbox}
    onclick={onSave}
  />

  <!-- Divider -->
  <div class="mx-2 my-1 border-t border-black/10"></div>

  <!-- Views -->
  <ToolbarButton
    icon={Icons.list}
    label="Bookmarks"
    active={$activePanel === 'bookmarks'}
    badge={$bookmarkCount > 0}
    onclick={() => activePanel.update(v => v === 'bookmarks' ? null : 'bookmarks')}
  />
  <ToolbarButton
    icon={Icons.download}
    label="Datasets"
    active={$activePanel === 'datasets' || $activePanel === 'dataset-form'}
    badge={$activeJobCount > 0}
    onclick={() => activePanel.update(v => v === 'datasets' ? null : 'datasets')}
  />

  <!-- Divider -->
  <div class="mx-2 my-1 border-t border-black/10"></div>

  <!-- Tools -->
  <ToolbarButton
    icon={Icons.search}
    label="Search"
    active={$searchOpen}
    onclick={() => searchOpen.update(v => !v)}
  />
  <ToolbarButton
    icon={Icons.view3d}
    label="3D view"
    onclick={onToggle3D}
  />
</div>
```

**Step 3: Wire into App.svelte with MapView callbacks**

**Step 4: Verify in browser**

Compact 48px-wide floating toolbar with glass effect, top-left, grouped icons with dividers.

**Step 5: Commit**

```bash
git add frontend/src/lib/components/Toolbar.svelte frontend/src/lib/components/ToolbarButton.svelte frontend/src/App.svelte
git commit -m "Add compact floating Toolbar with icon buttons"
```

---

## Task 7: Build SidePanel container and DatasetList

**Files:**
- Create: `frontend/src/lib/components/SidePanel.svelte`
- Create: `frontend/src/lib/components/DatasetList.svelte`
- Modify: `frontend/src/App.svelte`

**Step 1: Create SidePanel.svelte**

Slide-in container from the right, hosts child views.

```svelte
<script lang="ts">
  import { activePanel } from '../stores/ui'
  import type { Snippet } from 'svelte'

  interface Props {
    children: Snippet
  }

  let { children }: Props = $props()
</script>

{#if $activePanel !== null}
  <div
    class="absolute top-0 right-0 h-full w-[360px] z-30
      bg-white/90 backdrop-blur-xl border-l border-black/5 shadow-2xl
      animate-slide-in overflow-y-auto"
  >
    {@render children()}
  </div>
{/if}

<style>
  @keyframes slide-in {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }
  .animate-slide-in {
    animation: slide-in 200ms ease-out;
  }
</style>
```

**Step 2: Create DatasetList.svelte**

```svelte
<script lang="ts">
  import { datasets, selectedDataset, formConfig } from '../stores/datasets'
  import { activePanel } from '../stores/ui'
  import { bbox } from '../stores/map'
  import { fetchDatasetSchema } from '../api/dataset-api'
  import { schemaParser } from '../forms/schema-parser'
  import type { DatasetInfo } from '../types'

  async function selectDataset(dataset: DatasetInfo) {
    selectedDataset.set(dataset)
    const schema = await fetchDatasetSchema(dataset.name)
    const config = schemaParser.parse(schema.schema, dataset.name, {
      bounds: $bbox ? [$bbox.minX, $bbox.minY, $bbox.maxX, $bbox.maxY] : []
    })
    formConfig.set(config)
    activePanel.set('dataset-form')
  }
</script>

<div class="p-5">
  <div class="flex items-center justify-between mb-4">
    <h3 class="text-[16px] font-semibold text-[#1a1a2e]">Select Dataset</h3>
    <span class="text-[12px] text-[#6b7280]">{$datasets.length} available</span>
  </div>
  <div class="flex flex-col gap-1">
    {#each $datasets as dataset}
      <button
        class="flex items-center justify-between px-3 py-3 rounded-lg text-left
          hover:bg-black/5 transition-colors group cursor-pointer"
        onclick={() => selectDataset(dataset)}
      >
        <div class="flex items-center gap-3">
          <div class="w-2 h-2 rounded-full {dataset.type === 'vector' ? 'bg-green-500' : 'bg-blue-500'}"></div>
          <span class="text-[13px] text-[#1a1a2e]">{dataset.title || dataset.name}</span>
        </div>
        <span class="text-[#6b7280] opacity-0 group-hover:opacity-100 transition-opacity">&rarr;</span>
      </button>
    {/each}
  </div>
</div>
```

**Step 3: Wire into App.svelte**

```svelte
<SidePanel>
  {#if $activePanel === 'datasets'}
    <DatasetList />
  {:else if $activePanel === 'dataset-form'}
    <!-- DatasetForm goes here in Task 8 -->
  {:else if $activePanel === 'bookmarks'}
    <!-- BookmarkList goes here in Task 9 -->
  {/if}
</SidePanel>
```

**Step 4: Verify — draw bbox, panel slides in showing dataset list**

**Step 5: Commit**

```bash
git add frontend/src/lib/components/SidePanel.svelte frontend/src/lib/components/DatasetList.svelte frontend/src/App.svelte
git commit -m "Add SidePanel container and DatasetList component"
```

---

## Task 8: Build DatasetForm component

**Files:**
- Create: `frontend/src/lib/components/DatasetForm.svelte`

**Step 1: Create DatasetForm.svelte**

Dynamic form rendered from FormConfig. Ports logic from `form-renderer.ts` (410 lines) into a Svelte component.

```svelte
<script lang="ts">
  import { selectedDataset, formConfig } from '../stores/datasets'
  import { activePanel } from '../stores/ui'
  import { bbox } from '../stores/map'
  import { jobs } from '../stores/jobs'
  import { formValidator } from '../forms/form-validator'
  import { jobService } from '../services/job-service'
  import { Icons } from '../ui/icons'
  import type { FormField, FormConfig } from '../types/form-fields'
  import type { FormValues, SubmissionState } from '../types/form-state'

  let values: FormValues = $state({})
  let errors: Record<string, string[]> = $state({})
  let status: SubmissionState = $state('idle' as any)

  // Initialize default values from formConfig
  $effect(() => {
    const cfg = $formConfig
    if (!cfg) return
    const defaults: FormValues = {}
    for (const field of cfg.fields) {
      if (field.defaultValue !== undefined) {
        defaults[field.name] = field.defaultValue
      }
    }
    values = defaults
  })

  function goBack() {
    activePanel.set('datasets')
    formConfig.set(null)
    selectedDataset.set(null)
  }

  async function handleSubmit() {
    const cfg = $formConfig
    if (!cfg) return

    const result = formValidator.validate(cfg.fields, values)
    if (!result.valid) {
      errors = {}
      for (const err of result.errors) {
        errors[err.field] = [err.message]
      }
      return
    }

    errors = {}
    status = 'submitting' as any

    try {
      const currentBbox = $bbox
      if (!currentBbox) return

      const response = await jobService.submitJob({
        dataset: $selectedDataset!.name,
        bounds: [currentBbox.minX, currentBbox.minY, currentBbox.maxX, currentBbox.maxY],
        params: values,
      })

      status = 'success' as any
    } catch (e) {
      status = 'error' as any
    }
  }
</script>

<div class="p-5">
  <!-- Header with back button -->
  <div class="flex items-center gap-3 mb-5">
    <button class="p-1 rounded hover:bg-black/5 cursor-pointer" onclick={goBack}>
      {@html Icons.arrowLeft}
    </button>
    <h3 class="text-[16px] font-semibold text-[#1a1a2e]">
      {$selectedDataset?.title || $selectedDataset?.name || 'Dataset'}
    </h3>
  </div>

  <!-- Form fields -->
  {#if $formConfig}
    <form onsubmit={(e) => { e.preventDefault(); handleSubmit() }} class="flex flex-col gap-3">
      {#each $formConfig.fields as field}
        {#if field.type !== 'hidden'}
          <div class="flex flex-col gap-1">
            <label class="text-[13px] font-medium text-[#1a1a2e]">
              {field.label}
              {#if field.required}<span class="text-[#e35a1d]">*</span>{/if}
            </label>
            {#if field.description}
              <p class="text-[12px] text-[#6b7280]">{field.description}</p>
            {/if}

            {#if field.type === 'text'}
              <input
                type="text"
                class="h-9 px-3 rounded-lg border border-[#e5e7eb] text-[13px]
                  focus:outline-none focus:ring-2 focus:ring-[#e35a1d]/30 focus:border-[#e35a1d]"
                placeholder={field.placeholder}
                bind:value={values[field.name]}
              />
            {:else if field.type === 'number' || field.type === 'integer'}
              <input
                type="number"
                class="h-9 px-3 rounded-lg border border-[#e5e7eb] text-[13px]
                  focus:outline-none focus:ring-2 focus:ring-[#e35a1d]/30 focus:border-[#e35a1d]"
                bind:value={values[field.name]}
                min={field.min}
                max={field.max}
                step={field.type === 'integer' ? 1 : undefined}
              />
            {:else if field.type === 'checkbox'}
              <input
                type="checkbox"
                class="w-4 h-4 rounded accent-[#e35a1d]"
                bind:checked={values[field.name]}
              />
            {:else if field.type === 'select'}
              <select
                class="h-9 px-3 rounded-lg border border-[#e5e7eb] text-[13px] bg-white
                  focus:outline-none focus:ring-2 focus:ring-[#e35a1d]/30 focus:border-[#e35a1d]"
                bind:value={values[field.name]}
              >
                <option value="">-- Select --</option>
                {#each field.options as opt}
                  <option value={opt.value}>{opt.label}</option>
                {/each}
              </select>
            {/if}

            {#if errors[field.name]}
              <p class="text-[12px] text-red-500">{errors[field.name][0]}</p>
            {/if}
          </div>
        {/if}
      {/each}

      {#if status === 'success'}
        <div class="p-3 rounded-lg bg-green-50 text-green-700 text-[13px]">
          Job queued successfully!
          <button class="underline ml-2 cursor-pointer" onclick={goBack}>Download another</button>
        </div>
      {:else if status === 'error'}
        <div class="p-3 rounded-lg bg-red-50 text-red-700 text-[13px]">
          Submission failed. Please try again.
        </div>
      {:else}
        <button
          type="submit"
          class="h-10 rounded-lg bg-[#e35a1d] text-white text-[13px] font-semibold
            hover:bg-[#c94d18] transition-colors cursor-pointer mt-2"
        >
          Download Dataset
        </button>
      {/if}
    </form>
  {/if}
</div>
```

**Step 2: Wire into SidePanel in App.svelte**

Replace the placeholder comment with `<DatasetForm />`.

**Step 3: Verify — draw bbox, select dataset, see form, submit**

**Step 4: Commit**

```bash
git add frontend/src/lib/components/DatasetForm.svelte frontend/src/App.svelte
git commit -m "Add DatasetForm component with dynamic field rendering"
```

---

## Task 9: Build BookmarkList component

**Files:**
- Create: `frontend/src/lib/components/BookmarkList.svelte`

**Step 1: Create BookmarkList.svelte**

```svelte
<script lang="ts">
  import { bookmarks } from '../stores/bookmarks'
  import { activePanel } from '../stores/ui'
  import { Icons } from '../ui/icons'
  import type { SavedBookmark } from '../types/bookmarks'

  interface Props {
    onLoad?: (bookmark: SavedBookmark) => void
    onDelete?: (id: string) => void
  }

  let { onLoad, onDelete }: Props = $props()

  function formatArea(b: SavedBookmark): string {
    const dx = b.bbox.maxX - b.bbox.minX
    const dy = b.bbox.maxY - b.bbox.minY
    return ((dx * dy) / 1_000_000).toFixed(2)
  }

  function relativeTime(date: string): string {
    const diff = Date.now() - new Date(date).getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  }
</script>

<div class="p-5">
  <div class="flex items-center justify-between mb-4">
    <h3 class="text-[16px] font-semibold text-[#1a1a2e]">Bookmarks</h3>
    <button class="p-1 rounded hover:bg-black/5 cursor-pointer" onclick={() => activePanel.set(null)}>
      {@html Icons.close}
    </button>
  </div>

  {#if $bookmarks.length === 0}
    <div class="text-center py-8">
      <p class="text-[13px] text-[#6b7280]">No bookmarks yet</p>
      <p class="text-[12px] text-[#6b7280]/60 mt-1">Draw an area and save it</p>
    </div>
  {:else}
    <div class="flex flex-col gap-1">
      {#each $bookmarks as bookmark}
        <div class="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-black/5 group">
          <button class="flex-1 text-left cursor-pointer" onclick={() => onLoad?.(bookmark)}>
            <div class="text-[13px] text-[#1a1a2e] font-medium">{bookmark.name}</div>
            <div class="text-[11px] text-[#6b7280]">{formatArea(bookmark)} km² · {relativeTime(bookmark.createdAt)}</div>
          </button>
          <button
            class="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 transition-all cursor-pointer"
            onclick={() => onDelete?.(bookmark.id)}
          >
            {@html Icons.trash}
          </button>
        </div>
      {/each}
    </div>
  {/if}
</div>
```

**Step 2: Wire into SidePanel**

**Step 3: Verify — open bookmarks panel, see list, load/delete**

**Step 4: Commit**

```bash
git add frontend/src/lib/components/BookmarkList.svelte frontend/src/App.svelte
git commit -m "Add BookmarkList component"
```

---

## Task 10: Build SearchPalette component

**Files:**
- Create: `frontend/src/lib/components/SearchPalette.svelte`

**Step 1: Create SearchPalette.svelte**

```svelte
<script lang="ts">
  import { searchOpen } from '../stores/ui'
  import { searchLocation } from '../api/geocoding-api'
  import { Icons } from '../ui/icons'
  import type { NominatimResult } from '../types'

  interface Props {
    onSelect?: (result: NominatimResult) => void
  }

  let { onSelect }: Props = $props()
  let query = $state('')
  let results: NominatimResult[] = $state([])
  let loading = $state(false)
  let inputEl: HTMLInputElement
  let debounceTimer: ReturnType<typeof setTimeout>

  $effect(() => {
    if ($searchOpen && inputEl) {
      setTimeout(() => inputEl?.focus(), 50)
    }
  })

  function handleInput() {
    clearTimeout(debounceTimer)
    if (query.length < 2) {
      results = []
      return
    }
    debounceTimer = setTimeout(async () => {
      loading = true
      try {
        results = await searchLocation(query)
      } catch { results = [] }
      loading = false
    }, 300)
  }

  function selectResult(r: NominatimResult) {
    onSelect?.(r)
    searchOpen.set(false)
    query = ''
    results = []
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      searchOpen.set(false)
      query = ''
      results = []
    }
  }
</script>

{#if $searchOpen}
  <!-- Backdrop -->
  <button class="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm cursor-default" onclick={() => searchOpen.set(false)}></button>

  <!-- Palette -->
  <div class="fixed top-[20%] left-1/2 -translate-x-1/2 z-50 w-[480px]">
    <div class="bg-white rounded-xl shadow-2xl border border-black/10 overflow-hidden">
      <div class="flex items-center gap-3 px-4 h-12 border-b border-black/5">
        {@html Icons.search}
        <input
          bind:this={inputEl}
          bind:value={query}
          oninput={handleInput}
          onkeydown={handleKeydown}
          placeholder="Search locations in Sweden..."
          class="flex-1 text-[14px] outline-none bg-transparent"
        />
        {#if query}
          <button class="p-1 rounded hover:bg-black/5 cursor-pointer" onclick={() => { query = ''; results = [] }}>
            {@html Icons.close}
          </button>
        {/if}
      </div>
      {#if results.length > 0}
        <div class="max-h-[300px] overflow-y-auto">
          {#each results as result}
            <button
              class="w-full flex items-center gap-3 px-4 py-3 hover:bg-black/5 text-left cursor-pointer"
              onclick={() => selectResult(result)}
            >
              <span class="text-[#6b7280]">📍</span>
              <span class="text-[13px] text-[#1a1a2e]">{result.display_name}</span>
            </button>
          {/each}
        </div>
      {:else if query.length >= 2 && !loading}
        <div class="px-4 py-6 text-center text-[13px] text-[#6b7280]">No results found</div>
      {/if}
    </div>
  </div>
{/if}
```

**Step 2: Wire into App.svelte + add Cmd+K keyboard shortcut**

In App.svelte, add global keydown listener:
```svelte
<svelte:window onkeydown={(e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault()
    searchOpen.update(v => !v)
  }
  if (e.key === 'Escape') closeAllPanels()
}} />
```

**Step 3: Verify — Cmd+K opens search, typing searches, selecting flies to location**

**Step 4: Commit**

```bash
git add frontend/src/lib/components/SearchPalette.svelte frontend/src/App.svelte
git commit -m "Add SearchPalette command palette component"
```

---

## Task 11: Build JobTray component

**Files:**
- Create: `frontend/src/lib/components/JobTray.svelte`
- Create: `frontend/src/lib/components/JobItem.svelte`

**Step 1: Create JobItem.svelte**

```svelte
<script lang="ts">
  import { jobService } from '../services/job-service'
  import type { Job } from '../services/job-service'

  interface Props {
    job: Job
  }

  let { job }: Props = $props()

  const statusColors: Record<string, string> = {
    queued: 'text-yellow-600',
    processing: 'text-blue-600',
    complete: 'text-green-600',
    failed: 'text-red-600',
  }
</script>

<div class="flex items-center justify-between px-3 py-2 text-[12px]">
  <div class="flex items-center gap-2 min-w-0">
    {#if job.status === 'processing'}
      <div class="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
    {:else if job.status === 'complete'}
      <div class="w-3 h-3 text-green-500">✓</div>
    {:else if job.status === 'failed'}
      <div class="w-3 h-3 text-red-500">✕</div>
    {:else}
      <div class="w-3 h-3 rounded-full bg-yellow-400"></div>
    {/if}
    <span class="truncate text-[#1a1a2e]">{job.dataset || job.id.slice(0, 8)}</span>
    <span class="{statusColors[job.status]} opacity-70">{job.status}</span>
  </div>
  {#if job.status === 'complete' && job.download_url}
    <button
      class="text-[#e35a1d] hover:underline cursor-pointer ml-2 shrink-0"
      onclick={() => jobService.downloadResult(job.id, job.filename || 'download')}
    >
      ↓
    </button>
  {/if}
</div>
```

**Step 2: Create JobTray.svelte**

```svelte
<script lang="ts">
  import { jobs, activeJobCount, jobTrayExpanded } from '../stores/jobs'
  import JobItem from './JobItem.svelte'

  function clearCompleted() {
    jobs.update($j => $j.filter(j => j.status === 'queued' || j.status === 'processing'))
  }
</script>

{#if $jobs.length > 0}
  <div class="absolute bottom-4 right-4 z-40">
    {#if $jobTrayExpanded}
      <!-- Expanded tray -->
      <div class="w-[300px] bg-white/90 backdrop-blur-xl rounded-xl shadow-2xl border border-black/5 overflow-hidden">
        <div class="flex items-center justify-between px-3 py-2 border-b border-black/5">
          <span class="text-[13px] font-semibold text-[#1a1a2e]">Jobs</span>
          <button class="text-[12px] text-[#6b7280] hover:text-[#1a1a2e] cursor-pointer" onclick={() => jobTrayExpanded.set(false)}>✕</button>
        </div>
        <div class="max-h-[240px] overflow-y-auto">
          {#each $jobs as job}
            <JobItem {job} />
          {/each}
        </div>
        {#if $jobs.some(j => j.status === 'complete' || j.status === 'failed')}
          <div class="px-3 py-2 border-t border-black/5">
            <button class="text-[12px] text-[#6b7280] hover:text-[#1a1a2e] cursor-pointer" onclick={clearCompleted}>
              Clear completed
            </button>
          </div>
        {/if}
      </div>
    {:else}
      <!-- Collapsed pill -->
      <button
        class="flex items-center gap-2 px-3 py-2 bg-white/90 backdrop-blur-xl rounded-full shadow-lg
          border border-black/5 text-[12px] cursor-pointer hover:bg-white transition-colors"
        onclick={() => jobTrayExpanded.set(true)}
      >
        {#if $activeJobCount > 0}
          <div class="w-3 h-3 border-2 border-[#e35a1d] border-t-transparent rounded-full animate-spin"></div>
          <span class="text-[#1a1a2e]">{$activeJobCount} job{$activeJobCount > 1 ? 's' : ''} running</span>
        {:else}
          <span class="text-[#6b7280]">{$jobs.length} job{$jobs.length > 1 ? 's' : ''}</span>
        {/if}
      </button>
    {/if}
  </div>
{/if}
```

**Step 3: Wire SSE events into jobStore**

In App.svelte's `onMount`, connect SSE and pipe events to the `jobs` store:
```ts
jobService.connectSSE()
jobService.onJobEvent((event) => {
  if (event.type === 'job_update' || event.type === 'job_complete' || event.type === 'job_failed') {
    jobs.update($j => {
      const idx = $j.findIndex(j => j.id === event.job.id)
      if (idx >= 0) { $j[idx] = event.job; return [...$j] }
      return [...$j, event.job]
    })
  }
})
```

**Step 4: Verify — submit a dataset job, see pill appear, expand to see details**

**Step 5: Commit**

```bash
git add frontend/src/lib/components/JobTray.svelte frontend/src/lib/components/JobItem.svelte frontend/src/App.svelte
git commit -m "Add JobTray toast component with expandable job list"
```

---

## Task 12: Build EmptyState and SaveBookmarkDialog

**Files:**
- Create: `frontend/src/lib/components/EmptyState.svelte`
- Create: `frontend/src/lib/components/SaveBookmarkDialog.svelte`

**Step 1: Create EmptyState.svelte**

```svelte
<script lang="ts">
  import { bbox } from '../stores/map'
  import { drawingActive } from '../stores/ui'
</script>

{#if !$bbox && !$drawingActive}
  <div class="absolute bottom-8 left-1/2 -translate-x-1/2 z-20
    px-5 py-3 bg-white/80 backdrop-blur-lg rounded-full shadow-lg border border-black/5
    text-[13px] text-[#6b7280]">
    Click <strong class="text-[#1a1a2e]">Draw Area</strong> to select a region on the map
  </div>
{/if}
```

**Step 2: Create SaveBookmarkDialog.svelte**

```svelte
<script lang="ts">
  import { bbox, bboxArea } from '../stores/map'

  interface Props {
    open: boolean
    onSave?: (name: string) => void
    onClose?: () => void
  }

  let { open = $bindable(), onSave, onClose }: Props = $props()
  let name = $state('')
  let inputEl: HTMLInputElement

  $effect(() => {
    if (open && inputEl) setTimeout(() => inputEl?.focus(), 50)
  })

  function handleSave() {
    if (!name.trim()) return
    onSave?.(name.trim())
    name = ''
    open = false
  }
</script>

{#if open}
  <button class="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm cursor-default" onclick={() => { open = false; onClose?.() }}></button>
  <div class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50
    w-[360px] bg-white rounded-xl shadow-2xl p-5">
    <h3 class="text-[16px] font-semibold text-[#1a1a2e] mb-1">Save Bookmark</h3>
    <p class="text-[12px] text-[#6b7280] mb-4">Area: {$bboxArea.toFixed(2)} km²</p>
    <input
      bind:this={inputEl}
      bind:value={name}
      placeholder="Bookmark name..."
      class="w-full h-9 px-3 rounded-lg border border-[#e5e7eb] text-[13px] mb-4
        focus:outline-none focus:ring-2 focus:ring-[#e35a1d]/30 focus:border-[#e35a1d]"
      onkeydown={(e) => e.key === 'Enter' && handleSave()}
    />
    <div class="flex gap-2 justify-end">
      <button class="px-4 h-9 rounded-lg text-[13px] text-[#6b7280] hover:bg-black/5 cursor-pointer" onclick={() => { open = false; onClose?.() }}>Cancel</button>
      <button
        class="px-4 h-9 rounded-lg bg-[#e35a1d] text-white text-[13px] font-semibold hover:bg-[#c94d18] cursor-pointer"
        onclick={handleSave}
      >Save</button>
    </div>
  </div>
{/if}
```

**Step 3: Wire both into App.svelte**

**Step 4: Verify — empty state prompt visible on load, save dialog works**

**Step 5: Commit**

```bash
git add frontend/src/lib/components/EmptyState.svelte frontend/src/lib/components/SaveBookmarkDialog.svelte frontend/src/App.svelte
git commit -m "Add EmptyState overlay and SaveBookmarkDialog"
```

---

## Task 13: Wire up full App.svelte orchestration

**Files:**
- Modify: `frontend/src/App.svelte`

**Step 1: Complete App.svelte with all component wiring**

This is the final orchestration: connect MapView callbacks, bookmark manager, keyboard shortcuts, and all store interactions. Port the coordination logic from `main.ts` (580 lines) into reactive Svelte bindings. Should be significantly shorter (~100-150 lines) since Svelte handles reactivity.

Key wiring:
- `MapView` bind methods (clearBbox, loadBbox, flyTo, toggle3D)
- `Toolbar` callbacks (onClear, onSave, onToggle3D)
- `BookmarkList` callbacks (onLoad, onDelete) — connected to BookmarkManager
- `SearchPalette` onSelect → MapView.flyTo
- `SaveBookmarkDialog` onSave → BookmarkManager.saveBookmark
- Global Escape key handler
- `onMount`: initialize BookmarkManager, connect SSE, load jobs

**Step 2: Verify full flow end-to-end**

1. App loads with map and empty state prompt
2. Click Draw → draw bbox → datasets panel slides in
3. Select dataset → form appears → fill and submit → success message + job in tray
4. Bookmarks: save, load, delete
5. Search: Cmd+K, type location, select → fly to
6. 3D toggle works
7. Escape closes panels

**Step 3: Commit**

```bash
git add frontend/src/App.svelte
git commit -m "Wire up full app orchestration in App.svelte"
```

---

## Task 14: Restyle MapLibre controls and polish

**Files:**
- Modify: `frontend/src/app.css`
- Modify: `frontend/src/lib/components/MapView.svelte` (optional)

**Step 1: Override MapLibre default control styles**

In `app.css`, add overrides for `.maplibregl-ctrl-group` to match the glass aesthetic:

```css
.maplibregl-ctrl-group {
  background: rgba(255, 255, 255, 0.8) !important;
  backdrop-filter: blur(12px) !important;
  border-radius: 0.75rem !important;
  border: 1px solid rgba(0, 0, 0, 0.05) !important;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1) !important;
}
.maplibregl-ctrl-group button {
  width: 36px !important;
  height: 36px !important;
}
```

**Step 2: Add any missing transitions/animations**

- Tooltip fade for toolbar buttons (CSS-only using title attr or custom data-tooltip)
- Panel slide-out animation on close
- Toast slide-up animation

**Step 3: Visual QA pass**

Walk through every screen and verify spacing, colors, typography match the design doc.

**Step 4: Commit**

```bash
git add frontend/src/app.css
git commit -m "Restyle MapLibre controls and add polish"
```

---

## Task 15: Remove old vanilla TS UI code

**Files:**
- Delete: `frontend/src/ui/` (entire directory)
- Delete: `frontend/src/state/app-state.ts`
- Delete: `frontend/src/main.ts` (old, already replaced)
- Delete: old HTML from `frontend/index.html` (already done in Task 1)
- Delete: `frontend/style.css` (replaced by `app.css`)
- Keep: `frontend/src/lib/ui/icons.ts` (still used by Svelte components)

**Step 1: Move icons.ts into lib if not already done**

```bash
cp frontend/src/ui/icons.ts frontend/src/lib/ui/icons.ts
```

**Step 2: Delete old files**

```bash
rm -rf frontend/src/ui/
rm frontend/src/state/app-state.ts
rm frontend/style.css
```

**Step 3: Verify build**

```bash
cd /Users/vasnas/scratch/dtcc-atlas/frontend && npm run build
```

No errors. All imports resolve.

**Step 4: Commit**

```bash
git add -A frontend/
git commit -m "Remove old vanilla TS UI code, migration complete"
```

---

## Task 16: End-to-end verification and final build

**Step 1: Run production build**

```bash
cd /Users/vasnas/scratch/dtcc-atlas/frontend && npm run build
```

**Step 2: Test with backend**

Start the full stack (backend serves built frontend from dist/):
```bash
cd /Users/vasnas/scratch/dtcc-atlas && python -m server
```

**Step 3: Full flow walkthrough**

Verify every feature:
- [ ] Map loads, centered on Sweden
- [ ] Empty state prompt visible
- [ ] Draw area works (click-click)
- [ ] Dataset panel auto-opens after draw
- [ ] Dataset selection → form → submit → job queued
- [ ] Job tray shows running jobs, expands, download works
- [ ] Bookmarks: save, list, load, delete
- [ ] Search: Cmd+K, search, fly to location
- [ ] 3D toggle
- [ ] Escape closes all panels
- [ ] Header shows area and connection status
- [ ] Glass effect on toolbar and panels
- [ ] Responsive at different window sizes

**Step 4: Commit**

```bash
git add -A
git commit -m "UI rehaul complete: Svelte + Mapbox Studio-style design"
```
