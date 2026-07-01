<script lang="ts">
  import { onDestroy } from 'svelte'
  import { slide } from 'svelte/transition'
  import { Icons } from '../ui/icons'
  import type { Layer } from '../stores/layers'
  import { tooltip } from '../actions/tooltip'

  interface Props {
    layer: Layer
    onToggleVisibility: () => void
    onToggleExpanded: () => void
    onOpacityChange: (opacity: number) => void
    onZoomToLayer: () => void
    onRemove: () => void
    onDragStart: (e: DragEvent) => void
    onDragOver: (e: DragEvent) => void
    onDrop: (e: DragEvent) => void
    onDragEnd: () => void
    dragging?: boolean
    dropTarget?: boolean
  }

  let {
    layer,
    onToggleVisibility,
    onToggleExpanded,
    onOpacityChange,
    onZoomToLayer,
    onRemove,
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
    dragging = false,
    dropTarget = false
  }: Props = $props()

  // Decouple border-radius snap from height animation to prevent the
  // "expanding oval" artifact that occurs when both run simultaneously.
  let isRectShape = $state(false)
  let showContent = $state(false)
  let opacityRaf: number | null = null
  let pendingOpacity: number | null = null

  function handleOpacityInput(e: Event) {
    pendingOpacity = Number((e.target as HTMLInputElement).value) / 100
    if (opacityRaf !== null) return

    opacityRaf = requestAnimationFrame(() => {
      opacityRaf = null
      const opacity = pendingOpacity
      pendingOpacity = null
      if (opacity !== null) onOpacityChange(opacity)
    })
  }

  onDestroy(() => {
    if (opacityRaf !== null) cancelAnimationFrame(opacityRaf)
  })

  $effect(() => {
    if (layer.expanded) {
      // 1. Snap corners to rect immediately (no CSS transition on border-radius)
      isRectShape = true
      // 2. On the next frame — after the DOM has painted the rect shape —
      //    let the content slide in
      const rafId = requestAnimationFrame(() => { showContent = true })
      return () => cancelAnimationFrame(rafId)
    } else {
      // 1. Slide content out first (200 ms)
      showContent = false
      // 2. After the slide-out completes, snap back to pill
      const t = setTimeout(() => { isRectShape = false }, 210)
      return () => clearTimeout(t)
    }
  })
</script>

<div
  class="transition-opacity duration-150"
  class:opacity-40={dragging}
  role="listitem"
  ondragover={onDragOver}
  ondrop={onDrop}
>
  {#if dropTarget}
    <div class="h-[2px] bg-dtcc-orange rounded-full mx-2 mb-1"></div>
  {/if}

  <div class="flex items-start gap-[var(--atlas-layer-tag-gap)] py-[3px]">
    <!-- Capsule: pill when collapsed, rounded rect when expanded, content grows inside -->
    <div class="layer-capsule flex-1 flex flex-col px-[6px]" class:is-expanded={isRectShape}>

      <!-- Always-visible header row -->
      <div class="flex items-center shrink-0" style="height: var(--atlas-layer-tag-height);">
        <!-- Eye icon -->
        <button
          class="icon-btn shrink-0 flex items-center justify-center rounded-full cursor-pointer
            text-[#5F5F6D] hover:bg-black/5 transition-colors
            focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none"
          onclick={onToggleVisibility}
          aria-label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
        >
          <span class="icon-inner">{@html layer.visible ? Icons.eyeOpen : Icons.eyeClosed}</span>
        </button>

        <!-- Layer name -->
        <span
          class="flex-1 font-light text-black tracking-[-0.18px] truncate select-none px-1.5"
          style="font-size: var(--atlas-layer-tag-title-size); line-height: var(--atlas-layer-tag-title-line-height);"
          use:tooltip={layer.name}
        >
          {layer.name}
        </span>

        <!-- Expand/collapse chevron -->
        <button
          class="icon-btn shrink-0 flex items-center justify-center rounded-full cursor-pointer
            text-[#5F5F6D] hover:bg-black/5 transition-colors
            focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none"
          onclick={onToggleExpanded}
          aria-label={layer.expanded ? `Collapse ${layer.name} settings` : `Expand ${layer.name} settings`}
          aria-expanded={layer.expanded}
        >
          <span class="icon-inner transition-transform duration-200 inline-flex" class:rotate-180={layer.expanded}>
            {@html Icons.chevronDown}
          </span>
        </button>
      </div>

      <!-- Expanded controls — inside the capsule -->
      {#if showContent}
        <div class="pt-[2px] pb-[8px] px-[2px]" transition:slide={{ duration: 200 }}>
          <div class="flex gap-[5px] mb-[6px]">
            {#if layer.bounds}
              <button
                class="flex-1 py-[3px] rounded-full border border-black/15 text-dtcc-muted hover:bg-black/5 transition-colors cursor-pointer focus-visible:outline-none"
                style="font-size: var(--atlas-caption-text-size);"
                onclick={onZoomToLayer}
              >Zoom to layer</button>
            {/if}
            <button
              class="flex-1 py-[3px] rounded-full bg-red-50 text-red-500 hover:bg-red-100 transition-colors cursor-pointer focus-visible:outline-none"
              style="font-size: var(--atlas-caption-text-size);"
              onclick={onRemove}
            >Remove</button>
          </div>
          <label class="flex flex-col text-[#5F5F6D]" style="font-size: var(--atlas-caption-text-size);">
            <span class="flex items-center justify-between mb-[2px]">
              <span class="select-none">Opacity</span>
              <span class="font-mono tabular-nums">{Math.round(layer.opacity * 100)}%</span>
            </span>
            <input
              type="range"
              min="0"
              max="100"
              value={layer.opacity * 100}
              oninput={handleOpacityInput}
              class="w-full h-1 rounded-full appearance-none bg-black/10 accent-[#E35A1D] cursor-pointer"
            />
          </label>
        </div>
      {/if}
    </div>

    <!-- Drag handle — top-offset to stay aligned with the header row -->
    <div
      class="icon-btn shrink-0 flex items-center justify-center cursor-grab active:cursor-grabbing rounded-full
        text-[#5F5F6D] hover:bg-black/5 transition-colors"
      style="margin-top: calc((var(--atlas-layer-tag-height) - var(--atlas-layer-tag-button-size)) / 2);"
      draggable="true"
      ondragstart={onDragStart}
      ondragend={onDragEnd}
      role="button"
      tabindex="0"
      aria-label="Reorder {layer.name} layer"
    >
      <span class="icon-inner">{@html Icons.dragHandle}</span>
    </div>
  </div>
</div>

<style>
  .layer-capsule {
    background: rgba(255, 255, 255, 0.8);
    border: 1px solid rgba(0, 0, 0, 0.08);
    border-radius: 999px;
  }

  .layer-capsule.is-expanded {
    border-radius: 14px;
  }

  .icon-btn {
    width: var(--atlas-layer-tag-button-size);
    height: var(--atlas-layer-tag-button-size);
  }

  .icon-inner {
    display: inline-flex;
    width: var(--atlas-layer-tag-icon-size);
    height: var(--atlas-layer-tag-icon-size);
  }

  .icon-btn :global(svg), div[draggable="true"] :global(svg) {
    width: 100%;
    height: 100%;
    display: block;
  }
</style>
