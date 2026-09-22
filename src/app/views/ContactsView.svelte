<script lang="ts">
  import ContactsTableHeader from './ContactsTableHeader.svelte';
  import ContactsToolbar from './ContactsToolbar.svelte';
  import ContactRow from './ContactRow.svelte';
  import type { AppModel } from '../model.svelte';
  let { app }: { app: AppModel } = $props();
</script>

<!-- Main Contacts Table List View (Screenshots 1 & 3) -->
<ContactsToolbar {app} />

{#if app.selectedGroups.length > 0}
  <div class="filter-contacts-bar" role="region" aria-label="Active label filters">
    <div class="filter-bar-left">
      <div class="filter-bar-lead">
        <span class="material-symbols-outlined filter-lead-icon">filter_list</span>
        <span class="filter-lead-label">Filtered by:</span>
      </div>
      <div class="filter-chips-list">
        {#each app.selectedGroups as resName (resName)}
          {@const grp = app.groups.find((g) => g.resource_name === resName)}
          <div class="filter-chip" title={grp?.name || resName}>
            <span class="material-symbols-outlined filter-chip-icon">label</span>
            <span class="filter-chip-text">{grp?.name || resName}</span>
            <button
              type="button"
              class="filter-chip-remove"
              onclick={() => app.toggleLabelFilter(resName)}
              title="Remove {grp?.name || 'label'} filter"
              aria-label="Remove {grp?.name || 'label'} filter"
            >
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
        {/each}
      </div>
    </div>

    <div class="filter-bar-right">
      {#if app.selectedGroups.length > 1}
        <div class="match-mode-segmented-control" role="radiogroup" aria-label="Label match mode">
          <button
            type="button"
            class="segmented-btn"
            class:active={app.labelMatchMode === 'any'}
            onclick={() => {
              app.labelMatchMode = 'any';
              app.updateDisplayedContacts();
            }}
            title="Show contacts matching ANY of the selected labels (OR)"
          >
            Any label
          </button>
          <button
            type="button"
            class="segmented-btn"
            class:active={app.labelMatchMode === 'all'}
            onclick={() => {
              app.labelMatchMode = 'all';
              app.updateDisplayedContacts();
            }}
            title="Show contacts matching ALL of the selected labels (AND)"
          >
            All labels
          </button>
        </div>
        <span class="filter-bar-divider" aria-hidden="true"></span>
      {/if}
      <button
        type="button"
        class="filter-clear-all-btn"
        onclick={app.clearLabelFilter}
        title="Clear {app.selectedGroups.length > 1 ? 'all label filters' : 'label filter'}"
        aria-label="Clear {app.selectedGroups.length > 1 ? 'all label filters' : 'label filter'}"
      >
        <span class="material-symbols-outlined">close</span>
        <span>{app.selectedGroups.length > 1 ? 'Clear all' : 'Clear'}</span>
      </button>
    </div>
  </div>
{/if}

<div class="table-scroll-container">
  <table class="contacts-table">
    <colgroup>
      {#each app.activeColKeys as colKey}
        <col style="width: {app.colWidths[colKey]}px;" />
      {/each}
    </colgroup>
    <ContactsTableHeader {app} />
    <tbody>
      {#if app.favouriteContacts.length > 0}
        <tr class="table-section-row">
          <td colspan={app.activeColKeys.length}>
            <div class="section-title-wrap">
              <span class="material-symbols-outlined icon-filled star-section-icon">star</span>
              <span>Favourites ({app.favouriteContacts.length})</span>
            </div>
          </td>
        </tr>
        {#each app.favouriteContacts as contact (contact.resource_name)}
          <ContactRow {app} {contact} />
        {/each}
      {/if}

      {#if app.otherContacts.length > 0}
        <tr class="table-section-row">
          <td colspan={app.activeColKeys.length}>
            <span>Contacts ({app.otherContacts.length})</span>
          </td>
        </tr>
        {#each app.otherContacts as contact (contact.resource_name)}
          <ContactRow {app} {contact} />
        {/each}
      {/if}

      {#if app.contacts.length === 0}
        <tr>
          <td colspan={app.activeColKeys.length}>
            <div class="empty-state">
              {#if app.missingFields.length > 0}
                <span class="material-symbols-outlined">filter_list_off</span>
                <h3 class="empty-state-title">No contacts match these filters</h3>
                <p class="empty-state-desc">Try fewer missing fields or clear the filters.</p>
                <button
                  class="action-btn"
                  onclick={() => app.changeMissingFields([], app.missingFieldMode)}
                  >Clear missing-field filters</button
                >
              {:else if app.search.trim()}
                <span class="material-symbols-outlined">search_off</span>
                <h3 class="empty-state-title">No matching contacts</h3>
                <p class="empty-state-desc">
                  No contacts matching "{app.search.trim()}" were found.
                </p>
                <button class="action-btn" onclick={app.clearSearch} style="margin-top: 12px;"
                  >Clear search</button
                >
              {:else if app.selectedGroups.length > 0}
                <span class="material-symbols-outlined">label_off</span>
                <h3 class="empty-state-title">No contacts match selected labels</h3>
                <p class="empty-state-desc">
                  {#if app.selectedGroups.length === 1}
                    There are no contacts tagged with this label in snapshot #{app.capture
                      ?.sequence}.
                  {:else if app.labelMatchMode === 'all'}
                    No contacts possess all {app.selectedGroups.length} selected labels simultaneously
                    in snapshot #{app.capture?.sequence}.
                  {:else}
                    No contacts are tagged with any of the {app.selectedGroups.length} selected labels
                    in snapshot #{app.capture?.sequence}.
                  {/if}
                </p>
                <div style="display: flex; gap: 8px; justify-content: center; margin-top: 12px;">
                  {#if app.selectedGroups.length > 1 && app.labelMatchMode === 'all'}
                    <button
                      class="action-btn"
                      onclick={() => {
                        app.labelMatchMode = 'any';
                        app.updateDisplayedContacts();
                      }}
                    >
                      Switch to Match ANY
                    </button>
                  {/if}
                  <button
                    class="action-btn"
                    onclick={app.clearLabelFilter}
                    style="background: var(--surface-base); color: var(--google-text); border: 1px solid var(--google-border);"
                  >
                    Clear label filters
                  </button>
                </div>
              {:else}
                <span class="material-symbols-outlined">people</span>
                <h3 class="empty-state-title">No contacts found</h3>
                <p class="empty-state-desc">No contacts available in this snapshot.</p>
              {/if}
            </div>
          </td>
        </tr>
      {/if}
    </tbody>
  </table>
</div>
