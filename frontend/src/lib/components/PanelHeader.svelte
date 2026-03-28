<script lang="ts">
  import { Icons } from '../ui/icons'

  interface Props {
    title: string
    onClose: () => void
    actionType?: 'close' | 'collapse-down' | 'collapse-up'
  }

  let { title, onClose, actionType = 'close' }: Props = $props()

  const actionIcon = $derived.by(() => {
    switch (actionType) {
      case 'collapse-down': return Icons.chevronDown
      case 'collapse-up': return Icons.chevronDown
      default: return Icons.close
    }
  })

  const actionLabel = $derived.by(() => {
    switch (actionType) {
      case 'collapse-down': return `Collapse ${title} panel`
      case 'collapse-up': return `Expand ${title} panel`
      default: return `Close ${title} panel`
    }
  })
</script>

<div class="flex items-center justify-between pl-[15px] py-[5px] shrink-0">
  <span class="text-[20px] font-medium text-black tracking-[-0.18px] leading-[30px] select-none">
    {title}
  </span>
  <button
    class="w-[40px] h-[41px] flex items-center justify-center rounded-lg cursor-pointer
      text-[#5F5F6D] hover:bg-black/5 transition-colors
      focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none"
    onclick={onClose}
    aria-label={actionLabel}
  >
    <span
      class="w-[24px] h-[24px] inline-flex items-center justify-center {actionType === 'collapse-up' ? 'rotate-180' : ''}"
    >{@html actionIcon}</span>
  </button>
</div>
