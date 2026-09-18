<script lang="ts">
  import { tick, onMount, onDestroy } from 'svelte';
  import { contextMenuManager, closeContextMenu, type ContextMenuItem } from './context-menu.svelte';

  const menu = $derived(contextMenuManager.state);

  let menuEl = $state<HTMLElement | null>(null);
  let adjustedX = $state(0);
  let adjustedY = $state(0);
  let focusedIndex = $state(-1);

  $effect(() => {
    if (menu.isOpen) {
      focusedIndex = -1;
      const pad = 10;
      const estWidth = 240;
      const estHeight = Math.min(420, (menu.items.length * 36) + (menu.header ? 55 : 12));

      let x = menu.x;
      let y = menu.y;

      if (x + estWidth > window.innerWidth - pad) {
        x = Math.max(pad, window.innerWidth - estWidth - pad);
      }
      if (y + estHeight > window.innerHeight - pad) {
        y = Math.max(pad, window.innerHeight - estHeight - pad);
      }

      adjustedX = x;
      adjustedY = y;

      // Refine with actual element bounding box once rendered
      tick().then(() => {
        if (!menuEl) return;
        const rect = menuEl.getBoundingClientRect();
        let rx = menu.x;
        let ry = menu.y;

        if (rx + rect.width > window.innerWidth - pad) {
          rx = Math.max(pad, window.innerWidth - rect.width - pad);
        }
        if (ry + rect.height > window.innerHeight - pad) {
          ry = Math.max(pad, window.innerHeight - rect.height - pad);
        }

        adjustedX = rx;
        adjustedY = ry;
      });
    }
  });

  function handleItemClick(item: ContextMenuItem) {
    if (item.disabled) return;
    closeContextMenu();
    try {
      item.action?.();
    } catch (err) {
      console.error('Context menu action failed:', err);
    }
  }

  function handleGlobalPointerDown(e: PointerEvent) {
    if (!menu.isOpen) return;
    // If click is outside the context menu, close it
    if (menuEl && !menuEl.contains(e.target as Node)) {
      closeContextMenu();
    }
  }

  function handleGlobalKeyDown(e: KeyboardEvent) {
    if (!menu.isOpen) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      closeContextMenu();
      return;
    }

    const enabledItems = menu.items
      .map((item, idx) => (!item.disabled ? idx : -1))
      .filter((idx) => idx !== -1);

    if (enabledItems.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const currentPos = enabledItems.indexOf(focusedIndex);
      const nextPos = (currentPos + 1) % enabledItems.length;
      focusedIndex = enabledItems[nextPos];
      focusItem(focusedIndex);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const currentPos = enabledItems.indexOf(focusedIndex);
      const prevPos = (currentPos - 1 + enabledItems.length) % enabledItems.length;
      focusedIndex = enabledItems[prevPos];
      focusItem(focusedIndex);
    } else if (e.key === 'Enter' || e.key === ' ') {
      if (focusedIndex >= 0 && focusedIndex < menu.items.length) {
        e.preventDefault();
        handleItemClick(menu.items[focusedIndex]);
      }
    }
  }

  function focusItem(idx: number) {
    if (!menuEl) return;
    const items = menuEl.querySelectorAll<HTMLButtonElement>('.context-menu-item');
    if (items[idx]) {
      items[idx].focus();
    }
  }

  function handleWindowBlur() {
    if (menu.isOpen) closeContextMenu();
  }

  function handleWindowScroll() {
    if (menu.isOpen) closeContextMenu();
  }

  onMount(() => {
    window.addEventListener('pointerdown', handleGlobalPointerDown, true);
    window.addEventListener('keydown', handleGlobalKeyDown, true);
    window.addEventListener('scroll', handleWindowScroll, true);
    window.addEventListener('resize', handleWindowScroll, true);
    window.addEventListener('blur', handleWindowBlur);
  });

  onDestroy(() => {
    window.removeEventListener('pointerdown', handleGlobalPointerDown, true);
    window.removeEventListener('keydown', handleGlobalKeyDown, true);
    window.removeEventListener('scroll', handleWindowScroll, true);
    window.removeEventListener('resize', handleWindowScroll, true);
    window.removeEventListener('blur', handleWindowBlur);
  });
</script>

{#if menu.isOpen}
  <div
    bind:this={menuEl}
    class="custom-context-menu"
    style="left: {adjustedX}px; top: {adjustedY}px;"
    role="menu"
    tabindex="-1"
    aria-orientation="vertical"
    oncontextmenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
  >
    {#if menu.header}
      <div class="context-menu-header">
        <div class="context-menu-title" title={menu.header}>{menu.header}</div>
        {#if menu.subHeader}
          <div class="context-menu-subtitle" title={menu.subHeader}>{menu.subHeader}</div>
        {/if}
      </div>
      <div class="context-menu-divider"></div>
    {/if}

    <div class="context-menu-items">
      {#each menu.items as item, idx (item.id || item.label + '_' + idx)}
        {#if item.divider && idx > 0}
          <div class="context-menu-divider" role="separator"></div>
        {/if}
        <button
          type="button"
          class="context-menu-item"
          class:disabled={item.disabled}
          class:danger={item.danger}
          class:focused={idx === focusedIndex}
          disabled={item.disabled}
          onclick={(e) => {
            e.stopPropagation();
            handleItemClick(item);
          }}
          onmouseenter={() => {
            if (!item.disabled) focusedIndex = idx;
          }}
          role="menuitem"
          tabindex={item.disabled ? -1 : 0}
        >
          {#if item.icon}
            <span class="material-symbols-outlined context-menu-icon" aria-hidden="true">{item.icon}</span>
          {:else}
            <span class="context-menu-icon-placeholder" aria-hidden="true"></span>
          {/if}
          <span class="context-menu-label">{item.label}</span>
          {#if item.shortcut}
            <span class="context-menu-shortcut">{item.shortcut}</span>
          {/if}
        </button>
      {/each}
    </div>
  </div>
{/if}

<style>
  .custom-context-menu {
    position: fixed !important;
    z-index: 99999 !important;
    min-width: 220px;
    max-width: 320px;
    background-color: var(--surface-base, #ffffff);
    color: var(--google-text, #202124);
    border: 1px solid var(--google-border, #dadce0);
    border-radius: 12px;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.18), 0 2px 6px rgba(0, 0, 0, 0.08);
    padding: 6px 0;
    user-select: none;
    outline: none;
    font-family: var(--font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
    animation: contextMenuPopIn 0.12s cubic-bezier(0.16, 1, 0.3, 1);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }

  @keyframes contextMenuPopIn {
    from {
      opacity: 0;
      transform: scale(0.92) translateY(-4px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  .context-menu-header {
    padding: 8px 16px 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .context-menu-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--google-text, #202124);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .context-menu-subtitle {
    font-size: 11px;
    color: var(--google-text-secondary, #5f6368);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .context-menu-items {
    display: flex;
    flex-direction: column;
  }

  .context-menu-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    margin: 1px 6px;
    width: calc(100% - 12px);
    border: none;
    border-radius: 8px;
    background: transparent;
    cursor: pointer;
    text-align: left;
    font-size: 13px;
    color: var(--google-text, #202124);
    transition: background-color 0.1s ease, color 0.1s ease;
    outline: none;
    font-family: inherit;
  }

  .context-menu-item:hover:not(:disabled),
  .context-menu-item.focused:not(:disabled) {
    background-color: var(--google-surface-hover, #f1f3f4);
  }

  .context-menu-item:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .context-menu-item.danger {
    color: var(--google-danger, #b3261e);
  }

  .context-menu-item.danger .context-menu-icon {
    color: var(--google-danger, #b3261e);
  }

  .context-menu-icon {
    font-size: 19px;
    line-height: 1;
    color: var(--google-text-secondary, #5f6368);
    flex-shrink: 0;
  }

  .context-menu-icon-placeholder {
    width: 19px;
    flex-shrink: 0;
  }

  .context-menu-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .context-menu-shortcut {
    font-size: 11px;
    color: var(--google-text-secondary, #5f6368);
    font-weight: 500;
    letter-spacing: 0.2px;
    margin-left: 14px;
    flex-shrink: 0;
    opacity: 0.85;
  }

  .context-menu-divider {
    height: 1px;
    background: var(--google-border-subtle, #f1f3f4);
    margin: 4px 0;
  }

  :global(:root[data-theme="dark"]) .custom-context-menu {
    background-color: var(--surface-base, #1e1e1e);
    color: var(--google-text, #e8eaed);
    border-color: var(--google-border, #3c4043);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.55), 0 2px 6px rgba(0, 0, 0, 0.25);
  }

  :global(:root[data-theme="dark"]) .context-menu-item:hover:not(:disabled),
  :global(:root[data-theme="dark"]) .context-menu-item.focused:not(:disabled) {
    background-color: var(--google-surface-hover, #2d2e30);
  }

  :global(:root[data-theme="dark"]) .context-menu-divider {
    background: var(--google-border-subtle, #2d2e30);
  }
</style>
