<script lang="ts">
  import { datasets, selectedDataset, formConfig } from '../stores/datasets'
  import { onMount, onDestroy } from 'svelte'
  import { activePanel, collapsedPanels, togglePanelCollapsed, activeDatasetPanelIds } from '../stores/ui'
  import { fetchDatasetSchema } from '../api/dataset-api'
  import { schemaParser } from '../forms/schema-parser'
  import FloatingPanel from './FloatingPanel.svelte'
  import type { DatasetInfo } from '../types'

  type CategoryKey = 'dtcc-core' | 'user-uploaded'

  interface Category {
    key: CategoryKey
    label: string
    datasets: DatasetInfo[]
  }

  const CATEGORY_META: { key: CategoryKey; label: string }[] = [
    { key: 'dtcc-core', label: 'DTCC Core' },
    { key: 'user-uploaded', label: 'User Uploads' },
  ]

  function sourceGroupKey(dataset: DatasetInfo): CategoryKey {
    const source = (dataset.source_group || dataset.source || '').toLowerCase()
    if (source === 'dtcc-core') return 'dtcc-core'
    if (source === 'dtcc-sim') return 'dtcc-sim'
    if (source === 'user-uploaded' || source === 'uploaded') return 'user-uploaded'
    if (source.includes('upload')) return 'user-uploaded'
    return 'dtcc-core'
  }

  // Group datasets into categories, only include non-empty ones
  // Filter out dtcc-sim datasets (they appear in Simulations panel instead)
  const activeCategories = $derived.by(() => {
    const map = new Map<CategoryKey, DatasetInfo[]>()
    for (const d of $datasets) {
      const source = (d.source_group || d.source || '').toLowerCase()
      // Skip dtcc-sim datasets — they're shown in the Simulations panel
      if (source === 'dtcc-sim') continue

      const key = sourceGroupKey(d)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(d)
    }
    const result: Category[] = []
    for (const meta of CATEGORY_META) {
      const items = map.get(meta.key)
      if (items && items.length > 0) {
        result.push({
          key: meta.key,
          label: meta.label,
          datasets: items.sort((a, b) => (a.title || a.name).localeCompare(b.title || b.name)),
        })
      }
    }
    return result
  })

  // When no datasets at all, show a single empty panel
  const showEmpty = $derived($datasets.length === 0)

  // How many category panels are currently collapsed — drives height redistribution
  const collapsedCount = $derived(
    activeCategories.filter(cat => Boolean($collapsedPanels[panelIdForCategory(cat.key)])).length
  )

  // Compute the explicit height for each category wrapper so all panels
  // reanimate simultaneously when one collapses/expands.
  function wrapperHeight(isColl: boolean): string {
    if (isColl) return 'var(--atlas-panel-collapsed-height)'
    const n = activeCategories.length
    const c = collapsedCount
    const e = n - c
    if (e === 0) return '0px'
    if (n === 1 && c === 0) return '100%'
    const subtractParts: string[] = []
    if (n > 1) subtractParts.push(`${n - 1} * var(--atlas-panel-gap)`)
    if (c > 0) subtractParts.push(`${c} * var(--atlas-panel-collapsed-height)`)
    const body = subtractParts.length
      ? `100% - ${subtractParts.join(' - ')}`
      : '100%'
    return e === 1 ? `calc(${body})` : `calc((${body}) / ${e})`
  }

  async function selectDataset(dataset: DatasetInfo) {
    selectedDataset.set(dataset)
    const schema = await fetchDatasetSchema(dataset.name)
    const config = schemaParser.parse(schema, dataset.name)
    formConfig.set(config)
    activePanel.set('dataset-form')
  }

  function handleClose() {
    activePanel.set(null)
  }

  function datasetSubtitle(dataset: DatasetInfo): string {
    const bits: string[] = []
    if (dataset.version !== undefined) bits.push(`v${dataset.version}`)
    if (dataset.supported_formats && dataset.supported_formats.length > 0) {
      bits.push(`formats: ${dataset.supported_formats.join(', ')}`)
    }
    return bits.join(' • ')
  }

  function panelIdForCategory(key: string) {
    return `datasets:${key}`
  }

  // Keep activeDatasetPanelIds in sync so LurkieChat can collapse them without duplicating logic
  $effect(() => {
    activeDatasetPanelIds.set(activeCategories.map(cat => panelIdForCategory(cat.key)))
  })
  onMount(() => collapsedPanels.update(s => {
    const next = { ...s }
    for (const key of Object.keys(next)) { if (key.startsWith('datasets:')) delete next[key] }
    return next
  }))
  onDestroy(() => activeDatasetPanelIds.set([]))
</script>

<!-- Dataset panel stack: flex column so panels reflow when one collapses -->
<div
  class="fixed z-30 flex flex-col animate-panel-in"
  style="top: var(--atlas-layout-top); left: var(--atlas-topbar-right-left); right: var(--atlas-edge-gap); height: var(--atlas-toolbar-natural-height); gap: var(--atlas-panel-gap);"
>
  {#if showEmpty}
    <div
      class="overflow-visible"
      style="height: {Boolean($collapsedPanels['datasets:empty']) ? 'var(--atlas-panel-collapsed-height)' : '100%'}; transition: height 200ms ease-out;"
    >
      <FloatingPanel
        title="Datasets"
        panelId="datasets:empty"
        collapsed={Boolean($collapsedPanels['datasets:empty'])}
        onToggleCollapsed={() => togglePanelCollapsed('datasets:empty')}
        onClose={handleClose}
        class="h-full"
      >
        <div class="flex items-center justify-center h-full text-center">
          <p class="text-sm text-dtcc-muted">No datasets found. Try uploading data, then reopen this panel.</p>
        </div>
      </FloatingPanel>
    </div>
  {:else}
    <!-- One panel per non-empty dataset category -->
    {#each activeCategories as cat, index (cat.key)}
      {@const panelId = panelIdForCategory(cat.key)}
      {@const isColl = Boolean($collapsedPanels[panelId])}
      <div
        class="overflow-visible"
        style="height: {wrapperHeight(isColl)}; flex-shrink: 0; transition: height 200ms ease-out;"
      >
        <FloatingPanel
          title={cat.label}
          panelId={panelId}
          collapsed={isColl}
          onToggleCollapsed={() => togglePanelCollapsed(panelId)}
          onClose={index === 0 ? handleClose : undefined}
          class="h-full"
        >
          <div class="flex flex-col gap-[clamp(6px,0.56vh,8px)]">
            {#each cat.datasets as dataset (dataset.name)}
              <button
                class="w-full flex items-start justify-between px-[var(--atlas-card-padding-x)] py-[var(--atlas-card-padding-y)] rounded-[var(--atlas-control-radius)] border border-black/5 text-left
                  bg-white/30 hover:bg-white/50 transition-colors group cursor-pointer
                  focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none"
                onclick={() => selectDataset(dataset)}
              >
                <div class="min-w-0">
                  <div
                    class="font-medium text-dtcc-navy truncate"
                    style="font-size: var(--atlas-body-text-size); line-height: var(--atlas-body-line-height);"
                  >
                    {dataset.title || dataset.name}
                  </div>
                  <div class="mt-0.5">
                    <span
                      class="text-dtcc-muted truncate"
                      style="font-size: var(--atlas-caption-text-size); line-height: var(--atlas-caption-line-height);"
                    >
                      {datasetSubtitle(dataset)}
                    </span>
                  </div>
                </div>
                <span class="text-dtcc-muted opacity-0 group-hover:opacity-100 transition-opacity mt-0.5">&rarr;</span>
              </button>
            {/each}
          </div>
        </FloatingPanel>
      </div>
    {/each}
  {/if}
</div>

<style>
  @keyframes panel-in {
    from { opacity: 0; transform: translateX(8px); }
    to { opacity: 1; transform: translateX(0); }
  }
  .animate-panel-in {
    animation: panel-in 200ms ease-out;
  }
</style>
