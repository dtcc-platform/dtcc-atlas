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
    searchOpen.set(false)
    query = ''
    results = []
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      searchOpen.set(false)
      query = ''
      results = []
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
</script>

{#if $searchOpen}
  <!-- svelte-ignore a11y_consider_explicit_label -->
  <button class="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm cursor-default focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none" aria-label="Close search" onclick={() => searchOpen.set(false)}></button>
  <div class="fixed top-[20%] left-1/2 -translate-x-1/2 z-50 w-[480px]" onkeydown={trapFocus}>
    <div class="bg-white/50 backdrop-blur-xl border border-white/20 shadow-[0_0_30px_rgba(255,255,255,0.15)] rounded-[25px] overflow-hidden">
      <div class="flex items-center gap-3 px-4 h-12 border-b border-black/5">
        <span class="w-5 h-5 text-dtcc-muted shrink-0">{@html Icons.search}</span>
        <input
          bind:this={inputEl}
          bind:value={query}
          oninput={handleInput}
          onkeydown={handleKeydown}
          placeholder="Search locations in Sweden..."
          class="flex-1 text-[14px] outline-none bg-transparent"
          role="combobox"
          aria-expanded={results.length > 0}
        />
        {#if query}
          <button class="p-1 rounded hover:bg-black/5 cursor-pointer w-5 h-5 shrink-0 focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none" onclick={() => { query = ''; results = [] }}>
            {@html Icons.close}
          </button>
        {/if}
      </div>
      {#if results.length > 0}
        <div class="max-h-[300px] overflow-y-auto" role="listbox">
          {#each results as result, idx}
            <button
              class="w-full flex items-center gap-3 px-4 py-3 hover:bg-black/5 text-left cursor-pointer focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none
                {idx === selectedIndex ? 'bg-black/5' : ''}"
              role="option"
              aria-selected={idx === selectedIndex}
              onclick={() => selectResult(result)}
            >
              <span class="text-[13px] text-dtcc-navy">{result.display_name}</span>
            </button>
          {/each}
        </div>
      {:else if query.length >= 2 && !loading}
        <div class="px-4 py-6 text-center text-[13px] text-dtcc-muted">No results found</div>
      {/if}
    </div>
  </div>
{/if}
