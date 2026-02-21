<script lang="ts">
  import { jobService } from '../services/job-service'
  import type { Job } from '../services/job-service'

  interface Props {
    job: Job
  }

  let { job }: Props = $props()

  const statusColors: Record<string, string> = {
    queued: 'text-yellow-600',
    processing: 'text-blue-600',
    complete: 'text-green-600',
    failed: 'text-red-600',
  }
</script>

<div class="flex items-center justify-between px-3 py-2 text-[12px]">
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
    <span class="truncate text-[#1a1a2e]">{job.dataset || job.id.slice(0, 8)}</span>
    <span class="{statusColors[job.status] || 'text-gray-500'} opacity-70">{job.status}</span>
  </div>
  {#if job.status === 'complete' && job.download_url}
    <button
      class="text-[#e35a1d] hover:underline cursor-pointer ml-2 shrink-0"
      onclick={() => jobService.downloadResult(job.id, job.filename || 'download')}
    >
      &#8595;
    </button>
  {/if}
</div>
