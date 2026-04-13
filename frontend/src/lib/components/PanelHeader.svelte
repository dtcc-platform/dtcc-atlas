<script lang="ts">
  import { Icons } from '../ui/icons'

  interface Props {
    title: string
    collapsed?: boolean
    onToggleCollapsed?: () => void
    onClose?: () => void
    leadingActionIcon?: string
    leadingActionLabel?: string
    onLeadingAction?: () => void
  }

  let {
    title,
    collapsed = false,
    onToggleCollapsed,
    onClose,
    leadingActionIcon,
    leadingActionLabel = '',
    onLeadingAction,
  }: Props = $props()

  const collapseLabel = $derived(
    collapsed ? `Expand ${title} panel` : `Collapse ${title} panel`
  )
  const closeLabel = $derived(`Close ${title} panel`)
</script>

<div
  class="min-h-[var(--atlas-panel-header-height)] flex items-center gap-2 shrink-0"
>
  {#if onLeadingAction && leadingActionIcon}
    <button
      class="w-[var(--atlas-panel-action-size)] h-[var(--atlas-panel-action-size)] shrink-0
        flex items-center justify-center rounded-lg cursor-pointer
        text-[#5F5F6D] hover:bg-black/5 transition-colors
        focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none"
      onclick={onLeadingAction}
      aria-label={leadingActionLabel}
    >
      <span class="w-[var(--atlas-panel-action-icon-size)] h-[var(--atlas-panel-action-icon-size)] inline-flex items-center justify-center">
        {@html leadingActionIcon}
      </span>
    </button>
  {/if}

  <span
    class="flex-1 min-w-0 text-[var(--atlas-panel-header-title-size)] font-medium text-black
      tracking-[-0.18px] leading-[var(--atlas-panel-header-line-height)] truncate select-none"
  >
    {title}
  </span>

  <div class="flex items-center gap-1 shrink-0">
    {#if onToggleCollapsed}
      <button
        class="w-[var(--atlas-panel-action-size)] h-[var(--atlas-panel-action-size)] flex items-center justify-center rounded-lg cursor-pointer
          text-[#5F5F6D] hover:bg-black/5 transition-colors
          focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none"
        onclick={onToggleCollapsed}
        aria-label={collapseLabel}
        aria-expanded={!collapsed}
      >
        <span
          class="w-[var(--atlas-panel-action-icon-size)] h-[var(--atlas-panel-action-icon-size)] inline-flex items-center justify-center transition-transform duration-200"
          class:rotate-180={!collapsed}
        >
          {@html Icons.chevronDown}
        </span>
      </button>
    {/if}

    {#if onClose}
      <button
        class="w-[var(--atlas-panel-action-size)] h-[var(--atlas-panel-action-size)] flex items-center justify-center rounded-lg cursor-pointer
          text-[#5F5F6D] hover:bg-black/5 transition-colors
          focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none"
        onclick={onClose}
        aria-label={closeLabel}
      >
        <span class="w-[var(--atlas-panel-action-icon-size)] h-[var(--atlas-panel-action-icon-size)] inline-flex items-center justify-center">
          {@html Icons.close}
        </span>
      </button>
    {/if}
  </div>
</div>
