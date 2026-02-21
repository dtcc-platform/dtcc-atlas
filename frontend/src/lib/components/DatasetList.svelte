<script lang="ts">
  import { datasets, selectedDataset, formConfig } from '../stores/datasets'
  import { activePanel } from '../stores/ui'
  import { fetchDatasetSchema } from '../api/dataset-api'
  import { schemaParser } from '../forms/schema-parser'
  import type { DatasetInfo } from '../types'

  async function selectDataset(dataset: DatasetInfo) {
    selectedDataset.set(dataset)
    const schema = await fetchDatasetSchema(dataset.name)
    const config = schemaParser.parse(schema, dataset.name)
    formConfig.set(config)
    activePanel.set('dataset-form')
  }
</script>

<div class="p-5">
  <div class="flex items-center justify-between mb-4">
    <h3 class="text-[16px] font-semibold text-[#1a1a2e]">Select Dataset</h3>
    <span class="text-[12px] text-[#6b7280]">{$datasets.length} available</span>
  </div>
  <div class="flex flex-col gap-1">
    {#each $datasets as dataset}
      <button
        class="flex items-center justify-between px-3 py-3 rounded-lg text-left
          hover:bg-black/5 transition-colors group cursor-pointer"
        onclick={() => selectDataset(dataset)}
      >
        <div class="flex items-center gap-3">
          <div class="w-2 h-2 rounded-full {dataset.type === 'vector' ? 'bg-green-500' : 'bg-blue-500'}"></div>
          <span class="text-[13px] text-[#1a1a2e]">{dataset.title || dataset.name}</span>
        </div>
        <span class="text-[#6b7280] opacity-0 group-hover:opacity-100 transition-opacity">&rarr;</span>
      </button>
    {/each}
  </div>
</div>
