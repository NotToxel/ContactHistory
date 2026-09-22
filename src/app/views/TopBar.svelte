<script lang="ts">
  import brandLogo from '../../assets/contact-history.png';

  import type { AppModel } from '../model.svelte';
  let { app }: { app: AppModel } = $props();
</script>

<!-- Native title-bar dragging intentionally handles mouse input on the header. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<header class="topbar" onmousedown={app.onTopbarMouseDown}>
  <div class="topbar-left" data-tauri-drag-region>
    <button
      class="icon-btn"
      aria-label="Back"
      title="Back (Alt+Left)"
      disabled={app.navigationIndex === 0}
      onclick={app.goBack}
    >
      <span class="material-symbols-outlined">arrow_back</span>
    </button>
    <button
      class="icon-btn"
      aria-label="Forward"
      title="Forward (Alt+Right)"
      disabled={app.navigationIndex >= app.navigationMaxIndex}
      onclick={app.goForward}
    >
      <span class="material-symbols-outlined">arrow_forward</span>
    </button>
    {#if app.hasData && app.pageView !== 'onboarding'}
      <button
        class="icon-btn"
        data-tooltip="Main menu"
        data-tooltip-pos="bottom-left"
        aria-label="Main menu"
        onclick={() => (app.sidebarCollapsed = !app.sidebarCollapsed)}
      >
        <span class="material-symbols-outlined">menu</span>
      </button>
    {/if}
    <button
      class="app-brand"
      aria-label="Contact History home"
      data-tooltip="Contact History home"
      style="background: none; border: none; padding: 0; text-align: left;"
      onclick={() => {
        if (app.hasData) {
          app.selectLabelFilter(null);
          app.navigate('contacts');
        }
      }}
    >
      <img class="brand-logo" src={brandLogo} alt="" />
      <span class="app-title">Contact History</span>
    </button>
  </div>

  <!-- Draggable area around search with ample space -->
  <div class="topbar-drag-area" data-tauri-drag-region>
    <div class="topbar-drag-spacer" data-tauri-drag-region></div>
    {#if app.hasData && app.pageView !== 'onboarding'}
      <div
        class="topbar-search-container {app.searchDropdownOpen && app.search.trim()
          ? 'has-dropdown'
          : ''}"
        data-tauri-drag-region="false"
      >
        <div
          class="topbar-search {app.searchDropdownOpen && app.search.trim() ? 'dropdown-open' : ''}"
        >
          <span class="material-symbols-outlined search-icon">search</span>
          <input
            type="text"
            class="search-input"
            placeholder="Search contacts"
            aria-label="Search contacts"
            bind:this={app.searchInputEl}
            bind:value={app.search}
            oninput={app.onSearchInput}
            onfocus={app.onSearchFocus}
            onclick={app.onSearchFocus}
            onkeydown={app.onSearchKeyDown}
          />
          {#if app.search}
            <button
              class="search-clear-btn"
              aria-label="Clear search"
              data-tooltip="Clear search"
              onclick={app.clearSearch}
            >
              <span class="material-symbols-outlined">close</span>
            </button>
          {/if}
        </div>

        {#if app.searchDropdownOpen && app.search.trim()}
          <div
            class="search-dropdown-menu"
            bind:this={app.searchDropdownEl}
            role="listbox"
            data-tauri-drag-region="false"
          >
            {#if app.searchResults.length > 0}
              {#each app.searchResults as contact, idx (contact.resource_name)}
                <button
                  type="button"
                  class="search-result-item {idx === app.searchActiveIndex ? 'active' : ''}"
                  role="option"
                  aria-selected={idx === app.searchActiveIndex}
                  onclick={() => app.selectSearchResult(contact)}
                  onmouseenter={() => (app.searchActiveIndex = idx)}
                  data-tauri-drag-region="false"
                  data-contact-res={contact.resource_name}
                >
                  <div
                    class="search-avatar-circle"
                    style="background-color: {app.getAvatarColor(app.getDisplayName(contact))};"
                  >
                    {#if app.getAvatarSource(contact)}
                      <img
                        src={app.getAvatarSource(contact)}
                        alt={app.getDisplayName(contact)}
                        class="search-avatar-img"
                        loading="lazy"
                        referrerpolicy="no-referrer"
                        onerror={(e) => {
                          (e.currentTarget as HTMLElement).classList.add('avatar-img-failed');
                        }}
                      />
                    {/if}
                    <span class="search-avatar-text"
                      >{app.getAvatarInitial(app.getDisplayName(contact))}</span
                    >
                  </div>
                  <div class="search-result-info">
                    <span class="search-result-name">{app.getDisplayName(contact)}</span>
                    {#if app.getPrimaryEmail(contact.payload)}
                      <span class="search-result-sep">&mdash;</span>
                      <span class="search-result-email">{app.getPrimaryEmail(contact.payload)}</span
                      >
                    {:else if app.getPrimaryPhone(contact.payload)}
                      <span class="search-result-sep">&mdash;</span>
                      <span class="search-result-phone">{app.getPrimaryPhone(contact.payload)}</span
                      >
                    {/if}
                  </div>
                </button>
              {/each}
            {:else}
              <div class="search-empty-state">
                <span class="material-symbols-outlined search-empty-icon">search_off</span>
                <span>No contacts matching "{app.search.trim()}"</span>
              </div>
            {/if}
            <div class="search-dropdown-footer">
              <span
                >Use <kbd>&uarr;</kbd> <kbd>&darr;</kbd> to navigate, <kbd>&crarr;</kbd> to select,
                <kbd>Esc</kbd> to dismiss</span
              >
            </div>
          </div>
        {/if}
      </div>
    {/if}
    <div class="topbar-drag-spacer" data-tauri-drag-region></div>
  </div>

  <!-- Topbar Actions & Window Controls -->
  <div class="topbar-right">
    {#if app.captures.length > 0 && app.capture}
      <div class="snapshot-dropdown-container">
        <button
          class="snapshot-chip"
          class:active={app.showSnapshotDropdown}
          onclick={() => {
            app.showSnapshotDropdown = !app.showSnapshotDropdown;
            app.showAccountMenu = false;
          }}
          data-tooltip="Snapshot timeline"
          aria-haspopup="true"
          aria-expanded={app.showSnapshotDropdown}
        >
          <span class="material-symbols-outlined">history</span>
          <span>Snapshot #{app.capture.sequence}</span>
          <span class="material-symbols-outlined" style="font-size: 16px;">
            {app.showSnapshotDropdown ? 'arrow_drop_up' : 'arrow_drop_down'}
          </span>
        </button>

        {#if app.showSnapshotDropdown}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="menu-scrim"
            style="position: fixed; inset: 0; z-index: 101; background: transparent;"
            onclick={() => (app.showSnapshotDropdown = false)}
            role="presentation"
          ></div>
          <div class="popover snapshot-popover" role="group" aria-label="Archive snapshots">
            <div class="popover-heading">
              <span>Archive snapshots</span>
              <span class="popover-count-tag">{app.captures.length} total</span>
            </div>
            <div class="snapshot-popover-list">
              {#each app.captures as cap}
                <div class="snapshot-popover-row">
                  <button
                    type="button"
                    class="snapshot-popover-item"
                    class:selected={app.capture?.sequence === cap.sequence}
                    data-snapshot-seq={cap.sequence}
                    onclick={() => {
                      app.changeCapture(cap.sequence);
                      app.showSnapshotDropdown = false;
                    }}
                    aria-pressed={app.capture?.sequence === cap.sequence}
                  >
                    <div class="snapshot-item-left">
                      <div class="snapshot-item-title">Snapshot #{cap.sequence}</div>
                      <div class="snapshot-item-date">
                        {app.formatCaptureTime(cap.committed_at)}
                      </div>
                    </div>
                    <div class="snapshot-item-right">
                      <span class="snapshot-item-badge">{cap.contact_count} contacts</span>
                      {#if app.capture?.sequence === cap.sequence}
                        <span class="material-symbols-outlined snapshot-active-check">check</span>
                      {/if}
                    </div>
                  </button>
                  <button
                    class="snapshot-delete-btn"
                    aria-label={`Delete Snapshot #${cap.sequence}`}
                    title={`Delete Snapshot #${cap.sequence}`}
                    disabled={app.busy || app.archiveActionBusy}
                    onclick={() => {
                      app.error = '';
                      app.deleteSnapshotTarget = cap;
                      app.showSnapshotDropdown = false;
                    }}><span class="material-symbols-outlined">delete</span></button
                  >
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {/if}

    <button
      class="icon-btn"
      onclick={() => (app.showSettingsModal = true)}
      data-tooltip="Settings"
      aria-label="Settings"
    >
      <span class="material-symbols-outlined">settings</span>
    </button>

    {#if app.selected}
      <button
        class="account-avatar-btn"
        aria-expanded={app.showAccountMenu}
        aria-haspopup="true"
        data-tooltip={app.accountProfile?.name
          ? `${app.accountProfile.name} (${app.selected.email})`
          : app.selected.email}
        aria-label={app.accountProfile?.name
          ? `${app.accountProfile.name} (${app.selected.email})`
          : app.selected.email}
        onclick={() => {
          app.showAccountMenu = !app.showAccountMenu;
          app.showSnapshotDropdown = false;
        }}
      >
        {#if app.accountProfile?.picture}
          <img
            src={app.accountProfile.picture}
            alt={app.accountProfile.name || app.selected.email}
            class="topbar-avatar-img"
            referrerpolicy="no-referrer"
            onerror={(e) => {
              (e.currentTarget as HTMLElement).style.display = 'none';
            }}
          />
        {/if}
        <span>{app.getInitials(app.accountProfile?.name || app.selected.email)}</span>
      </button>
    {/if}

    <div class="topbar-drag-spacer-sm" data-tauri-drag-region></div>

    <!-- Windows Controls -->
    <div class="window-controls">
      <button
        class="win-btn"
        onclick={app.winMinimize}
        data-tooltip="Minimize"
        aria-label="Minimize"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10" /></svg>
      </button>
      <button
        class="win-btn"
        onclick={app.winToggleMaximize}
        data-tooltip={app.isMaximized ? 'Restore' : 'Maximize'}
        aria-label={app.isMaximized ? 'Restore' : 'Maximize'}
      >
        {#if app.isMaximized}
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3h8v8h-2M3 5h8v8H3z" /></svg>
        {:else}
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3h10v10H3z" /></svg>
        {/if}
      </button>
      <button
        class="win-btn win-close"
        onclick={app.winClose}
        data-tooltip="Close"
        aria-label="Close"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9m0-9l-9 9" /></svg>
      </button>
    </div>
  </div>
</header>
