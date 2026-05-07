<script lang="ts">
  import { sideNavOpen } from '../stores/ui'

  const navItems = [
    { label: 'Home', url: 'https://www.dtcc.chalmers.se/' },
    { label: 'About', url: 'https://www.dtcc.chalmers.se/about/' },
    { label: 'Projects', url: 'https://www.dtcc.chalmers.se/projects/' },
    { label: 'Gallery', url: 'https://www.dtcc.chalmers.se/gallery/' },
    { label: 'Partners', url: 'https://www.dtcc.chalmers.se/partners/' },
    { label: 'News', url: 'https://www.dtcc.chalmers.se/news/' },
    { label: 'Contact', url: 'https://www.dtcc.chalmers.se/contact/' },
    { label: 'Social', url: 'https://www.linkedin.com/company/digital-twin-cities-centre/' },
    { label: 'Platform', url: 'https://github.com/dtcc-platform/dtcc' },
    { label: 'Documentation', url: 'https://github.com/dtcc-platform/dtcc-atlas' }
  ]

  function handleNavClick(url: string) {
    window.open(url, '_blank')
    sideNavOpen.set(false)
  }
</script>

<!--
  Positioned identically to the Toolbar capsule: same top, same left, same height.
  Slides in/out using translateX so layout of other elements is unaffected.
  The Toolbar and hamburger shift right independently via their own transforms.
-->
<div
  class="glass-side-panel fixed z-[45] flex flex-col
    transition-transform duration-300 ease-out"
  class:translate-x-0={$sideNavOpen}
  class:-translate-x-[calc(171px+var(--atlas-edge-gap)+4px)]={!$sideNavOpen}
  style="
    top: var(--atlas-layout-top);
    left: var(--atlas-edge-gap);
    height: var(--atlas-docked-panel-height);
    max-height: var(--atlas-toolbar-natural-height);
    padding: 20px 24px;
    position: fixed !important;
  "
>
  <nav class="flex flex-col justify-between h-full overflow-y-auto">
    {#each navItems as item}
      <button
        class="text-left leading-6 font-normal whitespace-nowrap
          transition-colors duration-150"
        style="font-size: var(--atlas-body-text-size); color: rgba(0,0,0,0.4);"
        onmouseenter={(e) => (e.currentTarget as HTMLElement).style.color = 'var(--color-dtcc-navy)'}
        onmouseleave={(e) => (e.currentTarget as HTMLElement).style.color = 'rgba(0,0,0,0.4)'}
        onclick={() => handleNavClick(item.url)}
      >
        {item.label}
      </button>
    {/each}
  </nav>
</div>

<style>
  .glass-side-panel {
    position: relative;
    background: rgba(255, 255, 255, var(--glass-bg-opacity, 0.55));
    backdrop-filter: blur(var(--glass-blur, 4px)) saturate(var(--glass-saturate, 1.1));
    -webkit-backdrop-filter: blur(var(--glass-blur, 4px)) saturate(var(--glass-saturate, 1.1));
    border: 1px solid rgba(255, 255, 255, var(--glass-border-opacity, 0.5));
    box-shadow: 
      var(--glass-shadow-x, 0px) var(--glass-shadow-y, 3px) var(--glass-shadow-blur, 7px) rgba(0, 0, 0, 0.2),
      inset 0 1px 0 rgba(255, 255, 255, 0.5),
      inset 0 -1px 0 rgba(255, 255, 255, 0.1);
    border-radius: 25px;
    width: 171px;
    overflow: hidden;
  }

  /* Contour-aware specular highlight */
  .glass-side-panel::before {
    content: '';
    position: absolute;
    inset: 0;
    padding: 2px;
    border-radius: inherit;
    /* Localized radial "shoulder pop" at top-left */
    background: radial-gradient(
      ellipse at 30px 0px, 
      rgba(255, 255, 255, var(--glass-edge-opacity, 0.25)) 0%, 
      rgba(255, 255, 255, calc(var(--glass-edge-opacity, 0.25) * 0.4)) 40%, 
      transparent 80%
    );
    -webkit-mask: 
      linear-gradient(#fff 0 0) content-box, 
      linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    pointer-events: none;
    z-index: 50;
  }

  nav {
    scrollbar-width: none;
  }
  nav::-webkit-scrollbar {
    display: none;
  }
</style>
