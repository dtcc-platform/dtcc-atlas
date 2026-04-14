<script lang="ts">
  import { Icons } from '../ui/icons'
  import type { Layer } from '../stores/layers'

  interface Props {
    layer: Layer
    onToggleVisibility: () => void
    onToggleExpanded: () => void
    onOpacityChange: (opacity: number) => void
    onZoomToLayer: () => void
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
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
    dragging = false,
    dropTarget = false
  }: Props = $props()
</script>

<div
  class="transition-all duration-150"
  class:opacity-50={dragging}
  class:shadow-lg={dragging}
  role="listitem"
  ondragover={onDragOver}
  ondrop={onDrop}
>
  {#if dropTarget}
    <div class="h-[2px] bg-dtcc-orange rounded-full mx-4 -mt-1 mb-1"></div>
  {/if}

  <div class="flex items-center gap-[var(--atlas-layer-tag-gap)] py-[clamp(4px,0.49vh,6px)]">
    <!-- Capsule -->
    <div class="flex-1 flex items-center gap-[var(--atlas-layer-tag-gap)] bg-white/50 rounded-[var(--atlas-layer-tag-radius)] h-[var(--atlas-layer-tag-height)] px-[clamp(8px,0.69vw,10px)] py-[clamp(4px,0.49vh,6px)] overflow-hidden">
      <!-- Eye icon - visibility toggle -->
      <button
        class="w-[var(--atlas-layer-tag-button-size)] h-[var(--atlas-layer-tag-button-size)] shrink-0 flex items-center justify-center rounded-lg cursor-pointer
          hover:bg-black/5 transition-colors
          focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none"
        onclick={onToggleVisibility}
        aria-label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
      >
        <span class="w-[clamp(20px,1.67vw,24px)] h-[clamp(14px,1.18vw,17px)]">{@html layer.visible ? Icons.eyeOpen : Icons.eyeClosed}</span>
      </button>

      <!-- Zoom to extent -->
      {#if layer.bounds}
        <button
          class="w-[var(--atlas-layer-tag-button-size)] h-[var(--atlas-layer-tag-button-size)] shrink-0 flex items-center justify-center rounded-lg cursor-pointer
            hover:bg-black/5 transition-colors
            focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none"
          onclick={onZoomToLayer}
          aria-label="Zoom to {layer.name}"
        >
          <span class="w-[var(--atlas-panel-action-icon-size)] h-[var(--atlas-panel-action-icon-size)]">{@html Icons.zoomExtent}</span>
        </button>
      {/if}

      <!-- Layer name -->
      <span
        class="flex-1 font-light text-black tracking-[-0.18px] truncate select-none"
        style="font-size: var(--atlas-layer-tag-title-size); line-height: var(--atlas-layer-tag-title-line-height);"
      >
        {layer.name}
      </span>

      <!-- Expand/collapse chevron -->
      <button
        class="w-[var(--atlas-layer-tag-button-size)] h-[var(--atlas-layer-tag-button-size)] shrink-0 flex items-center justify-center rounded-lg cursor-pointer
          text-[#5F5F6D] hover:bg-black/5 transition-colors
          focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none"
        onclick={onToggleExpanded}
        aria-label={layer.expanded ? `Collapse ${layer.name} settings` : `Expand ${layer.name} settings`}
        aria-expanded={layer.expanded}
      >
        <span class="w-[var(--atlas-panel-action-icon-size)] h-[var(--atlas-panel-action-icon-size)] transition-transform duration-200 inline-flex" class:rotate-180={layer.expanded}>
          {@html Icons.chevronDown}
        </span>
      </button>
    </div>

    <!-- Drag handle - outside capsule -->
    <div
      class="w-[var(--atlas-layer-tag-button-size)] h-[var(--atlas-layer-tag-button-size)] shrink-0 flex items-center justify-center cursor-grab active:cursor-grabbing rounded-lg
        hover:bg-black/5 transition-colors"
      draggable="true"
      ondragstart={onDragStart}
      ondragend={onDragEnd}
      role="button"
      tabindex="0"
      aria-label="Reorder {layer.name} layer"
    >
      <span class="w-[clamp(18px,1.53vw,22px)] h-[clamp(13px,1.11vw,16px)]">{@html Icons.dragHandle}</span>
    </div>
  </div>

  <!-- Expanded area -->
  {#if layer.expanded}
    <div class="ml-[clamp(8px,0.69vw,10px)] mr-[calc(var(--atlas-layer-tag-button-size)+var(--atlas-layer-tag-gap))] mb-[clamp(4px,0.49vh,6px)] rounded-[clamp(12px,1.04vw,16px)] bg-white/30 transition-all duration-200 px-[clamp(12px,0.97vw,14px)] py-[clamp(10px,0.97vh,12px)]">
      <label class="flex flex-col text-[var(--atlas-body-text-size)] text-[#5F5F6D]">
        <span class="flex items-center justify-between">
          <span class="select-none">Opacity</span>
          <span class="text-[var(--atlas-caption-text-size)] font-mono tabular-nums">{Math.round(layer.opacity * 100)}%</span>
        </span>
        <input
          type="range"
          min="0"
          max="100"
          value={layer.opacity * 100}
          oninput={(e) => onOpacityChange(Number((e.target as HTMLInputElement).value) / 100)}
          class="w-full mt-2 h-1.5 rounded-full appearance-none bg-black/10 accent-[#E35A1D] cursor-pointer"
        />
      </label>
    </div>
  {/if}
</div>

<style>
  /* Eye and drag handle icons sized to fill their wrappers */
  button :global(svg), div[draggable="true"] :global(svg) {
    width: 100%;
    height: 100%;
  }
</style>
