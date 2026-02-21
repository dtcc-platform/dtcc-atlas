<script lang="ts">
  interface Props {
    icon: string
    label: string
    active?: boolean
    disabled?: boolean
    badge?: boolean
    onclick?: () => void
  }

  let { icon, label, active = false, disabled = false, badge = false, onclick }: Props = $props()
</script>

<button
  class="relative w-10 h-10 flex items-center justify-center rounded-lg transition-colors
    {active ? 'bg-[#e35a1d]/10 text-[#e35a1d]' : 'text-[#1a1a2e]/70 hover:bg-black/5'}
    {disabled ? 'opacity-30 pointer-events-none' : 'cursor-pointer'}"
  {disabled}
  onclick={onclick}
  title={label}
  aria-label={label}
>
  {@html icon}
  {#if badge}
    <div class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#e35a1d]"></div>
  {/if}
</button>
