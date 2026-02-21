<script lang="ts">
  import { bboxArea } from '../stores/map'

  interface Props {
    open: boolean
    onSave?: (name: string) => void
    onClose?: () => void
  }

  let { open = $bindable(), onSave, onClose }: Props = $props()
  let name = $state('')
  let inputEl: HTMLInputElement | undefined = $state(undefined)

  $effect(() => {
    if (open && inputEl) setTimeout(() => inputEl?.focus(), 50)
  })

  function handleSave() {
    if (!name.trim()) return
    onSave?.(name.trim())
    name = ''
    open = false
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_consider_explicit_label -->
  <button class="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm cursor-default" aria-label="Close dialog" onclick={() => { open = false; onClose?.() }}></button>
  <div class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50
    w-[360px] bg-white rounded-xl shadow-2xl p-5">
    <h3 class="text-[16px] font-semibold text-[#1a1a2e] mb-1">Save Bookmark</h3>
    <p class="text-[12px] text-[#6b7280] mb-4">Area: {$bboxArea.toFixed(2)} km²</p>
    <input
      bind:this={inputEl}
      bind:value={name}
      placeholder="Bookmark name..."
      class="w-full h-9 px-3 rounded-lg border border-[#e5e7eb] text-[13px] mb-4
        focus:outline-none focus:ring-2 focus:ring-[#e35a1d]/30 focus:border-[#e35a1d]"
      onkeydown={(e) => e.key === 'Enter' && handleSave()}
    />
    <div class="flex gap-2 justify-end">
      <button class="px-4 h-9 rounded-lg text-[13px] text-[#6b7280] hover:bg-black/5 cursor-pointer" onclick={() => { open = false; onClose?.() }}>Cancel</button>
      <button
        class="px-4 h-9 rounded-lg bg-[#e35a1d] text-white text-[13px] font-semibold hover:bg-[#c94d18] cursor-pointer"
        onclick={handleSave}
      >Save</button>
    </div>
  </div>
{/if}
