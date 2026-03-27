<script lang="ts">
  interface Props {
    icon: string
    label: string
    active?: boolean
    disabled?: boolean
    badge?: number
    onclick?: () => void
  }

  let { icon, label, active = false, disabled = false, badge = 0, onclick }: Props = $props()

  function badgeText(n: number): string {
    if (n >= 100) return '99+'
    return String(n)
  }

  function badgeFontSize(n: number): string {
    if (n >= 100) return '5px'
    if (n >= 10) return '6px'
    return '7px'
  }
</script>

<div class="group relative">
  <button
    class="relative w-[53px] h-[55px] flex items-center justify-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none
      {active ? 'bg-dtcc-orange/10' : 'hover:bg-black/5'}
      {disabled ? 'opacity-30 pointer-events-none' : 'cursor-pointer'}"
    style={active ? '--stroke-0: #E35A1D' : ''}
    {disabled}
    onclick={onclick}
    aria-label={label}
  >
    {@html icon}
    {#if badge > 0}
      <div class="absolute top-1 right-0.5 w-[14px] h-[14px] rounded-full bg-dtcc-orange flex items-center justify-center">
        <span class="text-gray-200 font-semibold leading-none" style="font-size: {badgeFontSize(badge)}">{badgeText(badge)}</span>
      </div>
    {/if}
  </button>
  <div class="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3
    opacity-0 group-hover:opacity-100 transition-opacity delay-300
    px-2.5 py-1 rounded-md bg-dtcc-navy text-white text-[11px] font-medium whitespace-nowrap shadow-lg
    max-sm:hidden">
    {label}
  </div>
</div>

<style>
  /* Sized to fill the 53x55 NavItem wrapper proportionally (Figma 86-1936: 50x50 icon area).
     At 34px, stroke-width:2 SVGs render with ~1.8-2px visual strokes, matching the hamburger. */
  button :global(svg) {
    width: 34px;
    height: 34px;
  }
</style>
