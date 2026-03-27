<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte'
  import { Icons } from '../ui/icons'
  import { chatMessages, chatLoading, chatError, addUserMessage, clearChat } from '../stores/chat-store'
  import { chatService } from '../services/chat-service'
  import { activePanel } from '../stores/ui'
  import type { ChatMessage } from '../stores/chat-store'

  let inputText = $state('')
  let messagesContainer: HTMLDivElement
  let inputEl: HTMLTextAreaElement

  function scrollToBottom() {
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight
    }
  }

  $effect(() => {
    if ($chatMessages.length > 0) {
      tick().then(scrollToBottom)
    }
  })

  function handleSend() {
    const text = inputText.trim()
    if (!text || $chatLoading) return

    addUserMessage(text)
    chatService.sendMessage(text)
    inputText = ''

    tick().then(() => {
      if (inputEl) inputEl.focus()
    })
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleNewChat() {
    clearChat()
    chatService.newChat()
  }

  onMount(() => {
    chatService.connect()
  })

  onDestroy(() => {
    chatService.disconnect()
  })
</script>

<div class="flex flex-col h-full overflow-hidden">
  <!-- Header -->
  <div class="flex items-center justify-between px-4 py-3 border-b border-black/5">
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
        onclick={() => activePanel.set(null)}
      >
        <span class="w-4 h-4 block">{@html Icons.close}</span>
      </button>
    </div>
  </div>

  <!-- Messages -->
  <div bind:this={messagesContainer} class="flex-1 overflow-y-auto px-4 py-3 space-y-3">
    {#if $chatMessages.length === 0}
      <div class="text-center text-dtcc-muted py-8">
        <p class="text-sm font-medium text-dtcc-dark mb-1">Ask about your data</p>
        <p class="text-xs">Try: "Run a heat simulation on this area"</p>
      </div>
    {/if}

    {#each $chatMessages as msg}
      <div class="flex {msg.role === 'user' ? 'justify-end' : 'justify-start'}">
        <div class="max-w-[85%] rounded-lg px-3 py-2 text-sm
          {msg.role === 'user'
            ? 'bg-dtcc-orange/10 text-dtcc-dark'
            : 'bg-black/5 text-dtcc-dark'}">
          <div class="whitespace-pre-wrap break-words">{msg.content}</div>
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

  <!-- Input -->
  <div class="border-t border-black/5 px-4 py-3">
    <div class="flex gap-2">
      <textarea
        bind:this={inputEl}
        bind:value={inputText}
        onkeydown={handleKeydown}
        placeholder="Ask about datasets, simulations..."
        rows="1"
        class="flex-1 resize-none rounded-lg border border-black/10 bg-white px-3 py-2 text-sm
          placeholder:text-dtcc-muted focus:outline-none focus:ring-1 focus:ring-dtcc-orange/50"
      ></textarea>
      <button
        onclick={handleSend}
        disabled={!inputText.trim() || $chatLoading}
        class="px-3 py-2 rounded-lg bg-dtcc-orange text-white text-sm font-medium
          hover:bg-dtcc-orange-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >Send</button>
    </div>
  </div>
</div>
