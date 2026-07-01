<script lang="ts">
  import { onMount } from 'svelte'
  import { datasets } from '../stores/datasets'
  import { activePanel, collapsedPanels, togglePanelCollapsed } from '../stores/ui'
  import { slide } from 'svelte/transition'
  import FloatingPanel from './FloatingPanel.svelte'
  import { Icons } from '../ui/icons'
  import type { DatasetInfo } from '../types'

  onMount(() => collapsedPanels.update(s => ({ ...s, 'simulations': false })))

  // Filter datasets to show only dtcc-sim source
  const simulations = $derived.by(() => {
    return $datasets.filter(d => {
      const source = (d.source_group || d.source || '').toLowerCase()
      return source === 'dtcc-sim'
    }).sort((a, b) => (a.title || a.name).localeCompare(b.title || b.name))
  })

  function datasetSubtitle(dataset: DatasetInfo): string {
    const bits: string[] = []
    if (dataset.version !== undefined) bits.push(`v${dataset.version}`)
    if (dataset.supported_formats && dataset.supported_formats.length > 0) {
      bits.push(`formats: ${dataset.supported_formats.join(', ')}`)
    }
    return bits.join(' • ')
  }

  function handleClose() {
    activePanel.set(null)
  }

  const showEmpty = $derived($datasets.length === 0 || simulations.length === 0)
</script>

<div
  class="fixed z-30
    animate-panel-in"
  style="top: var(--atlas-layout-top); left: var(--atlas-topbar-right-left); right: var(--atlas-edge-gap); height: var(--atlas-toolbar-natural-height);"
>
  <div style="height: {Boolean($collapsedPanels['simulations']) ? 'var(--atlas-panel-collapsed-height)' : '100%'}; transition: height 200ms ease-out; overflow: visible;">
    <FloatingPanel
      title="DTCC Sim"
      panelId="simulations"
      collapsed={Boolean($collapsedPanels['simulations'])}
      onToggleCollapsed={() => togglePanelCollapsed('simulations')}
      onClose={handleClose}
      class="h-full"
    >
      {#if showEmpty}
        <div class="p-6 text-center text-dtcc-muted">
          <p class="text-xs">No simulations available. Check back later for simulation datasets.</p>
        </div>
      {:else}
        <!-- Simulations list -->
        <div class="flex flex-col gap-[clamp(6px,0.56vh,8px)]">
            {#each simulations as sim (sim.name)}
              <div class="px-[var(--atlas-card-padding-x)] py-[var(--atlas-card-padding-y)] rounded-[var(--atlas-control-radius)] border border-black/5 bg-white/30 hover:bg-white/50 transition-colors cursor-pointer">
                <div class="flex flex-col gap-1">
                  <div
                    class="font-medium text-dtcc-navy truncate"
                    style="font-size: var(--atlas-body-text-size); line-height: var(--atlas-body-line-height);"
                  >
                    {sim.title || sim.name}
                  </div>
                  <div class="mt-0.5">
                    <span
                      class="text-dtcc-muted truncate"
                      style="font-size: var(--atlas-caption-text-size); line-height: var(--atlas-caption-line-height);"
                    >
                      {datasetSubtitle(sim)}
                    </span>
                  </div>
                  <div class="flex gap-1.5 flex-wrap pt-1">
                    {#if sim.data_kind_label}
                      <span class="inline-block px-2 py-0.5 rounded-full bg-dtcc-navy/10 text-dtcc-dark font-medium" style="font-size: var(--atlas-caption-text-size); line-height: var(--atlas-caption-line-height);">
                        {sim.data_kind_label}
                      </span>
                    {/if}
                    <span class="inline-block px-2 py-0.5 rounded-full bg-gray-300/20 text-dtcc-muted font-medium" style="font-size: var(--atlas-caption-text-size); line-height: var(--atlas-caption-line-height);">
                      No selection
                    </span>
                  </div>
                </div>
              </div>
            {/each}
        </div>
      {/if}
    </FloatingPanel>
  </div>
</div>
