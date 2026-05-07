<script lang="ts">
  // State for glass parameters based on the specification
  let blur = $state(4);
  let opacity = $state(0.55);
  let edgeHighlight = $state(0.25);
  let borderOpacity = $state(0.5);
  let saturate = $state(1.1);
  
  // Shadow specific state
  let shadowBlur = $state(7);
  let shadowDistance = $state(3);
  let shadowAngle = $state(90);

  // Calculate X and Y offsets
  let shadowX = $derived(Math.round(Math.cos(shadowAngle * Math.PI / 180) * shadowDistance));
  let shadowY = $derived(Math.round(Math.sin(shadowAngle * Math.PI / 180) * shadowDistance));

  // Derived style string
  let glassStyle = $derived(`
    --glass-blur: ${blur}px;
    --glass-bg-opacity: ${opacity};
    --glass-edge-opacity: ${edgeHighlight};
    --glass-border-opacity: ${borderOpacity};
    --glass-saturate: ${saturate};
    --glass-shadow-x: ${shadowX}px;
    --glass-shadow-y: ${shadowY}px;
    --glass-shadow-blur: ${shadowBlur}px;
  `);
</script>

<div class="fixed inset-0 z-[100] pointer-events-none flex flex-col items-center justify-center p-4 font-sans overflow-hidden">
  
  <div class="w-full max-w-5xl flex flex-col items-center justify-center gap-6 py-4">
    
    <!-- PREVIEW AREA (Condensed) -->
    <div class="flex flex-col items-center gap-4 pointer-events-auto" style={glassStyle}>
      <!-- TEST PILL -->
      <div class="glass-test-pill px-6 py-2 rounded-full text-dtcc-dark font-bold text-xs flex items-center gap-2">
        <span class="w-2 h-2 rounded-full bg-dtcc-orange animate-pulse"></span>
        Material Lab
      </div>

      <!-- TEST PANEL -->
      <div class="glass-test-panel w-[320px] rounded-[24px] p-6 flex flex-col gap-3">
        <div class="flex justify-between items-center border-b border-black/5 pb-2">
          <h2 class="text-dtcc-dark font-black text-base uppercase tracking-tight">Preview</h2>
          <button class="w-6 h-6 rounded-full bg-black/5 flex items-center justify-center text-dtcc-muted">✕</button>
        </div>
        <p class="text-dtcc-dark/80 text-xs leading-relaxed font-medium">
          Tuning the high-fidelity effect. Observe the <strong>contour-aware highlights</strong>.
        </p>
        <div class="p-3 bg-black/5 rounded-xl border border-white/40 flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg bg-dtcc-teal/20 flex items-center justify-center text-dtcc-teal">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          </div>
          <div class="text-[10px] font-bold text-dtcc-dark uppercase tracking-tight">X:{shadowX} Y:{shadowY}</div>
        </div>
      </div>
    </div>

    <!-- CONTROLS PANEL (Tightened for no-scroll) -->
    <div class="glass-test-panel w-full p-6 pointer-events-auto rounded-[32px]" style={glassStyle}>
      <div class="flex items-center gap-3 mb-6">
        <div class="w-10 h-10 rounded-xl bg-dtcc-dark flex items-center justify-center text-white">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
        </div>
        <div class="flex-1">
          <h3 class="text-dtcc-dark font-black text-base tracking-tight">Material Lab</h3>
          <p class="text-[10px] text-dtcc-muted font-bold uppercase tracking-widest opacity-60">No-Scroll Interface</p>
        </div>
        <button class="px-3 py-1.5 rounded-lg bg-dtcc-orange/10 text-dtcc-orange text-[10px] font-black uppercase tracking-widest hover:bg-dtcc-orange/20 transition-all" onclick={() => {
          blur = 4; opacity = 0.55; edgeHighlight = 0.25; borderOpacity = 0.5; saturate = 1.1;
          shadowBlur = 7; shadowDistance = 3; shadowAngle = 90;
        }}>Reset</button>
      </div>

      <div class="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
        <!-- OPTICS -->
        <div class="space-y-2">
          <div class="flex justify-between items-end">
            <label class="text-[9px] font-black text-dtcc-dark uppercase tracking-widest opacity-50">Blur</label>
            <span class="text-[10px] font-mono font-black text-dtcc-orange">{blur}px</span>
          </div>
          <input type="range" min="0" max="32" step="1" bind:value={blur} class="style-slider" />
        </div>

        <div class="space-y-2">
          <div class="flex justify-between items-end">
            <label class="text-[9px] font-black text-dtcc-dark uppercase tracking-widest opacity-50">Density</label>
            <span class="text-[10px] font-mono font-black text-dtcc-orange">{(opacity * 100).toFixed(0)}%</span>
          </div>
          <input type="range" min="0" max="0.8" step="0.01" bind:value={opacity} class="style-slider" />
        </div>

        <div class="space-y-2">
          <div class="flex justify-between items-end">
            <label class="text-[9px] font-black text-dtcc-dark uppercase tracking-widest opacity-50">Pop</label>
            <span class="text-[10px] font-mono font-black text-dtcc-orange">{saturate.toFixed(2)}x</span>
          </div>
          <input type="range" min="1" max="2.5" step="0.05" bind:value={saturate} class="style-slider" />
        </div>

        <div class="space-y-2">
          <div class="flex justify-between items-end">
            <label class="text-[9px] font-black text-dtcc-dark uppercase tracking-widest opacity-50">Edge</label>
            <span class="text-[10px] font-mono font-black text-dtcc-orange">{edgeHighlight.toFixed(2)}</span>
          </div>
          <input type="range" min="0" max="1" step="0.01" bind:value={edgeHighlight} class="style-slider" />
        </div>

        <!-- SHADOWS -->
        <div class="space-y-2">
          <div class="flex justify-between items-end">
            <label class="text-[9px] font-black text-dtcc-dark uppercase tracking-widest opacity-50">Shadow</label>
            <span class="text-[10px] font-mono font-black text-dtcc-orange">{shadowBlur}px</span>
          </div>
          <input type="range" min="0" max="60" step="1" bind:value={shadowBlur} class="style-slider" />
        </div>

        <div class="space-y-2">
          <div class="flex justify-between items-end">
            <label class="text-[9px] font-black text-dtcc-dark uppercase tracking-widest opacity-50">Dist</label>
            <span class="text-[10px] font-mono font-black text-dtcc-orange">{shadowDistance}px</span>
          </div>
          <input type="range" min="0" max="40" step="1" bind:value={shadowDistance} class="style-slider" />
        </div>

        <div class="space-y-2 md:col-span-2">
          <div class="flex justify-between items-end">
            <label class="text-[9px] font-black text-dtcc-dark uppercase tracking-widest opacity-50">Light Direction</label>
            <span class="text-[10px] font-mono font-black text-dtcc-orange">{shadowAngle}°</span>
          </div>
          <div class="flex items-center gap-3">
            <input type="range" min="0" max="360" step="1" bind:value={shadowAngle} class="style-slider flex-1" />
            <div class="w-8 h-8 rounded-full border border-black/10 bg-black/[0.02] relative shrink-0">
               <div class="absolute top-1/2 left-1/2 w-3.5 h-0.5 bg-dtcc-orange rounded-full origin-left shadow-[0_0_5px_rgba(227,90,29,0.3)]" style="transform: translate(-0%, -50%) rotate({shadowAngle}deg)"></div>
            </div>
          </div>
        </div>

      </div>
      
      <div class="mt-6 pt-4 border-t border-black/5 flex justify-between items-center">
        <div class="flex items-center gap-2">
          <div class="w-2 h-2 rounded-full bg-dtcc-orange"></div>
          <span class="text-[9px] font-black text-dtcc-dark uppercase tracking-widest">Active</span>
        </div>
        <button class="px-5 py-2 bg-dtcc-dark text-white text-[10px] font-black rounded-xl hover:bg-black transition-all uppercase tracking-widest shadow-lg shadow-black/10" onclick={() => window.location.href='/'}>Close</button>
      </div>
    </div>

  </div>
</div>

<style>
  .glass-test-panel, .glass-test-pill {
    position: relative;
    background: rgba(255, 255, 255, var(--glass-bg-opacity));
    backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
    -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
    border: 1px solid rgba(255, 255, 255, var(--glass-border-opacity));
    box-shadow: 
      var(--glass-shadow-x) var(--glass-shadow-y) var(--glass-shadow-blur) rgba(0, 0, 0, 0.2),
      inset 0 1px 0 rgba(255, 255, 255, 0.5),
      inset 0 -1px 0 rgba(255, 255, 255, 0.1);
    overflow: hidden;
  }

  .glass-test-panel::before, .glass-test-pill::before {
    content: '';
    position: absolute;
    inset: 0;
    padding: 2px;
    border-radius: inherit;
    /* Localized radial "shoulder pop" using the tuning variable */
    background: radial-gradient(
      ellipse at 30px 0px, 
      rgba(255, 255, 255, var(--glass-edge-opacity)) 0%, 
      rgba(255, 255, 255, calc(var(--glass-edge-opacity) * 0.4)) 40%, 
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

  .style-slider {
    width: 100%;
    height: 4px;
    background: #edf2f7;
    border-radius: 10px;
    appearance: none;
    outline: none;
  }

  .style-slider::-webkit-slider-thumb {
    appearance: none;
    width: 16px;
    height: 16px;
    background: #E35A1D;
    border: 3px solid white;
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 4px 8px rgba(227, 90, 29, 0.2);
  }
</style>
