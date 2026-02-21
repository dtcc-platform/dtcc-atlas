<script lang="ts">
  import { searchOpen } from '../stores/ui'
  import { searchLocation } from '../api/geocoding-api'
  import { Icons } from '../ui/icons'
  import type { NominatimResult } from '../types'

  interface Props {
    onSelect?: (result: NominatimResult) => void
  }

  let { onSelect }: Props = $props()
  let query = $state('')
  let results: NominatimResult[] = $state([])
  let loading = $state(false)
  let inputEl: HTMLInputElement
  let debounceTimer: ReturnType<typeof setTimeout>

  $effect(() => {
    if ($searchOpen && inputEl) {
      setTimeout(() => inputEl?.focus(), 50)
    }
  })

  function handleInput() {
    clearTimeout(debounceTimer)
    if (query.length < 2) { results = []; return }
    debounceTimer = setTimeout(async () => {
      loading = true
      try { results = await searchLocation(query) }
      catch { results = [] }
      loading = false
    }, 300)
  }

  function selectResult(r: NominatimResult) {
    onSelect?.(r)
    searchOpen.set(false)
    query = ''
    results = []
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      searchOpen.set(false)
      query = ''
      results = []
    }
  }
</script>

{#if $searchOpen}
  <!-- svelte-ignore a11y_consider_explicit_label -->
  <button class="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm cursor-default" aria-label="Close search" onclick={() => searchOpen.set(false)}></button>
  <div class="fixed top-[20%] left-1/2 -translate-x-1/2 z-50 w-[480px]">
    <div class="bg-white rounded-xl shadow-2xl border border-black/10 overflow-hidden">
      <div class="flex items-center gap-3 px-4 h-12 border-b border-black/5">
        <span class="w-5 h-5 text-[#6b7280] shrink-0">{@html Icons.search}</span>
        <input
          bind:this={inputEl}
          bind:value={query}
          oninput={handleInput}
          onkeydown={handleKeydown}
          placeholder="Search locations in Sweden..."
          class="flex-1 text-[14px] outline-none bg-transparent"
        />
        {#if query}
          <button class="p-1 rounded hover:bg-black/5 cursor-pointer w-5 h-5 shrink-0" onclick={() => { query = ''; results = [] }}>
            {@html Icons.close}
          </button>
        {/if}
      </div>
      {#if results.length > 0}
        <div class="max-h-[300px] overflow-y-auto">
          {#each results as result}
            <button
              class="w-full flex items-center gap-3 px-4 py-3 hover:bg-black/5 text-left cursor-pointer"
              onclick={() => selectResult(result)}
            >
              <span class="text-[13px] text-[#1a1a2e]">{result.display_name}</span>
            </button>
          {/each}
        </div>
      {:else if query.length >= 2 && !loading}
        <div class="px-4 py-6 text-center text-[13px] text-[#6b7280]">No results found</div>
      {/if}
    </div>
  </div>
{/if}
