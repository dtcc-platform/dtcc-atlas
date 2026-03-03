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

<div class="group relative">
  <button
    class="relative w-10 h-10 flex items-center justify-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none
      {active ? 'bg-dtcc-orange/10 text-dtcc-orange' : 'text-dtcc-navy/70 hover:bg-black/5'}
      {disabled ? 'opacity-30 pointer-events-none' : 'cursor-pointer'}"
    {disabled}
    onclick={onclick}
    aria-label={label}
  >
    {@html icon}
    {#if badge}
      <div class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-dtcc-orange"></div>
    {/if}
  </button>
  <div class="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2
    opacity-0 group-hover:opacity-100 transition-opacity delay-300
    px-2 py-1 rounded bg-dtcc-navy text-white text-[11px] font-medium whitespace-nowrap shadow-lg
    max-sm:hidden">
    {label}
  </div>
</div>
