<script lang="ts">
  import { onMount } from 'svelte'
  import { slide } from 'svelte/transition'
  import { versions, currentVersionId, addVersion, switchVersion, renameVersion, deleteVersion, duplicateVersion } from '../stores/layers'
  import { Icons } from '../ui/icons'

  const currentIdx = $derived($versions.findIndex(v => v.id === $currentVersionId))
  const currentVer = $derived($versions[currentIdx])

  let showingNewCard = $state(false)

  const navigationPos = $derived(showingNewCard ? $versions.length : currentIdx)
  const canGoPrev = $derived(navigationPos > 0)
  const canGoNext = $derived(navigationPos < $versions.length)

  let dropdownOpen = $state(false)
  let renamingId: string | null = $state(null)
  let renameValue = $state('')

  $effect(() => {
    $currentVersionId
    dropdownOpen = false
    renamingId = null
    showingNewCard = false
  })

  function goPrev() {
    if (!canGoPrev) return
    if (showingNewCard) {
      showingNewCard = false
    } else {
      switchVersion($versions[currentIdx - 1].id)
    }
  }

  function goNext() {
    if (!canGoNext) return
    if (currentIdx === $versions.length - 1) {
      showingNewCard = true
    } else {
      switchVersion($versions[currentIdx + 1].id)
    }
  }

  function toggleDropdown() {
    dropdownOpen = !dropdownOpen
    if (!dropdownOpen) renamingId = null
  }

  function startRename(id: string, name: string, e: MouseEvent) {
    e.stopPropagation()
    renamingId = id
    renameValue = name
  }

  function commitRename(id: string) {
    if (renameValue.trim()) renameVersion(id, renameValue.trim())
    renamingId = null
  }

  function handleRenameKeydown(id: string, e: KeyboardEvent) {
    e.stopPropagation()
    if (e.key === 'Enter') commitRename(id)
    if (e.key === 'Escape') renamingId = null
  }

  function handleDuplicate(id: string, e: MouseEvent) {
    e.stopPropagation()
    duplicateVersion(id)
  }

  function handleDelete(id: string, e: MouseEvent) {
    e.stopPropagation()
    deleteVersion(id)
  }

  function autoFocus(node: HTMLInputElement) {
    node.focus()
    node.select()
  }

  onMount(() => {
    function handleKeydown(e: KeyboardEvent) {
      if (!e.altKey) return
      if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev() }
      if (e.key === 'ArrowRight') { e.preventDefault(); goNext() }
    }
    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  })
</script>

<div class="flex flex-col" style="gap: 3px;">

  <!-- Main row: [capsule with arrows inside] [edit button in drag-handle column] -->
  <div class="flex items-center" style="gap: var(--atlas-layer-tag-gap);">

    <!-- Version capsule — flex-1 matches layer-capsule width -->
    {#if showingNewCard}
      <!-- + new dashed card with arrows inside -->
      <div
        class="flex-1 flex items-center min-w-0 rounded-full"
        style="height: var(--atlas-layer-tag-height);
               background: transparent; border: 1.5px dashed #E35A1D;
               padding: 0 3px;"
      >
        <!-- Left arrow (go back to last real version) -->
        <button
          class="shrink-0 flex items-center justify-center rounded-full transition-colors cursor-pointer
            text-dtcc-orange hover:bg-dtcc-orange/10
            focus-visible:outline-none"
          style="width: var(--atlas-layer-tag-button-size); height: var(--atlas-layer-tag-button-size);"
          onclick={goPrev}
          aria-label="Previous version"
        >
          <span class="inline-flex rotate-90" style="width: var(--atlas-layer-tag-icon-size); height: var(--atlas-layer-tag-icon-size);">
            {@html Icons.chevronDown}
          </span>
        </button>

        <!-- Create new version (centre of card) -->
        <button
          class="flex-1 flex items-center justify-center gap-[3px] font-light text-dtcc-orange cursor-pointer
            focus-visible:outline-none"
          style="font-size: var(--atlas-layer-tag-title-size);"
          onclick={addVersion}
          aria-label="Add new version"
        >
          <span class="inline-flex" style="width: var(--atlas-layer-tag-icon-size); height: var(--atlas-layer-tag-icon-size);">
            {@html Icons.plus}
          </span>
          new
        </button>

        <!-- Right arrow (disabled — already at end) -->
        <div
          class="shrink-0 flex items-center justify-center rounded-full text-dtcc-orange opacity-25"
          style="width: var(--atlas-layer-tag-button-size); height: var(--atlas-layer-tag-button-size);"
          aria-hidden="true"
        >
          <span class="inline-flex -rotate-90" style="width: var(--atlas-layer-tag-icon-size); height: var(--atlas-layer-tag-icon-size);">
            {@html Icons.chevronDown}
          </span>
        </div>
      </div>

    {:else}
      <!-- Active version card — same styling as .layer-capsule -->
      <div
        class="flex-1 flex items-center min-w-0 rounded-full"
        style="height: var(--atlas-layer-tag-height);
               background: rgba(255,255,255,0.8); border: 1px solid rgba(0,0,0,0.08);
               padding: 0 3px;"
      >
        <!-- Left arrow -->
        <button
          class="shrink-0 flex items-center justify-center rounded-full transition-colors
            focus-visible:outline-none
            {canGoPrev ? 'text-[#5F5F6D] hover:bg-black/5 cursor-pointer' : 'text-[#5F5F6D] opacity-25 cursor-default'}"
          style="width: var(--atlas-layer-tag-button-size); height: var(--atlas-layer-tag-button-size);"
          onclick={goPrev}
          disabled={!canGoPrev}
          aria-label="Previous version"
        >
          <span class="inline-flex rotate-90" style="width: var(--atlas-layer-tag-icon-size); height: var(--atlas-layer-tag-icon-size);">
            {@html Icons.chevronDown}
          </span>
        </button>

        <!-- v{n} badge -->
        <span
          class="shrink-0 flex items-center justify-center rounded-full bg-dtcc-orange text-white font-semibold"
          style="padding: 0 5px; height: 1.25rem; min-width: 1.375rem;
                 font-size: var(--atlas-caption-text-size); margin: 0 4px;"
        >
          v{currentIdx + 1}
        </span>

        <!-- Full name -->
        <span
          class="flex-1 min-w-0 truncate text-black font-light"
          style="font-size: var(--atlas-layer-tag-title-size);"
        >
          {currentVer?.name}
        </span>

        <!-- Right arrow -->
        <button
          class="shrink-0 flex items-center justify-center rounded-full transition-colors
            focus-visible:outline-none
            {canGoNext ? 'text-[#5F5F6D] hover:bg-black/5 cursor-pointer' : 'text-[#5F5F6D] opacity-25 cursor-default'}"
          style="width: var(--atlas-layer-tag-button-size); height: var(--atlas-layer-tag-button-size);"
          onclick={goNext}
          disabled={!canGoNext}
          aria-label="Next version"
        >
          <span class="inline-flex -rotate-90" style="width: var(--atlas-layer-tag-icon-size); height: var(--atlas-layer-tag-icon-size);">
            {@html Icons.chevronDown}
          </span>
        </button>
      </div>
    {/if}

    <!-- Edit button — sits in the drag-handle column, opens version management dropdown -->
    <button
      class="shrink-0 flex items-center justify-center rounded-full cursor-pointer transition-colors
        text-[#5F5F6D] hover:bg-black/5
        focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none"
      style="width: var(--atlas-layer-tag-button-size); height: var(--atlas-layer-tag-button-size);"
      onclick={toggleDropdown}
      aria-label="Manage versions"
      aria-expanded={dropdownOpen}
    >
      <span class="inline-flex" style="width: var(--atlas-layer-tag-icon-size); height: var(--atlas-layer-tag-icon-size);">
        {@html Icons.edit}
      </span>
    </button>
  </div>

  <!-- Dot indicators — centred within the capsule column (not over the edit button) -->
  <div class="flex items-center" style="gap: var(--atlas-layer-tag-gap);">
    <div class="flex-1 flex items-center justify-center" style="gap: 5px;">
      {#each { length: $versions.length + 1 } as _, i}
        <div
          class="rounded-full transition-all duration-200"
          style="height: 5px;
                 width: {i === navigationPos ? '14px' : '5px'};
                 background: {i === navigationPos ? '#E35A1D' : 'rgba(0,0,0,0.18)'};"
        ></div>
      {/each}
    </div>
    <!-- Spacer matching edit button column so dots centre over capsule only -->
    <div style="width: var(--atlas-layer-tag-button-size); flex-shrink: 0;"></div>
  </div>

  <!-- Management dropdown (slides open below) -->
  {#if dropdownOpen}
    <div
      transition:slide={{ duration: 150 }}
      class="flex flex-col overflow-hidden"
      style="gap: 2px;"
    >
      {#each $versions as version, idx}
        <div
          class="flex items-center rounded-full border border-black/5 transition-colors"
          style="gap: 4px; padding: 0 5px; height: var(--atlas-layer-tag-height);
                 background: {version.id === $currentVersionId ? 'rgba(227,90,29,0.06)' : 'rgba(255,255,255,0.8)'};"
        >
          <span
            class="shrink-0 flex items-center justify-center rounded-full font-semibold
              {version.id === $currentVersionId ? 'bg-dtcc-orange text-white' : 'bg-black/10 text-[#5F5F6D]'}"
            style="padding: 0 5px; height: 1.25rem; min-width: 1.375rem; font-size: var(--atlas-caption-text-size);"
          >
            v{idx + 1}
          </span>

          {#if renamingId === version.id}
            <input
              class="flex-1 min-w-0 bg-transparent text-black font-light focus:outline-none"
              style="font-size: var(--atlas-layer-tag-title-size);"
              bind:value={renameValue}
              onkeydown={(e) => handleRenameKeydown(version.id, e)}
              onblur={() => commitRename(version.id)}
              use:autoFocus
            />
          {:else}
            <button
              class="flex-1 min-w-0 text-left truncate font-light cursor-pointer focus-visible:outline-none
                {version.id === $currentVersionId ? 'text-dtcc-orange font-medium' : 'text-black'}"
              style="font-size: var(--atlas-layer-tag-title-size); line-height: var(--atlas-layer-tag-title-line-height);"
              onclick={() => switchVersion(version.id)}
            >
              {version.name}
            </button>
          {/if}

          <div class="flex items-center shrink-0" style="gap: 1px;">
            <button
              class="flex items-center justify-center rounded cursor-pointer text-[#5F5F6D] hover:bg-black/10 transition-colors focus-visible:outline-none"
              style="width: var(--atlas-layer-tag-button-size); height: var(--atlas-layer-tag-button-size);"
              onclick={(e) => startRename(version.id, version.name, e)}
              aria-label="Rename {version.name}"
            >
              <span class="inline-flex" style="width: var(--atlas-layer-tag-icon-size); height: var(--atlas-layer-tag-icon-size);">
                {@html Icons.edit}
              </span>
            </button>

            <button
              class="flex items-center justify-center rounded cursor-pointer text-[#5F5F6D] hover:bg-red-50 hover:text-red-500 transition-colors focus-visible:outline-none"
              style="width: var(--atlas-layer-tag-button-size); height: var(--atlas-layer-tag-button-size);"
              onclick={(e) => handleDelete(version.id, e)}
              aria-label="Delete {version.name}"
            >
              <span class="inline-flex" style="width: var(--atlas-layer-tag-icon-size); height: var(--atlas-layer-tag-icon-size);">
                {@html Icons.trash}
              </span>
            </button>
          </div>
        </div>
      {/each}

      <button
        class="flex items-center cursor-pointer rounded-full border border-black/5
          bg-white/20 hover:bg-white/40 transition-colors text-[#5F5F6D]
          focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none"
        style="gap: 6px; padding: 0 8px; height: var(--atlas-layer-tag-height);"
        onclick={addVersion}
      >
        <span class="inline-flex text-dtcc-orange" style="width: var(--atlas-layer-tag-icon-size); height: var(--atlas-layer-tag-icon-size);">
          {@html Icons.plus}
        </span>
        <span class="font-light" style="font-size: var(--atlas-layer-tag-title-size);">New version</span>
      </button>
    </div>
  {/if}

</div>
