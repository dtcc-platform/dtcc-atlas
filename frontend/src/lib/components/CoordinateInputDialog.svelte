<script lang="ts">
  import { bbox } from '../stores/map'
  import { MIN_BBOX_AREA_M2, MAX_BBOX_AREA_M2, MAX_BBOX_AREA_KM2 } from '../config'
  import type { BoundingBox } from '../types'

  interface Props {
    open: boolean
    onApply?: (bbox: BoundingBox) => void
  }

  let { open = $bindable(), onApply }: Props = $props()

  let minX = $state('')
  let minY = $state('')
  let maxX = $state('')
  let maxY = $state('')
  let error = $state('')
  let firstInput: HTMLInputElement | undefined = $state(undefined)

  // Pre-populate from current bbox when dialog opens
  $effect(() => {
    if (open) {
      const current = $bbox
      if (current) {
        minX = current.minX.toFixed(1)
        minY = current.minY.toFixed(1)
        maxX = current.maxX.toFixed(1)
        maxY = current.maxY.toFixed(1)
      } else {
        minX = ''
        minY = ''
        maxX = ''
        maxY = ''
      }
      error = ''
      setTimeout(() => firstInput?.focus(), 50)
    }
  })

  function validate(): BoundingBox | null {
    const values = {
      minX: parseFloat(minX),
      minY: parseFloat(minY),
      maxX: parseFloat(maxX),
      maxY: parseFloat(maxY),
    }

    if (Object.values(values).some(v => isNaN(v))) {
      error = 'All fields must be valid numbers.'
      return null
    }

    if (values.minX >= values.maxX) {
      error = 'Min X must be less than Max X.'
      return null
    }

    if (values.minY >= values.maxY) {
      error = 'Min Y must be less than Max Y.'
      return null
    }

    const width = values.maxX - values.minX
    const height = values.maxY - values.minY
    const areaM2 = width * height

    if (areaM2 < MIN_BBOX_AREA_M2) {
      error = `Area too small (minimum ${MIN_BBOX_AREA_M2} m²).`
      return null
    }

    if (areaM2 > MAX_BBOX_AREA_M2) {
      error = `Area exceeds ${MAX_BBOX_AREA_KM2} km² limit.`
      return null
    }

    return { ...values, crs: 'EPSG:3006' }
  }

  function handleApply() {
    const result = validate()
    if (result) {
      onApply?.(result)
      open = false
    }
  }

  function trapFocus(e: KeyboardEvent) {
    if (e.key === 'Escape') { open = false; return }
    if (e.key !== 'Tab') return
    const dialog = e.currentTarget as HTMLElement
    const focusable = dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_consider_explicit_label -->
  <button class="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm cursor-default focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none" aria-label="Close dialog" onclick={() => open = false}></button>
  <div class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50
    w-[min(92vw,360px)] bg-white rounded-[var(--atlas-panel-radius)] shadow-2xl p-[var(--atlas-panel-padding)]"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    onkeydown={trapFocus}>
    <h3 class="text-[var(--atlas-panel-header-title-size)] font-semibold text-dtcc-navy mb-1">Enter Coordinates</h3>
    <p class="text-[var(--atlas-caption-text-size)] text-dtcc-muted mb-4">EPSG:3006 (SWEREF99 TM) in meters</p>

    <div class="grid grid-cols-2 gap-3 mb-3">
      <label class="block">
        <span class="text-[var(--atlas-caption-text-size)] font-medium text-dtcc-muted uppercase tracking-wide">Min X (Easting)</span>
        <input
          bind:this={firstInput}
          bind:value={minX}
          type="number"
          step="any"
          placeholder="e.g. 319500"
          class="w-full h-[var(--atlas-control-height)] px-[var(--atlas-control-padding-x)] mt-1 rounded-[var(--atlas-control-radius)] border border-dtcc-border-light text-[var(--atlas-body-text-size)]
            focus:outline-none focus:ring-2 focus:ring-dtcc-orange/30 focus:border-dtcc-orange"
          onkeydown={(e) => e.key === 'Enter' && handleApply()}
        />
      </label>
      <label class="block">
        <span class="text-[var(--atlas-caption-text-size)] font-medium text-dtcc-muted uppercase tracking-wide">Min Y (Northing)</span>
        <input
          bind:value={minY}
          type="number"
          step="any"
          placeholder="e.g. 6397200"
          class="w-full h-[var(--atlas-control-height)] px-[var(--atlas-control-padding-x)] mt-1 rounded-[var(--atlas-control-radius)] border border-dtcc-border-light text-[var(--atlas-body-text-size)]
            focus:outline-none focus:ring-2 focus:ring-dtcc-orange/30 focus:border-dtcc-orange"
          onkeydown={(e) => e.key === 'Enter' && handleApply()}
        />
      </label>
      <label class="block">
        <span class="text-[var(--atlas-caption-text-size)] font-medium text-dtcc-muted uppercase tracking-wide">Max X (Easting)</span>
        <input
          bind:value={maxX}
          type="number"
          step="any"
          placeholder="e.g. 321800"
          class="w-full h-[var(--atlas-control-height)] px-[var(--atlas-control-padding-x)] mt-1 rounded-[var(--atlas-control-radius)] border border-dtcc-border-light text-[var(--atlas-body-text-size)]
            focus:outline-none focus:ring-2 focus:ring-dtcc-orange/30 focus:border-dtcc-orange"
          onkeydown={(e) => e.key === 'Enter' && handleApply()}
        />
      </label>
      <label class="block">
        <span class="text-[var(--atlas-caption-text-size)] font-medium text-dtcc-muted uppercase tracking-wide">Max Y (Northing)</span>
        <input
          bind:value={maxY}
          type="number"
          step="any"
          placeholder="e.g. 6399100"
          class="w-full h-[var(--atlas-control-height)] px-[var(--atlas-control-padding-x)] mt-1 rounded-[var(--atlas-control-radius)] border border-dtcc-border-light text-[var(--atlas-body-text-size)]
            focus:outline-none focus:ring-2 focus:ring-dtcc-orange/30 focus:border-dtcc-orange"
          onkeydown={(e) => e.key === 'Enter' && handleApply()}
        />
      </label>
    </div>

    {#if error}
      <p class="text-[var(--atlas-caption-text-size)] text-red-500 mb-3">{error}</p>
    {/if}

    <div class="flex gap-2 justify-end">
      <button class="px-4 h-[var(--atlas-control-height)] rounded-[var(--atlas-control-radius)] text-[var(--atlas-body-text-size)] text-dtcc-muted hover:bg-black/5 cursor-pointer focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none" onclick={() => open = false}>Cancel</button>
      <button
        class="px-4 h-[var(--atlas-control-height)] rounded-[var(--atlas-control-radius)] bg-dtcc-orange text-white text-[var(--atlas-body-text-size)] font-semibold hover:bg-dtcc-orange-dark cursor-pointer focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none"
        onclick={handleApply}
      >Apply</button>
    </div>
  </div>
{/if}
