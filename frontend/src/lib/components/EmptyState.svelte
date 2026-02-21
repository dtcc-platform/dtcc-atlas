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
