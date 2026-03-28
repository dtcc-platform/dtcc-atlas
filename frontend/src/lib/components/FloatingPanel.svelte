<script lang="ts">
  import type { Snippet } from 'svelte'
  import PanelHeader from './PanelHeader.svelte'

  interface Props {
    title: string
    onClose: () => void
    children: Snippet
    class?: string
    actionType?: 'close' | 'collapse-down' | 'collapse-up'
    panelId?: string
  }

  let { title, onClose, children, class: className = '', actionType = 'close', panelId = '' }: Props = $props()
</script>

<div
  class="bg-white/50 backdrop-blur-xl
    border border-white/20
    shadow-[0_0_30px_rgba(255,255,255,0.15)]
    rounded-[25px]
    p-5
    flex flex-col gap-[10px]
    overflow-hidden
    {className}"
  data-panel-id={panelId || undefined}
>
  <PanelHeader {title} {onClose} {actionType} />
  <div class="flex-1 overflow-y-auto overflow-x-hidden min-h-0 scrollbar-subtle">
    {@render children()}
  </div>
</div>

<style>
  .scrollbar-subtle::-webkit-scrollbar {
    width: 4px;
  }
  .scrollbar-subtle::-webkit-scrollbar-track {
    background: transparent;
  }
  .scrollbar-subtle::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.1);
    border-radius: 2px;
  }
  .scrollbar-subtle:hover::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.2);
  }
</style>
