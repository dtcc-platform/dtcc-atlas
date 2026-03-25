<script lang="ts">
  import { activePanel } from '../stores/ui'
  import type { Snippet } from 'svelte'

  interface Props {
    children: Snippet
  }

  let { children }: Props = $props()
  let visible = $state(false)
  let animatingOut = $state(false)

  $effect(() => {
    if ($activePanel !== null) {
      visible = true
      animatingOut = false
    } else if (visible) {
      animatingOut = true
      setTimeout(() => {
        visible = false
        animatingOut = false
      }, 200)
    }
  })
</script>

{#if visible}
  <div
    class="absolute top-0 right-0 h-full w-full sm:w-[360px] z-30
      bg-white/90 backdrop-blur-xl border-l border-black/5 shadow-2xl
      {animatingOut ? 'animate-slide-out' : 'animate-slide-in'} {$activePanel === 'chat' ? 'overflow-hidden' : 'overflow-y-auto'}"
  >
    {@render children()}
  </div>
{/if}

<style>
  @keyframes slide-in {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }
  @keyframes slide-out {
    from { transform: translateX(0); }
    to { transform: translateX(100%); }
  }
  .animate-slide-in {
    animation: slide-in 200ms ease-out;
  }
  .animate-slide-out {
    animation: slide-out 200ms ease-in forwards;
  }
</style>
