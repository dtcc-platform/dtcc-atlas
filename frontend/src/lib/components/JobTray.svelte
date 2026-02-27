<script lang="ts">
  import { jobs, activeJobCount, jobTrayExpanded } from '../stores/jobs'
  import type { Job } from '../services/job-service'
  import JobItem from './JobItem.svelte'

  interface Props {
    onRetry?: (job: Job) => void
  }

  let { onRetry }: Props = $props()

  function clearCompleted() {
    jobs.update($j => $j.filter(j => j.status === 'queued' || j.status === 'processing'))
  }
</script>

{#if $jobs.length > 0}
  <div class="absolute bottom-12 right-4 z-40">
    {#if $jobTrayExpanded}
      <div class="w-[300px] bg-white/90 backdrop-blur-xl rounded-xl shadow-2xl border border-black/5 overflow-hidden">
        <div class="flex items-center justify-between px-3 py-2 border-b border-black/5">
          <span class="text-[13px] font-semibold text-dtcc-navy">Jobs</span>
          <button class="text-[12px] text-dtcc-muted hover:text-dtcc-navy cursor-pointer focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none" onclick={() => jobTrayExpanded.set(false)}>&#10005;</button>
        </div>
        <div class="max-h-[240px] overflow-y-auto">
          {#each $jobs as job (job.id)}
            <JobItem {job} {onRetry} />
          {/each}
        </div>
        {#if $jobs.some(j => j.status === 'complete' || j.status === 'failed')}
          <div class="px-3 py-2 border-t border-black/5">
            <button class="text-[12px] text-dtcc-muted hover:text-dtcc-navy cursor-pointer focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none" onclick={clearCompleted}>
              Clear completed
            </button>
          </div>
        {/if}
      </div>
    {:else}
      <button
        class="flex items-center gap-2 px-3 py-2 bg-white/90 backdrop-blur-xl rounded-full shadow-lg
          border border-black/5 text-[12px] cursor-pointer hover:bg-white transition-colors focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none"
        onclick={() => jobTrayExpanded.set(true)}
      >
        {#if $activeJobCount > 0}
          <div class="w-3 h-3 border-2 border-dtcc-orange border-t-transparent rounded-full animate-spin"></div>
          <span class="text-dtcc-navy">{$activeJobCount} job{$activeJobCount > 1 ? 's' : ''} running</span>
        {:else}
          <span class="text-dtcc-muted">{$jobs.length} job{$jobs.length > 1 ? 's' : ''}</span>
        {/if}
      </button>
    {/if}
  </div>
{/if}
