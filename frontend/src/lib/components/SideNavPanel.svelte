<script lang="ts">
  import { sideNavOpen } from '../stores/ui'

  const navItems = [
    'Home',
    'Centre',
    'Research',
    'Platform',
    'Projects',
    'Case Studies',
    'Partners',
    'People',
    'Documentation',
    'Development',
    'News'
  ]

  function handleNavClick(item: string) {
    console.log('Navigating to:', item)
    sideNavOpen.set(false)
  }
</script>

<!--
  Positioned identically to the Toolbar capsule: same top, same left, same height.
  Slides in/out using translateX so layout of other elements is unaffected.
  The Toolbar and hamburger shift right independently via their own transforms.
-->
<div
  class="fixed z-[45] flex flex-col overflow-hidden
    bg-white/50 backdrop-blur-xl border border-white/20 shadow-[0_0_30px_rgba(255,255,255,0.15)]
    rounded-[25px] w-[171px]
    transition-transform duration-300 ease-out"
  class:translate-x-0={$sideNavOpen}
  class:-translate-x-[calc(171px+var(--atlas-edge-gap)+4px)]={!$sideNavOpen}
  style="
    top: var(--atlas-layout-top);
    left: var(--atlas-edge-gap);
    height: var(--atlas-docked-panel-height);
    max-height: var(--atlas-toolbar-natural-height);
    padding: 20px 24px;
  "
>
  <nav class="flex flex-col justify-between h-full overflow-y-auto">
    {#each navItems as item (item)}
      <button
        class="text-left leading-6 font-normal whitespace-nowrap
          transition-colors duration-150"
        style="font-size: var(--atlas-body-text-size); color: rgba(0,0,0,0.4);"
        onmouseenter={(e) => (e.currentTarget as HTMLElement).style.color = 'var(--color-dtcc-navy)'}
        onmouseleave={(e) => (e.currentTarget as HTMLElement).style.color = 'rgba(0,0,0,0.4)'}
        onclick={() => handleNavClick(item)}
      >
        {item}
      </button>
    {/each}
  </nav>
</div>

<style>
  nav {
    scrollbar-width: none;
  }
  nav::-webkit-scrollbar {
    display: none;
  }
</style>
