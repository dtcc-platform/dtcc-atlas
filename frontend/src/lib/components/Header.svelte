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
