<script lang="ts">
  import { Icons } from '../ui/icons'
  import { activePanel, searchOpen, drawingActive } from '../stores/ui'

  // Dynamic icon based on active tool state (spec 5.5)
  // Priority: drawing > panel > search > default (draw region)
  // 2D/3D switching is never hinted here -- draw region is the only default.
  let helperIcon = $derived.by(() => {
    if ($drawingActive) return Icons.clear
    if ($activePanel === 'bookmarks') return Icons.bookmark
    if ($activePanel === 'datasets' || $activePanel === 'dataset-form') return Icons.dataTree
    if ($activePanel === 'layers') return Icons.dragHandle
    if ($activePanel === 'downloads') return Icons.download
    if ($activePanel === 'uploads') return Icons.upload
    if ($searchOpen) return Icons.search
    return Icons.draw
  })

  // Dynamic prefix text (spec: layers panel uses "Click and hold")
  let helperPrefix = $derived.by(() => {
    if ($activePanel === 'layers') return 'Click and hold'
    return 'Click'
  })

  // Dynamic instruction text matching the active tool (spec 5.5)
  let helperText = $derived.by(() => {
    if ($drawingActive) return 'to cancel drawing'
    if ($activePanel === 'bookmarks') return 'to save this region as a bookmark'
    if ($activePanel === 'datasets' || $activePanel === 'dataset-form') return 'to load a dataset for the selected region'
    if ($activePanel === 'layers') return 'to change layer order'
    if ($activePanel === 'downloads') return 'to download data for the selected region'
    if ($activePanel === 'uploads') return 'to upload your own dataset'
    if ($searchOpen) return 'to search for a location'
    return 'to draw a region on the map'
  })

</script>

<!-- Navbar Helper Bottom: floating capsule matching TopNavBar/SideNavBar visual style (spec 5.2) -->
<!-- Hidden on mobile where the Toolbar already serves as bottom nav -->
<div
  class="hidden sm:flex fixed left-1/2 z-30
    h-[var(--atlas-bottom-bar-height)] items-center
    bg-white/50 backdrop-blur-xl
    border border-white/20
    shadow-[0_0_30px_rgba(255,255,255,0.15)]
    rounded-[999px]
    px-[clamp(14px,1.39vw,20px)]"
  style="bottom: var(--atlas-edge-gap); transform: translateX(-50%);"
  role="status"
  aria-label="Navigation helper"
>
  <div class="flex items-center gap-3">
    <span class="text-[#5F5F6D] font-light tracking-[-0.18px] whitespace-nowrap select-none"
      style="font-size: var(--atlas-helper-font-size); line-height: var(--atlas-helper-line-height);">{helperPrefix}</span>
    <span class="w-[var(--atlas-helper-icon-size)] h-[var(--atlas-helper-icon-size)] shrink-0 flex items-center justify-center">{@html helperIcon}</span>
    <span class="text-[#5F5F6D] font-light tracking-[-0.18px] whitespace-nowrap select-none"
      style="font-size: var(--atlas-helper-font-size); line-height: var(--atlas-helper-line-height);">
      {helperText}
    </span>
  </div>
</div>

<style>
  /* Helper bar icons match the muted text color (#5F5F6D is the default --stroke-0) */
  span :global(svg) {
    width: var(--atlas-helper-icon-size);
    height: var(--atlas-helper-icon-size);
  }
</style>
