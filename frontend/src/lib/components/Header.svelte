<script lang="ts">
  import { bbox, bboxArea } from '../stores/map'
  import { datasets } from '../stores/datasets'
  import { activeJobCount } from '../stores/jobs'
  import { activePanel, drawingActive, is3D } from '../stores/ui'
  import { sessionId } from '../stores/session'
  import { jobService } from '../services/job-service'

  interface Props {
    onSessionDialog?: () => void
  }

  let { onSessionDialog }: Props = $props()

  let connected = $state(false)
  let copied = $state(false)

  function copySessionHash() {
    const sid = $sessionId
    if (!sid) return
    navigator.clipboard.writeText(`${window.location.origin}/s/${sid}`).then(() => {
      copied = true
      setTimeout(() => copied = false, 1500)
    })
  }

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

<header class="glass-header min-h-[44px] sm:min-h-0 sm:h-9 text-white flex items-center justify-between px-4 z-50 gap-3">
  <div class="flex items-center gap-2">
    <h1 class="text-[13px] font-semibold tracking-tight">DTCC Atlas</h1>
    <span class="text-[11px] text-white/40 font-mono">v0.2.0</span>
  </div>
  <div class="flex items-center gap-2 text-[11px] overflow-x-auto whitespace-nowrap min-w-0 select-none">
    {#if $sessionId}
      <button
        class="px-2 py-0.5 rounded-md border border-dtcc-orange/30 bg-dtcc-orange/15 text-dtcc-orange font-mono font-medium cursor-pointer hover:bg-dtcc-orange/25 transition-colors"
        title={copied ? 'Copied!' : 'Click to copy session URL'}
        onclick={copySessionHash}
        ondblclick={() => onSessionDialog?.()}
      >
        {copied ? 'Copied!' : $sessionId}
      </button>
    {/if}

    <div class="hidden sm:flex px-2 py-0.5 rounded-md border border-white/15 bg-white/10 text-white/85">
      View: <span class="font-medium">{$is3D ? '3D' : '2D'}</span>
    </div>

    <div class="px-2 py-0.5 rounded-md border border-white/15 bg-white/10 text-white/85">
      Selection: <span class="font-medium">{$bbox ? 'Set' : 'None'}</span>
      {#if $bboxArea > 0}
        <span class="text-white/70"> ({$bboxArea.toFixed(2)} km²)</span>
      {/if}
    </div>

    <div class="hidden sm:flex px-2 py-0.5 rounded-md border border-white/15 bg-white/10 text-white/85">
      Catalog: <span class="font-medium">{$datasets.length}</span>
    </div>

    <div class="px-2 py-0.5 rounded-md border border-white/15 bg-white/10 text-white/85">
      Jobs: <span class="font-medium">{$activeJobCount}</span>
    </div>

    <div class="hidden px-2 py-0.5 rounded-md border border-white/15 bg-white/10 text-white/85">
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

<style>
  .glass-header {
    position: relative;
    background: rgba(23, 37, 65, 0.75);
    backdrop-filter: blur(var(--glass-blur, 4px)) saturate(var(--glass-saturate, 1.1));
    -webkit-backdrop-filter: blur(var(--glass-blur, 4px)) saturate(var(--glass-saturate, 1.1));
    border-bottom: 1px solid rgba(255, 255, 255, var(--glass-border-opacity, 0.1));
    box-shadow: 0 var(--glass-shadow-y, 3px) var(--glass-shadow-blur, 7px) rgba(0, 0, 0, 0.3);
  }

  .glass-header::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, var(--glass-edge-opacity, 0.15)), transparent);
    pointer-events: none;
  }
</style>
