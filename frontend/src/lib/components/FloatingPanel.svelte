<script lang="ts">
  import type { Snippet } from 'svelte'
  import { slide } from 'svelte/transition'
  import PanelHeader from './PanelHeader.svelte'

  interface Props {
    title: string
    children: Snippet
    class?: string
    bodyClass?: string
    panelId?: string
    collapsed?: boolean
    onToggleCollapsed?: () => void
    onClose?: () => void
    leadingActionIcon?: string
    leadingActionLabel?: string
    onLeadingAction?: () => void
  }

  let {
    title,
    children,
    class: className = '',
    bodyClass = '',
    panelId = '',
    collapsed = false,
    onToggleCollapsed,
    onClose,
    leadingActionIcon,
    leadingActionLabel = '',
    onLeadingAction,
  }: Props = $props()
</script>

<div
  class="glass-panel flex flex-col overflow-hidden min-h-0 transition-[height] duration-200 {className}"
  style="border-radius: var(--atlas-panel-radius); padding: var(--atlas-panel-padding); gap: var(--atlas-panel-inner-gap);"
  data-panel-id={panelId || undefined}
>
  <PanelHeader
    {title}
    {collapsed}
    {onToggleCollapsed}
    {onClose}
    {leadingActionIcon}
    {leadingActionLabel}
    {onLeadingAction}
  />

  {#if !collapsed}
    <div transition:slide={{ duration: 200 }} class="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain scrollbar-subtle {bodyClass}">
      {@render children()}
    </div>
  {/if}
</div>

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
