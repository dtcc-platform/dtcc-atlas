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
  class="bg-white/50 backdrop-blur-xl border border-white/20 shadow-[0_0_30px_rgba(255,255,255,0.15)]
    flex flex-col overflow-hidden min-h-0 transition-[height] duration-200 {className}"
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
