<script lang="ts">
  import MissingFieldsFilter from '../../lib/MissingFieldsFilter.svelte';

  import type { AppModel } from '../model.svelte';
  let { app }: { app: AppModel } = $props();
</script>

<aside
  class="sidebar"
  class:collapsed={app.sidebarCollapsed}
  class:is-resizing={app.isResizingSidebar}
  style="--sidebar-width: {app.sidebarWidth}px;"
>
  <!-- Create / Capture Button -->
  <div class="create-btn-container">
    <button
      class="capture-btn"
      class:busy={app.busy}
      onclick={app.captureNow}
      disabled={app.busy || !app.selected}
      data-tooltip={app.busy ? 'Capturing snapshot...' : 'Capture snapshot from Google Contacts'}
    >
      <span class="material-symbols-outlined capture-icon" class:spin={app.busy}>
        {app.busy ? 'sync' : 'photo_camera'}
      </span>
      <span>{app.busy ? 'Capturing...' : 'Capture now'}</span>
    </button>
  </div>

  <!-- Main Navigation Items -->
  <div class="sidebar-section">
    <button
      class="nav-item"
      class:active={app.pageView === 'contacts' && app.selectedGroups.length === 0 && !app.detail}
      onclick={() => {
        app.clearLabelFilter();
        app.navigate('contacts');
      }}
    >
      <span class="material-symbols-outlined nav-icon icon-filled">person</span>
      <span class="nav-label">Contacts</span>
      {#if app.capture}
        <span class="nav-count">{app.capture.contact_count}</span>
      {/if}
    </button>

    <button
      class="nav-item"
      class:active={app.pageView === 'changes'}
      onclick={() => app.navigate('changes')}
    >
      <span class="material-symbols-outlined nav-icon">history</span>
      <span class="nav-label">Changes</span>
      {#if app.changes.length > 0}
        <span class="nav-count">{app.changes.length}</span>
      {/if}
    </button>
  </div>

  <!-- Fix and Manage / Archive Section -->
  <div class="sidebar-section">
    <div class="sidebar-section-header">Fix and manage</div>
    <MissingFieldsFilter
      fields={app.missingFields}
      mode={app.missingFieldMode}
      onchange={app.changeMissingFields}
    />
    <button class="nav-item" onclick={app.importCsv} disabled={app.busy || !app.selected}>
      <span class="material-symbols-outlined nav-icon">upload</span>
      <span class="nav-label">Import CSV</span>
    </button>
    <button
      class="nav-item"
      onclick={() => app.exportSelected('csv')}
      disabled={!app.capture || app.capture.contact_count === 0}
      title={!app.capture || app.capture.contact_count === 0
        ? 'No contact data to export'
        : 'Export contacts to CSV'}
    >
      <span class="material-symbols-outlined nav-icon">download</span>
      <span class="nav-label">Export CSV</span>
    </button>
    <button
      class="nav-item"
      onclick={app.openPhotoExport}
      disabled={!app.capture || app.capture.contact_count === 0}
      title={!app.capture || app.capture.contact_count === 0
        ? 'No contact data to export'
        : 'Export contact profile photos in highest resolution'}
    >
      <span class="material-symbols-outlined nav-icon">photo_library</span>
      <span class="nav-label">Export Photos</span>
    </button>
    <button
      class="nav-item"
      onclick={app.backupSelected}
      disabled={!app.selected || app.captures.length === 0}
      title={!app.selected || app.captures.length === 0
        ? 'No archive data to back up'
        : 'Backup archive'}
    >
      <span class="material-symbols-outlined nav-icon">archive</span>
      <span class="nav-label">Backup archive</span>
    </button>
    <button class="nav-item" onclick={app.restoreLocal}>
      <span class="material-symbols-outlined nav-icon">unarchive</span>
      <span class="nav-label">Restore archive</span>
    </button>
  </div>

  <!-- Labels Section -->
  {#if app.groups.length > 0}
    <div class="sidebar-section" class:has-selected-labels={app.selectedGroups.length > 0}>
      <div class="sidebar-section-header sidebar-section-header-row">
        <div class="sidebar-header-left">
          <span>Labels</span>
          {#if app.selectedGroups.length > 0}
            <span
              class="sidebar-header-badge"
              title="{app.selectedGroups.length} label{app.selectedGroups.length > 1
                ? 's'
                : ''} active"
            >
              {app.selectedGroups.length === 1 ? '1 active' : `${app.selectedGroups.length} active`}
            </span>
          {/if}
        </div>
        {#if app.selectedGroups.length > 0}
          <button
            type="button"
            class="sidebar-header-clear"
            onclick={app.clearLabelFilter}
            title="Clear all selected labels"
            aria-label="Clear all selected labels"
          >
            Clear
          </button>
        {/if}
      </div>

      {#each app.groups as group}
        {@const isSelected = app.selectedGroups.includes(group.resource_name)}
        <div
          class="nav-item label-nav-item"
          class:active={app.pageView === 'contacts' && isSelected}
          class:is-selected={isSelected}
          data-label-res={group.resource_name}
          data-label-name={group.name}
          onclick={() => {
            app.toggleLabelFilter(group.resource_name);
            app.navigate('contacts');
          }}
          onkeydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              app.toggleLabelFilter(group.resource_name);
              app.navigate('contacts');
            }
          }}
          role="checkbox"
          aria-checked={isSelected}
          tabindex="0"
          title="{group.name} — Click to toggle filter"
        >
          <div class="nav-checkbox" class:checked={isSelected}>
            {#if isSelected}
              <span class="material-symbols-outlined nav-check-icon">check</span>
            {/if}
          </div>
          <span class="material-symbols-outlined nav-icon" class:icon-filled={isSelected}>
            label
          </span>
          <span class="nav-label">{group.name}</span>
          {#if group.member_count !== null && group.member_count !== undefined}
            <span class="nav-count">{group.member_count}</span>
          {/if}
          <button
            type="button"
            class="only-btn"
            onclick={(e) => {
              e.stopPropagation();
              app.isolateLabelFilter(group.resource_name);
              app.navigate('contacts');
            }}
            title="Only show {group.name}"
            aria-label="Only show {group.name}"
          >
            Only
          </button>
        </div>
      {/each}
    </div>
  {/if}
</aside>
