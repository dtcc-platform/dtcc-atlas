<script lang="ts">
  import { bbox } from '../stores/map'
  import { drawingActive } from '../stores/ui'
  import { Icons } from '../ui/icons'
</script>

<!-- Hidden on sm+ where NavbarHelperBottom provides dynamic guidance -->
{#if !$bbox && !$drawingActive}
  <div class="absolute bottom-8 left-1/2 -translate-x-1/2 z-20
    px-5 py-3 bg-white/80 backdrop-blur-lg rounded-full shadow-lg border border-black/5
    text-[13px] text-dtcc-muted flex items-center gap-2
    sm:hidden">
    <span class="w-5 h-5 text-dtcc-navy/50">{@html Icons.draw}</span>
    Click <strong class="text-dtcc-navy">Draw Area</strong> to select a region on the map
  </div>
{/if}
