<script lang="ts">
  import { onMount, tick } from 'svelte';

  export interface SelectOption {
    value: string | number;
    label: string;
    sublabel?: string;
    icon?: string;
  }

  let {
    value = $bindable(),
    options = [],
    placeholder = 'Select an option',
    disabled = false,
    searchable = false,
    searchPlaceholder = 'Search...',
    id = '',
    ariaLabel = '',
    maxWidth = '',
    onchange,
  }: {
    value?: string | number;
    options: SelectOption[];
    placeholder?: string;
    disabled?: boolean;
    searchable?: boolean;
    searchPlaceholder?: string;
    id?: string;
    ariaLabel?: string;
    maxWidth?: string;
    onchange?: (val: any) => void;
  } = $props();

  let open = $state(false);
  let searchQuery = $state('');
  let highlightedIndex = $state(0);
  let rootEl: HTMLDivElement | null = $state(null);
  let searchInputEl: HTMLInputElement | null = $state(null);
  let listboxEl: HTMLDivElement | null = $state(null);
  let menuStyle = $state('');

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy: () => node.remove() };
  }

  function positionMenu() {
    if (!open || !rootEl) return;
    const rect = rootEl.getBoundingClientRect();
    const gap = 4;
    const edge = 8;
    const below = window.innerHeight - rect.bottom - gap - edge;
    const above = rect.top - gap - edge;
    const height = Math.max(0, Math.min(280, Math.max(below, above)));
    const width = Math.min(rect.width, window.innerWidth - edge * 2);
    const left = Math.max(edge, Math.min(rect.left, window.innerWidth - width - edge));
    menuStyle = below >= Math.min(280, above)
      ? `left: ${left}px; top: ${rect.bottom + gap}px; width: ${width}px; max-height: ${height}px;`
      : `left: ${left}px; bottom: ${window.innerHeight - rect.top + gap}px; width: ${width}px; max-height: ${height}px;`;
  }

  onMount(() => {
    window.addEventListener('scroll', positionMenu, true);
    return () => window.removeEventListener('scroll', positionMenu, true);
  });

  const selectedOption = $derived(options.find((o) => o.value === value));

  const filteredOptions = $derived.by(() => {
    if (!searchable || !searchQuery.trim()) return options;
    const query = searchQuery.trim().toLowerCase();
    return options.filter((o) =>
      o.label.toLowerCase().includes(query) ||
      (o.sublabel && o.sublabel.toLowerCase().includes(query)) ||
      String(o.value).toLowerCase().includes(query)
    );
  });

  async function toggle() {
    if (disabled) return;
    open = !open;
    if (open) {
      searchQuery = '';
      const currentIdx = filteredOptions.findIndex((o) => o.value === value);
      highlightedIndex = currentIdx >= 0 ? currentIdx : 0;
      await tick();
      positionMenu();
      if (searchable && searchInputEl) {
        searchInputEl.focus();
      } else {
        listboxEl?.focus();
      }
      scrollHighlightedIntoView();
    }
  }

  function close() {
    open = false;
    searchQuery = '';
  }

  function selectOption(opt: SelectOption) {
    value = opt.value;
    onchange?.(opt.value);
    close();
    rootEl?.querySelector<HTMLButtonElement>('.custom-select-trigger')?.focus();
  }

  function scrollHighlightedIntoView() {
    if (!listboxEl) return;
    const items = listboxEl.querySelectorAll<HTMLElement>('.custom-select-item');
    const target = items[highlightedIndex];
    if (target) {
      target.scrollIntoView({ block: 'nearest' });
    }
  }

  function handleTriggerKeydown(event: KeyboardEvent) {
    if (disabled) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggle();
    }
  }

  function handleListKeydown(event: KeyboardEvent) {
    if (!open) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      rootEl?.querySelector<HTMLButtonElement>('.custom-select-trigger')?.focus();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (filteredOptions.length > 0) {
        highlightedIndex = (highlightedIndex + 1) % filteredOptions.length;
        scrollHighlightedIntoView();
      }
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (filteredOptions.length > 0) {
        highlightedIndex = (highlightedIndex - 1 + filteredOptions.length) % filteredOptions.length;
        scrollHighlightedIntoView();
      }
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      if (filteredOptions[highlightedIndex]) {
        selectOption(filteredOptions[highlightedIndex]);
      }
      return;
    }

    if (event.key === 'Tab') {
      close();
    }
  }
</script>

<svelte:window
  onresize={positionMenu}
  onclick={(e) => {
    if (open && rootEl && !rootEl.contains(e.target as Node) && !listboxEl?.contains(e.target as Node)) {
      close();
    }
  }}
/>

<div class="custom-select" bind:this={rootEl} class:disabled class:open style={maxWidth ? `max-width: ${maxWidth};` : undefined}>
  <button
    type="button"
    class="custom-select-trigger"
    {id}
    aria-label={ariaLabel || placeholder}
    aria-expanded={open}
    aria-haspopup="listbox"
    {disabled}
    onclick={toggle}
    onkeydown={handleTriggerKeydown}
  >
    <span class="custom-select-value">
      {#if selectedOption?.icon}
        <span class="material-symbols-outlined option-icon">{selectedOption.icon}</span>
      {/if}
      <span class="custom-select-label">{selectedOption ? selectedOption.label : placeholder}</span>
      {#if selectedOption?.sublabel}
        <span class="custom-select-sublabel">{selectedOption.sublabel}</span>
      {/if}
    </span>
    <span class="material-symbols-outlined chevron-icon" aria-hidden="true">
      {open ? 'expand_less' : 'expand_more'}
    </span>
  </button>

  {#if open}
    <div
      class="custom-select-menu"
      use:portal
      style={menuStyle}
      role="listbox"
      tabindex="-1"
      bind:this={listboxEl}
      onkeydown={handleListKeydown}
      aria-label={ariaLabel || placeholder}
    >
      {#if searchable}
        <div class="search-box">
          <span class="material-symbols-outlined search-icon">search</span>
          <input
            type="text"
            class="search-input-field"
            bind:this={searchInputEl}
            bind:value={searchQuery}
            placeholder={searchPlaceholder}
            onkeydown={handleListKeydown}
            oninput={() => { highlightedIndex = 0; }}
          />
          {#if searchQuery}
            <button
              type="button"
              class="clear-search-btn"
              onclick={() => { searchQuery = ''; searchInputEl?.focus(); }}
              aria-label="Clear search"
            >
              <span class="material-symbols-outlined">close</span>
            </button>
          {/if}
        </div>
      {/if}

      <div class="options-container">
        {#if filteredOptions.length === 0}
          <div class="no-options">No options match</div>
        {:else}
          {#each filteredOptions as option, index}
            {@const isSelected = option.value === value}
            {@const isHighlighted = index === highlightedIndex}
            <button
              type="button"
              class="custom-select-item"
              class:selected={isSelected}
              class:highlighted={isHighlighted}
              role="option"
              aria-selected={isSelected}
              onclick={() => selectOption(option)}
              onmouseenter={() => { highlightedIndex = index; }}
            >
              <span class="item-content">
                {#if option.icon}
                  <span class="material-symbols-outlined item-icon">{option.icon}</span>
                {/if}
                <span class="item-label">{option.label}</span>
                {#if option.sublabel}
                  <span class="item-sublabel">{option.sublabel}</span>
                {/if}
              </span>
              {#if isSelected}
                <span class="material-symbols-outlined check-icon">check</span>
              {/if}
            </button>
          {/each}
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .custom-select {
    position: relative;
    display: inline-block;
    width: 100%;
    min-width: 240px;
    max-width: 360px;
    font-family: inherit;
    font-size: 14px;
    user-select: none;
    -webkit-user-select: none;
  }

  .custom-select.disabled {
    opacity: 0.55;
    pointer-events: none;
  }

  .custom-select-trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    min-height: 38px;
    padding: 7px 12px;
    background-color: var(--surface-base);
    color: var(--google-text);
    border: 1px solid var(--google-border);
    border-radius: 8px;
    cursor: pointer;
    font-family: inherit;
    font-size: 14px;
    text-align: left;
    transition: border-color 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease;
    box-sizing: border-box;
  }

  .custom-select-trigger:hover:not(:disabled) {
    background-color: var(--google-surface-hover);
    border-color: var(--control-border);
  }

  .custom-select.open .custom-select-trigger,
  .custom-select-trigger:focus-visible {
    outline: none;
    border-color: var(--google-blue);
    box-shadow: 0 0 0 2px var(--google-blue-surface);
  }

  .custom-select-value {
    display: flex;
    align-items: center;
    gap: 8px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    min-width: 0;
    flex: 1;
  }

  .custom-select-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .custom-select-sublabel {
    color: var(--google-text-secondary);
    font-size: 13px;
    margin-left: 4px;
    flex-shrink: 0;
  }

  .chevron-icon {
    font-size: 20px;
    color: var(--google-text-secondary);
    flex-shrink: 0;
    margin-left: 8px;
    transition: transform 0.15s ease;
  }

  .option-icon, .item-icon {
    font-size: 18px;
    color: var(--google-text-secondary);
    flex-shrink: 0;
  }

  .custom-select-menu {
    position: fixed;
    z-index: 1200;
    background-color: var(--surface-base);
    border: 1px solid var(--google-border);
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    animation: popover-slide 0.15s ease-out;
  }

  @keyframes popover-slide {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .search-box {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--google-border);
    background-color: var(--google-surface);
    transition: background-color 0.15s ease, border-color 0.15s ease;
  }

  .search-box:focus-within {
    background-color: var(--surface-base);
    border-bottom-color: var(--google-blue);
  }

  .search-icon {
    font-size: 18px;
    color: var(--google-text-secondary);
  }

  .search-box:focus-within .search-icon {
    color: var(--google-blue);
  }

  .search-input-field,
  .search-input-field:focus,
  .search-input-field:focus-visible {
    flex: 1;
    border: none !important;
    background: transparent !important;
    color: var(--google-text);
    font-family: inherit;
    font-size: 13px;
    outline: none !important;
    box-shadow: none !important;
    -webkit-appearance: none;
    appearance: none;
    padding: 2px 0;
  }

  .clear-search-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: var(--google-text-secondary);
    cursor: pointer;
    padding: 2px;
    border-radius: 4px;
  }

  .clear-search-btn .material-symbols-outlined {
    font-size: 16px;
  }

  .options-container {
    overflow-y: auto;
    padding: 4px;
    max-height: 240px;
  }

  .custom-select-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 8px 10px;
    border: none;
    background: transparent;
    color: var(--google-text);
    border-radius: 6px;
    font-family: inherit;
    font-size: 13px;
    text-align: left;
    cursor: pointer;
    transition: background-color 0.1s ease;
    box-sizing: border-box;
  }

  .custom-select-item:hover,
  .custom-select-item.highlighted {
    background-color: var(--google-surface-hover);
  }

  .custom-select-item.selected {
    background-color: var(--google-blue-surface);
    color: var(--google-blue);
    font-weight: 500;
  }

  .item-content {
    display: flex;
    align-items: center;
    gap: 8px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .item-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .item-sublabel {
    color: var(--google-text-secondary);
    font-size: 12px;
  }

  .custom-select-item.selected .item-sublabel {
    color: var(--google-blue);
    opacity: 0.85;
  }

  .check-icon {
    font-size: 18px;
    color: var(--google-blue);
    flex-shrink: 0;
    margin-left: 8px;
  }

  .no-options {
    padding: 12px 10px;
    font-size: 13px;
    color: var(--google-text-secondary);
    text-align: center;
  }

  /* Dark mode specific enhancements */
  :root[data-theme="dark"] .custom-select-trigger {
    background-color: #20262f;
    border-color: #3b4654;
  }

  :root[data-theme="dark"] .custom-select-trigger:hover:not(:disabled) {
    background-color: #28303c;
    border-color: #505e70;
  }

  :root[data-theme="dark"] .custom-select-menu {
    background-color: #20262f;
    border-color: #3b4654;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
  }

  :root[data-theme="dark"] .search-box {
    background-color: #171b21;
    border-bottom-color: #303b49;
  }

  :root[data-theme="dark"] .custom-select-item:hover,
  :root[data-theme="dark"] .custom-select-item.highlighted {
    background-color: #29323e;
  }

  :root[data-theme="dark"] .custom-select-item.selected {
    background-color: #243951;
    color: var(--google-blue);
  }
</style>
