<script lang="ts">
  import type { AppModel } from '../model.svelte';
  let { app }: { app: AppModel } = $props();
</script>

<div
  class="view-header"
  class:has-filter-bar={app.selectedGroups.length > 0}
  class:has-selection={app.selectedContactKeys.length > 0}
>
  {#if app.selectedContactKeys.length > 0}
    <div class="table-selection-toolbar">
      <div class="selection-toolbar-left">
        <div class="selection-box-wrapper">
          <button
            type="button"
            class="selection-master-checkbox"
            onclick={app.toggleSelectAll}
            title={app.isAllSelected ? 'Deselect all' : 'Select all'}
            aria-label={app.isAllSelected ? 'Deselect all' : 'Select all'}
          >
            <span class="material-symbols-outlined">
              {app.isIndeterminate ? 'remove' : 'check'}
            </span>
          </button>
          <button
            type="button"
            class="selection-dropdown-trigger"
            onclick={(e) => {
              e.stopPropagation();
              app.showSelectionMenu = !app.showSelectionMenu;
            }}
            title="Selection options"
            aria-label="Selection options"
            aria-expanded={app.showSelectionMenu}
            aria-haspopup="menu"
          >
            <span class="material-symbols-outlined">arrow_drop_down</span>
          </button>
          {#if app.showSelectionMenu}
            <div class="selection-dropdown-menu" role="menu">
              <button
                type="button"
                class="selection-dropdown-item"
                onclick={() => {
                  app.selectAllVisible();
                  app.showSelectionMenu = false;
                }}
                role="menuitem"
              >
                <span class="material-symbols-outlined" aria-hidden="true">select_all</span>
                <span>Select all</span>
                <span class="selection-option-count">{app.contacts.length}</span>
              </button>
              <button
                type="button"
                class="selection-dropdown-item"
                onclick={() => {
                  app.clearContactSelection();
                  app.showSelectionMenu = false;
                }}
                role="menuitem"
              >
                <span class="material-symbols-outlined" aria-hidden="true">deselect</span>
                <span>Select none</span>
              </button>
            </div>
          {/if}
        </div>
        <span class="selection-count-label">
          {app.selectedContactKeys.length} selected
          {#if app.selectionPreviewCount > 0}
            <span
              class="selection-preview-count"
              class:is-removing={app.selectionPreviewMode === 'deselect'}
              aria-hidden="true"
            >
              {app.selectionPreviewMode === 'deselect' ? '−' : '+'}{app.selectionPreviewCount}
            </span>
          {/if}
        </span>
      </div>

      <div class="selection-toolbar-actions">
        <button
          type="button"
          class="icon-btn selection-action-btn"
          onclick={app.sendEmailToSelected}
          data-tooltip="Send email in new window"
          aria-label="Send email in new window"
        >
          <span class="material-symbols-outlined">mail</span>
        </button>
        <button
          type="button"
          class="icon-btn selection-action-btn"
          onclick={app.openPhotoExport}
          data-tooltip="Export Contact Photos"
          aria-label="Export Contact Photos"
        >
          <span class="material-symbols-outlined">photo_library</span>
        </button>
        <div class="selection-download-wrapper">
          <button
            type="button"
            class="icon-btn selection-action-btn"
            class:active={app.showDownloadMenu}
            onclick={(e) => {
              e.stopPropagation();
              app.showDownloadMenu = !app.showDownloadMenu;
            }}
            data-tooltip="More selection actions"
            aria-label="More selection actions"
            aria-haspopup="menu"
            aria-expanded={app.showDownloadMenu}
          >
            <span class="material-symbols-outlined">more_vert</span>
          </button>
          {#if app.showDownloadMenu}
            <div class="selection-download-menu" role="menu">
              <button
                type="button"
                class="selection-menu-item"
                onclick={() => {
                  app.downloadSelectedVcf();
                  app.showDownloadMenu = false;
                }}
                role="menuitem"
              >
                <span class="material-symbols-outlined">contact_page</span>
                <div class="menu-item-text">
                  <span class="menu-item-title">vCard format (.vcf)</span>
                  <span class="menu-item-subtitle">For Apple Contacts, Outlook, iOS & Android</span>
                </div>
              </button>
              <button
                type="button"
                class="selection-menu-item"
                onclick={() => {
                  app.downloadSelectedCsv();
                  app.showDownloadMenu = false;
                }}
                role="menuitem"
              >
                <span class="material-symbols-outlined">table_chart</span>
                <div class="menu-item-text">
                  <span class="menu-item-title">Google CSV (.csv)</span>
                  <span class="menu-item-subtitle">For importing into Google Contacts</span>
                </div>
              </button>
              <button
                type="button"
                class="selection-menu-item"
                onclick={() => {
                  app.downloadSelectedJson();
                  app.showDownloadMenu = false;
                }}
                role="menuitem"
              >
                <span class="material-symbols-outlined">data_object</span>
                <div class="menu-item-text">
                  <span class="menu-item-title">JSON format (.json)</span>
                  <span class="menu-item-subtitle">Raw snapshot payload</span>
                </div>
              </button>
            </div>
          {/if}
        </div>
        <button
          type="button"
          class="icon-btn selection-action-btn"
          onclick={() => app.openPrintDialog()}
          data-tooltip="Print"
          aria-label="Print"
        >
          <span class="material-symbols-outlined">print</span>
        </button>
        <button
          type="button"
          class="icon-btn selection-action-btn"
          onclick={app.clearContactSelection}
          data-tooltip="Clear selection"
          aria-label="Clear selection"
        >
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
    </div>
  {:else}
    <div class="view-header-main">
      <h1 class="view-title">
        {#if app.missingFields.length > 0}
          Filtered Contacts ({app.contacts.length})
        {:else if app.selectedGroups.length === 0}
          Contacts ({app.capture ? app.capture.contact_count : app.contacts.length})
        {:else if app.selectedGroups.length === 1}
          {app.groups.find((g) => g.resource_name === app.selectedGroups[0])?.name ||
            'Filtered Contacts'} ({app.contacts.length})
        {:else}
          Filtered Contacts ({app.contacts.length})
        {/if}
      </h1>
    </div>
    <div class="view-header-actions">
      <button
        class="icon-btn"
        onclick={() => app.openPrintDialog()}
        data-tooltip="Print"
        aria-label="Print"
      >
        <span class="material-symbols-outlined">print</span>
      </button>
      <button
        class="icon-btn"
        onclick={() => app.exportSelected('csv')}
        disabled={!app.capture || app.capture.contact_count === 0}
        data-tooltip={!app.capture || app.capture.contact_count === 0
          ? 'No contacts to export'
          : 'Export CSV'}
        aria-label="Export CSV"
      >
        <span class="material-symbols-outlined">upload</span>
      </button>
      <button
        class="icon-btn"
        onclick={app.openPhotoExport}
        disabled={!app.capture || app.capture.contact_count === 0}
        data-tooltip={!app.capture || app.capture.contact_count === 0
          ? 'No contacts to export'
          : 'Export Contact Photos'}
        aria-label="Export Contact Photos"
      >
        <span class="material-symbols-outlined">photo_library</span>
      </button>
      <button
        class="icon-btn"
        class:active={app.showColCustomizer}
        onclick={() => (app.showColCustomizer = true)}
        data-tooltip="Change column order"
        aria-label="Change column order"
      >
        <span class="material-symbols-outlined">more_vert</span>
      </button>
    </div>
  {/if}
</div>
