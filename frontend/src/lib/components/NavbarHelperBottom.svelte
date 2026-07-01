<script lang="ts">
  import { Icons } from '../ui/icons'
  import { activePanel, searchOpen, drawingActive } from '../stores/ui'

  interface Props {
    hidden?: boolean
  }

  let { hidden = false }: Props = $props()

  // Dynamic icon based on active tool state (spec 5.5)
  // Priority: drawing > panel > search > default (draw region)
  // 2D/3D switching is never hinted here -- draw region is the only default.
  let helperIcon = $derived.by(() => {
    if ($drawingActive) return Icons.clear
    if ($activePanel === 'bookmarks') return Icons.bookmark
    if ($activePanel === 'datasets' || $activePanel === 'dataset-form') return Icons.dataTree
    if ($activePanel === 'simulations') return Icons.simulation
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
    if ($activePanel === 'simulations') return 'to explore simulations'
    if ($activePanel === 'layers') return 'to change layer order'
    if ($activePanel === 'downloads') return 'to download data for the selected region'
    if ($activePanel === 'uploads') return 'to upload your own dataset'
    if ($searchOpen) return 'to search for a location'
    return 'to draw a region on the map'
  })

</script>

<!-- Navbar Helper Bottom: floating capsule matching TopNavBar/SideNavBar visual style (spec 5.2) -->
<!-- Hidden on mobile where the Toolbar already serves as bottom nav -->
{#if !hidden}
<div
  class="glass-capsule hidden sm:flex fixed left-1/2 z-30
    h-[var(--atlas-bottom-bar-height)] items-center
    rounded-[999px]
    px-[var(--atlas-bottom-bar-padding-x)]"
  style="bottom: var(--atlas-edge-gap); transform: translateX(-50%); position: fixed !important;"
  role="status"
  aria-label="Navigation helper"
>
  <div class="flex items-center gap-[clamp(8px,0.83vw,12px)]">
    <span class="text-[#5F5F6D] font-light tracking-[-0.18px] whitespace-nowrap select-none"
      style="font-size: var(--atlas-helper-font-size); line-height: var(--atlas-helper-line-height);">{helperPrefix}</span>
    <span class="w-[var(--atlas-helper-icon-size)] h-[var(--atlas-helper-icon-size)] shrink-0 flex items-center justify-center">{@html helperIcon}</span>
    <span class="text-[#5F5F6D] font-light tracking-[-0.18px] whitespace-nowrap select-none"
      style="font-size: var(--atlas-helper-font-size); line-height: var(--atlas-helper-line-height);">
      {helperText}
    </span>
  </div>
</div>
{/if}

<style>
  .glass-capsule {
    position: relative;
    background: rgba(255, 255, 255, var(--glass-bg-opacity, 0.55));
    backdrop-filter: blur(var(--glass-blur, 4px)) saturate(var(--glass-saturate, 1.1));
    -webkit-backdrop-filter: blur(var(--glass-blur, 4px)) saturate(var(--glass-saturate, 1.1));
    border: 1px solid rgba(255, 255, 255, var(--glass-border-opacity, 0.5));
    box-shadow: 
      var(--glass-shadow-x, 0px) var(--glass-shadow-y, 3px) var(--glass-shadow-blur, 7px) rgba(0, 0, 0, 0.2),
      inset 0 1px 0 rgba(255, 255, 255, 0.5),
      inset 0 -1px 0 rgba(255, 255, 255, 0.1);
    overflow: hidden;
  }

  /* Contour-aware specular highlight */
  .glass-capsule::before {
    content: '';
    position: absolute;
    inset: 0;
    padding: 2px;
    border-radius: inherit;
    /* Localized radial "shoulder pop" at top-left */
    background: radial-gradient(
      ellipse at 30px 0px, 
      rgba(255, 255, 255, var(--glass-edge-opacity, 0.25)) 0%, 
      rgba(255, 255, 255, calc(var(--glass-edge-opacity, 0.25) * 0.4)) 40%, 
      transparent 80%
    );
    -webkit-mask: 
      linear-gradient(#fff 0 0) content-box, 
      linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    pointer-events: none;
    z-index: 50;
  }

  /* Helper bar icons match the muted text color (#5F5F6D is the default --stroke-0) */
  span :global(svg) {
    width: var(--atlas-helper-icon-size);
    height: var(--atlas-helper-icon-size);
  }
</style>
