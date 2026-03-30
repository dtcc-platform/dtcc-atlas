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

  <div class="flex items-center gap-[10px] py-[5px]">
    <!-- Capsule -->
    <div class="flex-1 flex items-center gap-[10px] bg-white/50 rounded-[25px] h-[52px] px-[10px] py-[5px] overflow-hidden">
      <!-- Eye icon - visibility toggle -->
      <button
        class="w-[40px] h-[41px] shrink-0 flex items-center justify-center rounded-lg cursor-pointer
          hover:bg-black/5 transition-colors
          focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none"
        onclick={onToggleVisibility}
        aria-label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
      >
        <span class="w-[24px] h-[17px]">{@html layer.visible ? Icons.eyeOpen : Icons.eyeClosed}</span>
      </button>

      <!-- Zoom to extent -->
      {#if layer.bounds}
        <button
          class="w-[40px] h-[41px] shrink-0 flex items-center justify-center rounded-lg cursor-pointer
            hover:bg-black/5 transition-colors
            focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none"
          onclick={onZoomToLayer}
          aria-label="Zoom to {layer.name}"
        >
          <span class="w-[20px] h-[20px]">{@html Icons.zoomExtent}</span>
        </button>
      {/if}

      <!-- Layer name -->
      <span class="flex-1 text-[20px] font-light text-black tracking-[-0.18px] leading-[30px] truncate select-none">
        {layer.name}
      </span>

      <!-- Expand/collapse chevron -->
      <button
        class="w-[40px] h-[41px] shrink-0 flex items-center justify-center rounded-lg cursor-pointer
          text-[#5F5F6D] hover:bg-black/5 transition-colors
          focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none"
        onclick={onToggleExpanded}
        aria-label={layer.expanded ? `Collapse ${layer.name} settings` : `Expand ${layer.name} settings`}
        aria-expanded={layer.expanded}
      >
        <span class="w-[20px] h-[20px] transition-transform duration-200 inline-flex" class:rotate-180={layer.expanded}>
          {@html Icons.chevronDown}
        </span>
      </button>
    </div>

    <!-- Drag handle - outside capsule -->
    <div
      class="w-[40px] h-[41px] shrink-0 flex items-center justify-center cursor-grab active:cursor-grabbing rounded-lg
        hover:bg-black/5 transition-colors"
      draggable="true"
      ondragstart={onDragStart}
      ondragend={onDragEnd}
      role="button"
      tabindex="0"
      aria-label="Reorder {layer.name} layer"
    >
      <span class="w-[22px] h-[16px]">{@html Icons.dragHandle}</span>
    </div>
  </div>

  <!-- Expanded area -->
  {#if layer.expanded}
    <div class="ml-[10px] mr-[50px] mb-[5px] rounded-[15px] bg-white/30 transition-all duration-200 px-4 py-3">
      <label class="flex flex-col text-sm text-[#5F5F6D]">
        <span class="flex items-center justify-between">
          <span class="select-none">Opacity</span>
          <span class="text-xs font-mono tabular-nums">{Math.round(layer.opacity * 100)}%</span>
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
