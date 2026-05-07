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
      <div class="glass-panel w-[300px] rounded-xl overflow-hidden">
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
        class="glass-capsule flex items-center gap-2 px-3 py-2 rounded-full
          text-[12px] cursor-pointer hover:brightness-105 transition-[filter] focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none"
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

  .glass-panel {
    background: rgba(255, 255, 255, var(--glass-bg-opacity, 0.55));
    backdrop-filter: blur(var(--glass-blur, 4px)) saturate(var(--glass-saturate, 1.1));
    -webkit-backdrop-filter: blur(var(--glass-blur, 4px)) saturate(var(--glass-saturate, 1.1));
    border: 1px solid rgba(255, 255, 255, var(--glass-border-opacity, 0.5));
    box-shadow:
      var(--glass-shadow-x, 0px) var(--glass-shadow-y, 3px) var(--glass-shadow-blur, 7px) rgba(0, 0, 0, 0.2),
      inset 0 1px 0 rgba(255, 255, 255, 0.5),
      inset 0 -1px 0 rgba(255, 255, 255, 0.1);
  }

  .glass-capsule::before {
    content: '';
    position: absolute;
    inset: 0;
    padding: 2px;
    border-radius: inherit;
    background: radial-gradient(
      ellipse at 30px 0px,
      rgba(255, 255, 255, var(--glass-edge-opacity, 0.25)) 0%,
      rgba(255, 255, 255, calc(var(--glass-edge-opacity, 0.25) * 0.4)) 40%,
      transparent 80%
    );
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    pointer-events: none;
    z-index: 50;
  }
</style>
