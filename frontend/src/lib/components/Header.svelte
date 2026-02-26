<script lang="ts">
  import { bbox, bboxArea } from '../stores/map'
  import { datasets } from '../stores/datasets'
  import { activeJobCount } from '../stores/jobs'
  import { activePanel, drawingActive, is3D } from '../stores/ui'
  import { jobService } from '../services/job-service'

  let connected = $state(false)

  $effect(() => {
    const interval = setInterval(() => {
      connected = jobService.isConnected()
    }, 2000)
    return () => clearInterval(interval)
  })

  function panelLabel(panel: string | null): string {
    if (panel === 'datasets') return 'Datasets'
    if (panel === 'dataset-form') return 'Dataset form'
    if (panel === 'bookmarks') return 'Bookmarks'
    if (panel === 'uploads') return 'Uploads'
    return 'None'
  }
</script>

<header class="h-9 bg-[#1a1a2e] text-white flex items-center justify-between px-4 z-50 gap-3">
  <div class="flex items-center gap-2">
    <h1 class="text-[13px] font-semibold tracking-tight">DTCC Atlas</h1>
    <span class="text-[11px] text-white/40 font-mono">v0.2.0</span>
  </div>
  <div class="flex items-center gap-2 text-[11px] overflow-x-auto whitespace-nowrap min-w-0 select-none">
    <div class="px-2 py-0.5 rounded-md border border-white/15 bg-white/10 text-white/85">
      View: <span class="font-medium">{$is3D ? '3D' : '2D'}</span>
    </div>

    <div class="px-2 py-0.5 rounded-md border border-white/15 bg-white/10 text-white/85">
      Selection: <span class="font-medium">{$bbox ? 'Set' : 'None'}</span>
      {#if $bboxArea > 0}
        <span class="text-white/70"> ({$bboxArea.toFixed(2)} km²)</span>
      {/if}
    </div>

    <div class="px-2 py-0.5 rounded-md border border-white/15 bg-white/10 text-white/85">
      Catalog: <span class="font-medium">{$datasets.length}</span>
    </div>

    <div class="px-2 py-0.5 rounded-md border border-white/15 bg-white/10 text-white/85">
      Jobs: <span class="font-medium">{$activeJobCount}</span>
    </div>

    <div class="hidden md:block px-2 py-0.5 rounded-md border border-white/15 bg-white/10 text-white/85">
      Panel: <span class="font-medium">{panelLabel($activePanel)}</span>
    </div>

    {#if $drawingActive}
      <div class="px-2 py-0.5 rounded-md border border-amber-300/35 bg-amber-400/15 text-amber-100">
        Draw mode active
      </div>
    {/if}

    <div class="px-2 py-0.5 rounded-md border border-white/15 bg-white/10 flex items-center gap-1.5 text-white/85">
      <div class="w-1.5 h-1.5 rounded-full {connected ? 'bg-green-400' : 'bg-red-400'}"></div>
      <span>{connected ? 'Ready' : 'Disconnected'}</span>
    </div>
  </div>
</header>
