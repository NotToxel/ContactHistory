<script lang="ts">
  import { contextMenuManager, closeContextMenu, type ContextMenuItem } from './context-menu.svelte';

  const menu = $derived(contextMenuManager.state);

  let menuEl = $state<HTMLElement | null>(null);
  let adjustedX = $state(0);
  let adjustedY = $state(0);

  $effect(() => {
    if (menu.isOpen) {
      adjustedX = menu.x;
      adjustedY = menu.y;

      // Position boundary adjustments to keep menu in viewport
      setTimeout(() => {
        if (!menuEl) return;
        const rect = menuEl.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        if (menu.x + rect.width > vw - 12) {
          adjustedX = Math.max(12, vw - rect.width - 12);
        }
        if (menu.y + rect.height > vh - 12) {
          adjustedY = Math.max(12, vh - rect.height - 12);
        }
      }, 0);
    }
  });

  function handleItemClick(item: ContextMenuItem) {
    if (item.disabled) return;
    closeContextMenu();
    item.action?.();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      closeContextMenu();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} onclick={closeContextMenu} />

{#if menu.isOpen}
  <!-- Backdrop -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="custom-context-menu-backdrop" onclick={closeContextMenu}></div>

  <!-- Menu popover -->
  <div
    bind:this={menuEl}
    class="custom-context-menu"
    style="left: {adjustedX}px; top: {adjustedY}px;"
    role="menu"
    tabindex="-1"
  >
    {#if menu.header}
      <div class="context-menu-header">
        <span class="context-menu-title">{menu.header}</span>
        {#if menu.subHeader}
          <span class="context-menu-subtitle">{menu.subHeader}</span>
        {/if}
      </div>
      <div class="context-menu-divider"></div>
    {/if}

    <div class="context-menu-items">
      {#each menu.items as item (item.id || item.label)}
        {#if item.divider}
          <div class="context-menu-divider"></div>
        {/if}
        <button
          type="button"
          class="context-menu-item"
          class:disabled={item.disabled}
          class:danger={item.danger}
          disabled={item.disabled}
          onclick={(e) => {
            e.stopPropagation();
            handleItemClick(item);
          }}
          role="menuitem"
        >
          {#if item.icon}
            <span class="material-symbols-outlined context-menu-icon">{item.icon}</span>
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
