<script lang="ts">
  import { activePanel } from '../stores/ui'
  import type { Snippet } from 'svelte'

  interface Props {
    children: Snippet
  }

  let { children }: Props = $props()
</script>

{#if $activePanel !== null}
  <div
    class="absolute top-0 right-0 h-full w-[360px] z-30
      bg-white/90 backdrop-blur-xl border-l border-black/5 shadow-2xl
      animate-slide-in overflow-y-auto"
  >
    {@render children()}
  </div>
{/if}

<style>
  @keyframes slide-in {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }
  .animate-slide-in {
    animation: slide-in 200ms ease-out;
  }
</style>
