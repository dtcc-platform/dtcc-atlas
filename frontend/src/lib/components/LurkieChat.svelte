<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte'
  import { Marked } from 'marked'
  import DOMPurify from 'dompurify'
  import { Icons } from '../ui/icons'
  import { chatMessages, chatLoading, chatError, addUserMessage, clearChat } from '../stores/chat-store'
  import { chatService } from '../services/chat-service'
  import type { ChatMessage } from '../stores/chat-store'

  const md = new Marked({ breaks: true })
  const renderMarkdown = (text: string) =>
    DOMPurify.sanitize(md.parse(text, { async: false }))

  // Chat states: 'collapsed' (icon only), 'expanded' (input bar), 'active' (chat + input)
  type ChatState = 'collapsed' | 'expanded' | 'active'
  let chatState = $state<ChatState>('collapsed')
  let inputText = $state('')
  let messagesContainer: HTMLDivElement
  let inputEl: HTMLTextAreaElement
  let containerEl: HTMLDivElement

  // Derive whether we have messages (determines if click-outside collapses)
  let hasMessages = $derived($chatMessages.length > 0)

  // Transition to active state when messages exist
  $effect(() => {
    if (hasMessages && chatState === 'expanded') {
      chatState = 'active'
    }
  })

  // Auto-scroll messages to bottom
  $effect(() => {
    if ($chatMessages.length > 0) {
      tick().then(scrollToBottom)
    }
  })

  function scrollToBottom() {
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight
    }
  }

  let triggerFlash = $state(false)

  function handleTriggerClick() {
    if (chatState === 'collapsed') {
      triggerFlash = true
      setTimeout(() => {
        triggerFlash = false
        chatState = hasMessages ? 'active' : 'expanded'
        tick().then(() => {
          if (inputEl) inputEl.focus()
        })
      }, 150)
    }
  }

  function handleSend() {
    const text = inputText.trim()
    if (!text || $chatLoading) return

    addUserMessage(text)
    chatService.sendMessage(text)
    inputText = ''

    if (chatState === 'expanded') {
      chatState = 'active'
    }

    tick().then(() => {
      if (inputEl) inputEl.focus()
    })
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      collapse()
    }
  }

  function collapse() {
    chatState = 'collapsed'
    inputText = ''
  }

  function handleClickOutside(e: MouseEvent) {
    if (chatState === 'collapsed') return
    if (containerEl && !containerEl.contains(e.target as Node)) {
      collapse()
    }
  }

  function handleNewChat() {
    clearChat()
    chatService.newChat()
    chatState = 'expanded'
    tick().then(() => {
      if (inputEl) inputEl.focus()
    })
  }

  // Responsive scaling: match the proportional scaling used by other floating panels.
  // Positions are set dynamically instead of using fixed Tailwind margin classes.
  $effect(() => {
    if (!containerEl) return
    function updateScale() {
      const topOffset = 77
      const bottomMargin = 16
      const available = window.innerHeight - topOffset - bottomMargin
      const scale = Math.min(1, available / 633)
      const margin = 16 * scale
      containerEl.style.bottom = `${margin}px`
      containerEl.style.right = `${margin}px`
      containerEl.style.transform = `scale(${scale})`
      containerEl.style.transformOrigin = 'bottom right'
    }
    updateScale()
    window.addEventListener('resize', updateScale)
    return () => window.removeEventListener('resize', updateScale)
  })

  onMount(() => {
    chatService.connect()
    document.addEventListener('mousedown', handleClickOutside)
  })

  onDestroy(() => {
    chatService.disconnect()
    document.removeEventListener('mousedown', handleClickOutside)
  })
</script>

<!-- Self-contained Lurkie Chat: bottom-right fixed position -->
<div bind:this={containerEl} class="fixed z-30 flex flex-col items-end gap-2">
  <!-- TODO: Chat panel should respect inter-panel gaps when other panels (datasets, layers)
       are open simultaneously. Currently positioned independently. A centralized panel layout
       manager would be needed to coordinate positions across all floating panels. -->
  <!-- State 3: Chat panel (above input bar) -->
  {#if chatState === 'active'}
    <div
      class="w-[360px] bg-white/50 backdrop-blur-xl border border-white/20
        shadow-[0_0_30px_rgba(255,255,255,0.15)] rounded-[25px]
        flex flex-col overflow-hidden animate-chat-in"
      style="max-height: calc(100vh - 200px);"
    >
      <!-- Chat header -->
      <div class="flex items-center justify-between px-5 pt-4 pb-2">
        <div class="flex items-center gap-2">
          <span class="text-sm font-semibold text-dtcc-dark">Lurkie</span>
          {#if $chatLoading}
            <span class="text-xs text-dtcc-muted animate-pulse">thinking...</span>
          {/if}
        </div>
        <div class="flex gap-1">
          <button
            class="p-1.5 rounded-md hover:bg-black/5 text-dtcc-muted transition-colors"
            title="New chat"
            onclick={handleNewChat}
          >
            <span class="w-4 h-4 block">{@html `<svg aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.992 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" /></svg>`}</span>
          </button>
          <button
            class="p-1.5 rounded-md hover:bg-black/5 text-dtcc-muted transition-colors"
            title="Close"
            onclick={collapse}
          >
            <span class="w-4 h-4 block">{@html Icons.close}</span>
          </button>
        </div>
      </div>

      <!-- Messages area -->
      <div bind:this={messagesContainer} class="flex-1 overflow-y-auto px-5 py-2 space-y-3 scrollbar-subtle" role="log" aria-live="polite">
        {#each $chatMessages as msg, i}
          {@const isStreaming = $chatLoading && i === $chatMessages.length - 1 && msg.role === 'assistant'}
          <div class="flex {msg.role === 'user' ? 'justify-end' : 'justify-start'}">
            <div class="max-w-[85%] rounded-xl px-3 py-2 text-sm
              {msg.role === 'user'
                ? 'opacity-50 text-dtcc-dark'
                : 'text-dtcc-dark'}">
              {#if isStreaming}
                <div class="whitespace-pre-wrap break-words">{msg.content}</div>
              {:else}
                <div class="chat-markdown break-words">{@html renderMarkdown(msg.content)}</div>
              {/if}
              {#if msg.toolCalls.length > 0}
                <div class="mt-1.5 pt-1.5 border-t border-black/10 space-y-0.5">
                  {#each msg.toolCalls as tc}
                    <div class="text-xs text-dtcc-muted flex items-center gap-1">
                      {#if tc.status === 'running'}
                        <span class="animate-spin inline-block w-3 h-3 border border-dtcc-muted border-t-transparent rounded-full"></span>
                      {:else}
                        <span class="w-3 h-3 inline-flex items-center justify-center">{@html Icons.check}</span>
                      {/if}
                      <span>{tc.name}</span>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        {/each}

        {#if $chatError}
          <div class="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{$chatError}</div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- State 1 (collapsed) / State 2 (expanded input bar) -->
  {#if chatState === 'collapsed'}
    <!-- Collapsed trigger capsule -->
    <button
      class="w-[75px] h-[49px] flex items-center justify-center
        bg-white/50 backdrop-blur-xl border border-white/20
        shadow-[0_0_30px_rgba(255,255,255,0.15)] rounded-[25px]
        hover:bg-black/5 transition-all duration-200 ease-out cursor-pointer"
      style={triggerFlash ? '--stroke-0: #E35A1D' : ''}
      onclick={handleTriggerClick}
      aria-label="Open Lurkie chat"
    >
      <span class="w-6 h-6 block text-dtcc-muted">{@html Icons.chat}</span>
    </button>
  {:else}
    <!-- Expanded input bar -->
    <div
      class="w-[360px] h-auto flex items-end gap-2
        bg-white/50 backdrop-blur-xl border border-white/20
        shadow-[0_0_30px_rgba(255,255,255,0.15)] rounded-[25px]
        px-4 py-[6px]
        animate-expand-in"
    >
      <textarea
        bind:this={inputEl}
        bind:value={inputText}
        onkeydown={handleKeydown}
        placeholder={hasMessages ? 'Reply...' : 'Ask Lurkie about data, tools, or workflows'}
        rows="1"
        class="flex-1 resize-none bg-transparent text-sm text-dtcc-dark
          placeholder:opacity-50 placeholder:text-dtcc-muted
          focus:outline-none py-2 leading-snug lurkie-textarea"
      ></textarea>
      <button
        onclick={handleSend}
        disabled={$chatLoading}
        class="w-9 h-9 shrink-0 flex items-center justify-center rounded-full
          transition-all duration-150 active:scale-95 mb-[2px]
          {inputText.trim()
            ? 'bg-dtcc-orange text-white cursor-pointer'
            : 'bg-black/5 text-dtcc-muted cursor-default'}"
        aria-label="Send message"
      >
        <span class="w-5 h-5 block">{@html Icons.sendArrow}</span>
      </button>
    </div>
  {/if}
</div>

<style>
  /* Auto-resize textarea using field-sizing (modern browsers) */
  .lurkie-textarea {
    field-sizing: content;
    min-height: 36px;
    max-height: 30vh;
  }

  /* Chat panel slide-in animation */
  @keyframes chat-in {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .animate-chat-in {
    animation: chat-in 200ms ease-out;
  }

  /* Input bar expand animation */
  @keyframes expand-in {
    from { opacity: 0; width: 75px; }
    to { opacity: 1; width: 360px; }
  }
  .animate-expand-in {
    animation: expand-in 200ms ease-out;
  }

  /* Scrollbar styling */
  .scrollbar-subtle::-webkit-scrollbar {
    width: 4px;
  }
  .scrollbar-subtle::-webkit-scrollbar-track {
    background: transparent;
  }
  .scrollbar-subtle::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.1);
    border-radius: 2px;
  }
  .scrollbar-subtle:hover::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.2);
  }

  /* Markdown rendering within chat bubbles */
  .chat-markdown :global(p) {
    margin: 0;
  }
  .chat-markdown :global(p + p) {
    margin-top: 0.5em;
  }
  .chat-markdown :global(strong) {
    font-weight: 600;
  }
  .chat-markdown :global(code) {
    font-size: 0.85em;
    background: rgba(0, 0, 0, 0.06);
    padding: 0.1em 0.35em;
    border-radius: 4px;
  }
  .chat-markdown :global(pre) {
    background: rgba(0, 0, 0, 0.06);
    padding: 0.5em 0.75em;
    border-radius: 6px;
    overflow-x: auto;
    margin: 0.4em 0;
  }
  .chat-markdown :global(pre code) {
    background: none;
    padding: 0;
  }
  .chat-markdown :global(ul), .chat-markdown :global(ol) {
    margin: 0.3em 0;
    padding-left: 1.4em;
  }
  .chat-markdown :global(a) {
    color: #E35A1D;
    text-decoration: underline;
  }
</style>
