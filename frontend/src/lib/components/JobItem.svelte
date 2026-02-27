<script lang="ts">
  import { jobService } from '../services/job-service'
  import { Icons } from '../ui/icons'
  import type { Job } from '../services/job-service'

  interface Props {
    job: Job
  }

  interface Events {
    onRetry?: (job: Job) => void
  }

  let { job, onRetry }: Props & Events = $props()

  let cancelling = $state(false)
  let retrying = $state(false)

  async function handleCancel() {
    cancelling = true
    try {
      await jobService.cancelJob(job.id)
    } catch (e) {
      console.error('Failed to cancel job:', e)
    }
    cancelling = false
  }

  async function handleRetry() {
    retrying = true
    onRetry?.(job)
  }

  const statusColors: Record<string, string> = {
    queued: 'text-yellow-600',
    processing: 'text-blue-600',
    complete: 'text-green-600',
    failed: 'text-red-600',
  }

  function progressPercent(job: Job): number | null {
    if (job.progress && typeof job.progress.percent === 'number' && Number.isFinite(job.progress.percent)) {
      return Math.max(0, Math.min(100, job.progress.percent))
    }
    return null
  }

  function statusText(job: Job): string {
    const pct = progressPercent(job)
    if (job.status === 'processing' && pct !== null) {
      return `${pct.toFixed(1)}%`
    }
    return job.status
  }
</script>

<div class="px-3 py-2 text-[12px]">
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2 min-w-0">
      {#if job.status === 'processing'}
        <div class="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0"></div>
      {:else if job.status === 'complete'}
        <span class="w-3 h-3 text-green-500 shrink-0 text-center">&#10003;</span>
      {:else if job.status === 'failed'}
        <span class="w-3 h-3 text-red-500 shrink-0 text-center">&#10005;</span>
      {:else}
        <div class="w-3 h-3 rounded-full bg-yellow-400 shrink-0"></div>
      {/if}
      <span class="truncate text-dtcc-navy">{job.dataset || job.id.slice(0, 8)}</span>
      <span class="{statusColors[job.status] || 'text-gray-500'} opacity-70">{statusText(job)}</span>
    </div>
    <div class="flex items-center gap-1 ml-2 shrink-0">
      {#if job.status === 'complete' && job.download_url}
        <button
          class="w-5 h-5 text-dtcc-orange hover:text-dtcc-orange-dark cursor-pointer focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none"
          onclick={() => jobService.downloadResult(job.id, job.filename || 'download')}
          aria-label="Download"
        >
          {@html Icons.download}
        </button>
      {/if}
      {#if job.status === 'queued' || job.status === 'processing'}
        <button
          class="text-[11px] text-dtcc-muted hover:text-red-500 cursor-pointer disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none"
          disabled={cancelling}
          onclick={handleCancel}
        >
          {cancelling ? '...' : '\u2715'}
        </button>
      {/if}
      {#if job.status === 'failed'}
        <button
          class="text-[11px] text-dtcc-orange hover:underline cursor-pointer disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none"
          disabled={retrying || !onRetry}
          onclick={handleRetry}
        >
          {retrying ? '...' : '\u21BB'}
        </button>
      {/if}
    </div>
  </div>

  <!-- Progress bar for processing jobs -->
  {#if job.status === 'processing'}
    {@const pct = progressPercent(job)}
    <div class="mt-1.5">
      {#if job.progress?.phase || job.progress?.message}
        <div class="flex items-center justify-between text-[11px] text-dtcc-muted mb-1">
          <span class="truncate">{job.progress?.phase || job.progress?.message || ''}</span>
          {#if job.progress?.eta_formatted}
            <span class="shrink-0 ml-2">ETA {job.progress.eta_formatted}</span>
          {/if}
        </div>
      {/if}
      <div class="h-1.5 bg-black/5 rounded-full overflow-hidden">
        {#if pct !== null}
          <div
            class="h-full bg-blue-500 rounded-full transition-all duration-300"
            style="width: {pct.toFixed(1)}%"
          ></div>
        {:else}
          <div class="h-full bg-blue-500 rounded-full animate-progress-indeterminate"></div>
        {/if}
      </div>
    </div>
  {/if}
</div>
