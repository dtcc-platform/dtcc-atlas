<script lang="ts">
  import FloatingPanel from './FloatingPanel.svelte'
  import { bbox, bboxArea } from '../stores/map'
  import { toolbarHovered, sideNavOpen } from '../stores/ui'
  import { transformCoordinates } from '../map/projections'
  import { MIN_BBOX_AREA_M2, MAX_BBOX_AREA_M2, MAX_BBOX_AREA_KM2 } from '../config'
  import type { BoundingBox } from '../types'

  interface Props {
    // Live preview of typed bounds — updates the drawn rectangle without
    // triggering the post-draw side effects (dataset fetch / panel open).
    onPreview?: (bbox: BoundingBox) => void
    // Commit — runs the same finish path the draw tool uses on a drawn box.
    onCommit?: (bbox: BoundingBox) => void
    // Cancel — discards in-progress geometry and exits draw mode.
    onCancel?: () => void
  }

  let { onPreview, onCommit, onCancel }: Props = $props()

  // Field state — decimal degrees, WGS84
  let north = $state('')
  let south = $state('')
  let east = $state('')
  let west = $state('')
  let error = $state('')
  let pasteHint = $state('')

  // Echo-loop guard: tracks the WGS84 string we last pushed out so the
  // $bbox subscription doesn't overwrite a field the user just edited.
  let lastPushed = $state<string | null>(null)

  function fmt(n: number, places = 4): string {
    return Number.isFinite(n) ? n.toFixed(places) : ''
  }

  // ── Box → fields: sync from store on external changes (drag handle, paste, etc.)
  $effect(() => {
    const b = $bbox
    if (!b) return
    const sw = transformCoordinates([b.minX, b.minY], 'EPSG:3006', 'EPSG:4326')
    const ne = transformCoordinates([b.maxX, b.maxY], 'EPSG:3006', 'EPSG:4326')
    const newKey = `${sw[0]},${sw[1]},${ne[0]},${ne[1]}`
    if (newKey === lastPushed) return            // ← came from our own edit
    west = fmt(sw[0])
    south = fmt(sw[1])
    east = fmt(ne[0])
    north = fmt(ne[1])
    error = ''
  })

  function readFields(): BoundingBox | null {
    const n = parseFloat(north)
    const s = parseFloat(south)
    const e = parseFloat(east)
    const w = parseFloat(west)

    if ([n, s, e, w].some(v => Number.isNaN(v))) {
      error = 'All four fields must be numbers.'
      return null
    }
    if (n < -90 || n > 90 || s < -90 || s > 90) {
      error = 'Latitude must be between -90 and 90.'
      return null
    }
    if (e < -180 || e > 180 || w < -180 || w > 180) {
      error = 'Longitude must be between -180 and 180.'
      return null
    }
    if (n <= s) { error = 'North must be greater than South.'; return null }
    if (e <= w) { error = 'East must be greater than West.'; return null }

    const sw = transformCoordinates([w, s], 'EPSG:4326', 'EPSG:3006')
    const ne = transformCoordinates([e, n], 'EPSG:4326', 'EPSG:3006')
    const next: BoundingBox = {
      minX: sw[0], minY: sw[1], maxX: ne[0], maxY: ne[1], crs: 'EPSG:3006',
    }

    const areaM2 = (next.maxX - next.minX) * (next.maxY - next.minY)
    if (areaM2 < MIN_BBOX_AREA_M2) {
      error = `Area too small (min ${MIN_BBOX_AREA_M2} m²).`
      return null
    }
    if (areaM2 > MAX_BBOX_AREA_M2) {
      error = `Area exceeds ${MAX_BBOX_AREA_KM2} km² limit.`
      return null
    }

    error = ''
    return next
  }

  function commitFieldEdit() {
    const next = readFields()
    if (!next) return
    lastPushed = `${
      transformCoordinates([next.minX, next.minY], 'EPSG:3006', 'EPSG:4326').join(',')
    },${
      transformCoordinates([next.maxX, next.maxY], 'EPSG:3006', 'EPSG:4326').join(',')
    }`
    onPreview?.(next)
  }

  function handleSetArea() {
    const next = readFields()
    if (!next) return
    onCommit?.(next)
  }

  async function handlePaste() {
    pasteHint = ''
    let text = ''
    try {
      text = await navigator.clipboard.readText()
    } catch {
      pasteHint = 'Clipboard read blocked — paste into a field directly.'
      return
    }
    const nums = (text.match(/-?\d+(\.\d+)?/g) || []).map(Number)
    if (nums.length < 4) {
      pasteHint = "Couldn't read 4 coordinates from clipboard."
      return
    }
    const candidates: { w: number; s: number; e: number; n: number }[] = [
      { w: nums[0], s: nums[1], e: nums[2], n: nums[3] },          // [minLng, minLat, maxLng, maxLat]
      { s: nums[0], w: nums[1], n: nums[2], e: nums[3] },          // [minLat, minLng, maxLat, maxLng]
    ]
    for (const c of candidates) {
      const latsOk = c.s >= -90 && c.s <= 90 && c.n >= -90 && c.n <= 90
      const lngsOk = c.w >= -180 && c.w <= 180 && c.e >= -180 && c.e <= 180
      if (latsOk && lngsOk && c.n > c.s && c.e > c.w) {
        west = fmt(c.w); south = fmt(c.s); east = fmt(c.e); north = fmt(c.n)
        commitFieldEdit()
        return
      }
    }
    pasteHint = "Couldn't interpret clipboard as a bounding box."
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); onCancel?.(); return }
    if (e.key === 'Enter') { e.preventDefault(); commitFieldEdit() }
  }

  // Shared classes — kept here so each input cell stays readable inline.
  const inputClass =
    'h-[var(--atlas-control-height)] px-[var(--atlas-control-padding-x)] rounded-[var(--atlas-control-radius)] ' +
    'border text-[var(--atlas-body-text-size)] tabular-nums outline-none transition-colors w-full ' +
    'border-dtcc-border-light focus:ring-2 focus:ring-orange-200 focus:border-orange-400'
</script>

<!-- Bounds inspector: docks LEFT (mirrors LayersPanel anchoring); content-fit height -->
<div
  class="fixed z-30
    max-sm:inset-x-[var(--atlas-edge-gap)]
    sm:w-[var(--atlas-panel-width)]
    animate-panel-in"
  style="top: var(--atlas-layout-top); left: calc(var(--atlas-edge-gap) + {$toolbarHovered ? '200px' : 'var(--atlas-sidebar-width)'} + var(--atlas-panel-gap)); transition: left 200ms ease-out, transform 300ms ease-out; transform: translateX({$sideNavOpen ? 'calc(171px + var(--atlas-panel-gap))' : '0'});"
  onkeydown={onKey}
  role="region"
  aria-label="Bounding area inspector"
>
  <FloatingPanel
    title="Bounding area"
    onClose={() => onCancel?.()}
    bodyClass="!flex-none !overflow-visible"
  >
    <div class="flex flex-col gap-[clamp(12px,1.11vh,16px)] pb-1">
      <p class="text-dtcc-muted whitespace-nowrap -mt-0.5"
        style="font-size: clamp(11px, 0.85vw, 12.5px); line-height: 1.45;">
        Decimal degrees · WGS84
      </p>

      <!-- 2×2 grid: N · E on top, S · W on bottom -->
      <div class="grid grid-cols-2 gap-[clamp(10px,1.0vh,14px)]">
        <div class="flex flex-col gap-1.5">
          <label for="bi-north" class="text-[var(--atlas-body-text-size)] font-medium text-dtcc-navy">North</label>
          <input
            id="bi-north"
            bind:value={north}
            type="number"
            step="any"
            inputmode="decimal"
            placeholder="57.7100"
            class={inputClass}
            onblur={commitFieldEdit}
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="bi-east" class="text-[var(--atlas-body-text-size)] font-medium text-dtcc-navy">East</label>
          <input
            id="bi-east"
            bind:value={east}
            type="number"
            step="any"
            inputmode="decimal"
            placeholder="11.9820"
            class={inputClass}
            onblur={commitFieldEdit}
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="bi-south" class="text-[var(--atlas-body-text-size)] font-medium text-dtcc-navy">South</label>
          <input
            id="bi-south"
            bind:value={south}
            type="number"
            step="any"
            inputmode="decimal"
            placeholder="57.6855"
            class={inputClass}
            onblur={commitFieldEdit}
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="bi-west" class="text-[var(--atlas-body-text-size)] font-medium text-dtcc-navy">West</label>
          <input
            id="bi-west"
            bind:value={west}
            type="number"
            step="any"
            inputmode="decimal"
            placeholder="11.9680"
            class={inputClass}
            onblur={commitFieldEdit}
          />
        </div>
      </div>

      <div class="flex items-center justify-between gap-2">
        <span class="text-dtcc-muted tabular-nums whitespace-nowrap"
          style="font-size: clamp(11px, 0.85vw, 12.5px); line-height: 1.45;">
          {$bbox ? `Area · ${$bboxArea.toFixed(2)} km²` : 'No area yet'}
        </span>
        <button
          type="button"
          class="text-dtcc-orange font-medium hover:underline cursor-pointer rounded px-1 whitespace-nowrap
            focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none"
          style="font-size: clamp(11px, 0.85vw, 12.5px); line-height: 1.45;"
          onclick={handlePaste}
          title="Paste bounding box from clipboard"
        >
          Paste from clipboard
        </button>
      </div>

      {#if error}
        <p class="text-[var(--atlas-caption-text-size)] leading-[var(--atlas-caption-line-height)] text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
      {:else if pasteHint}
        <p class="text-[var(--atlas-caption-text-size)] leading-[var(--atlas-caption-line-height)] text-dtcc-muted bg-black/[0.03] px-3 py-2 rounded-lg">{pasteHint}</p>
      {/if}

      <button
        type="button"
        class="mt-2 h-[var(--atlas-control-height)] rounded-full text-[var(--atlas-body-text-size)] font-medium transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none
          {!!error
            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
            : 'bg-dtcc-orange text-white hover:bg-dtcc-orange-dark'}"
        onclick={handleSetArea}
        disabled={!!error}
      >
        Set area
      </button>
    </div>
  </FloatingPanel>
</div>

<style>
  @keyframes panel-in {
    from { opacity: 0; transform: translateX(-8px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  .animate-panel-in {
    animation: panel-in 200ms ease-out;
  }

  /* Hide native spinner buttons on number inputs for a calmer look */
  input[type="number"]::-webkit-outer-spin-button,
  input[type="number"]::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  input[type="number"] {
    -moz-appearance: textfield;
  }
</style>
