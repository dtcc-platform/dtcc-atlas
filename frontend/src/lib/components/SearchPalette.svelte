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
  let inputEl: HTMLInputElement | undefined = $state(undefined)
  let debounceTimer: ReturnType<typeof setTimeout>
  let selectedIndex = $state(-1)
  const searchDialogId = 'atlas-search-dialog'
  const searchResultsId = 'atlas-search-results'

  $effect(() => {
    if ($searchOpen && inputEl) {
      setTimeout(() => inputEl?.focus(), 50)
    }
  })

  function handleInput() {
    clearTimeout(debounceTimer)
    if (query.length < 2) { results = []; selectedIndex = -1; return }
    debounceTimer = setTimeout(async () => {
      loading = true
      try { results = await searchLocation(query) }
      catch { results = [] }
      selectedIndex = -1
      loading = false
    }, 300)
  }

  function selectResult(r: NominatimResult) {
    onSelect?.(r)
    closeSearch()
  }

  function closeSearch() {
    searchOpen.set(false)
    query = ''
    results = []
    selectedIndex = -1
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      closeSearch()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      selectedIndex = Math.min(selectedIndex + 1, results.length - 1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      selectedIndex = Math.max(selectedIndex - 1, 0)
    } else if (e.key === 'Enter' && selectedIndex >= 0 && results[selectedIndex]) {
      e.preventDefault()
      selectResult(results[selectedIndex])
    }
  }

  function trapFocus(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      closeSearch()
      return
    }
    if (e.key !== 'Tab') return
    const dialog = e.currentTarget as HTMLElement
    const focusable = dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  function resultId(index: number): string {
    return `atlas-search-result-${index}`
  }
</script>

{#if $searchOpen}
  <!-- svelte-ignore a11y_consider_explicit_label -->
  <button class="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm cursor-default focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none" aria-label="Close search" onclick={closeSearch}></button>
  <div
    id={searchDialogId}
    class="fixed top-[20%] left-1/2 -translate-x-1/2 z-50 w-[min(92vw,480px)]"
    role="dialog"
    aria-modal="true"
    aria-label="Search locations"
    tabindex="-1"
    onkeydown={trapFocus}
  >
    <div class="glass-panel rounded-[var(--atlas-panel-radius)] overflow-hidden">
      <div class="flex items-center gap-3 px-[var(--atlas-panel-padding)] h-[var(--atlas-panel-header-height)] border-b border-black/5">
        <span class="w-5 h-5 text-dtcc-muted shrink-0">{@html Icons.search}</span>
        <input
          bind:this={inputEl}
          bind:value={query}
          oninput={handleInput}
          onkeydown={handleKeydown}
          placeholder="Search locations in Sweden..."
          class="flex-1 text-[var(--atlas-body-text-size)] outline-none bg-transparent"
          role="combobox"
          aria-controls={searchResultsId}
          aria-expanded={results.length > 0}
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-activedescendant={selectedIndex >= 0 ? resultId(selectedIndex) : undefined}
        />
        {#if query}
          <button class="p-1 rounded hover:bg-black/5 cursor-pointer w-5 h-5 shrink-0 focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none" onclick={() => { query = ''; results = []; selectedIndex = -1 }}>
            {@html Icons.close}
          </button>
        {/if}
      </div>
      {#if results.length > 0}
        <div id={searchResultsId} class="max-h-[min(300px,45vh)] overflow-y-auto" role="listbox">
          {#each results as result, idx}
            <button
              id={resultId(idx)}
              class="w-full flex items-center gap-3 px-[var(--atlas-panel-padding)] py-[var(--atlas-card-padding-y)] hover:bg-black/5 text-left cursor-pointer focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none
                {idx === selectedIndex ? 'bg-black/5' : ''}"
              role="option"
              aria-selected={idx === selectedIndex}
              onclick={() => selectResult(result)}
            >
              <span class="text-[var(--atlas-body-text-size)] leading-[var(--atlas-body-line-height)] text-dtcc-navy">{result.display_name}</span>
            </button>
          {/each}
        </div>
      {:else if query.length >= 2 && !loading}
        <div class="px-[var(--atlas-panel-padding)] py-6 text-center text-[var(--atlas-body-text-size)] text-dtcc-muted">No results found</div>
      {/if}
    </div>
  </div>
{/if}

<style>
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
</style>
