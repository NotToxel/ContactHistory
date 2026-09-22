<script lang="ts">
  import ContactFields from './ContactFields.svelte';

  import { api } from '../../lib/ipc';
  import type { AppModel } from '../model.svelte';
  let { app }: { app: AppModel } = $props();
</script>

{#if app.detail}
  <div class="detail-container">
    <!-- ── Top Navigation Row (Frozen Row pinned to top, like Google Contacts) ── -->
    <div class="detail-top-bar" class:is-scrolled={app.isScrolled}>
      <div class="detail-top-nav" bind:this={app.topNavEl}>
        <div class="detail-top-nav-left">
          <button
            class="icon-btn"
            onclick={() => {
              app.detail = undefined;
              app.recordNavigation();
            }}
            data-tooltip="Back to list"
            data-tooltip-pos="bottom"
            aria-label="Back to list"
          >
            <span class="material-symbols-outlined">arrow_back</span>
          </button>
          <div class="detail-sticky-profile" class:visible={app.showStickyName}>
            <div
              class="detail-sticky-avatar"
              style="background-color: {app.getAvatarColor(app.getDisplayName(app.detail))};"
              aria-hidden="true"
            >
              {#if app.getAvatarSource(app.detail, app.media)}
                <img
                  src={app.getAvatarSource(app.detail, app.media)}
                  alt=""
                  class="detail-sticky-avatar-img"
                  referrerpolicy="no-referrer"
                  onerror={(e) => {
                    (e.currentTarget as HTMLElement).classList.add('avatar-img-failed');
                  }}
                  onload={(e) => {
                    (e.currentTarget as HTMLElement).classList.remove('avatar-img-failed');
                  }}
                />
              {/if}
              <span class="detail-sticky-avatar-initials"
                >{app.getInitials(app.getDisplayName(app.detail))}</span
              >
            </div>
            <span class="detail-sticky-name" title={app.getDisplayName(app.detail)}>
              {app.getDisplayName(app.detail)}
            </span>
          </div>
        </div>
        <div class="detail-nav-actions">
          {#if app.isFavourite(app.detail)}
            <span class="star-indicator" data-tooltip="Starred contact" data-tooltip-pos="bottom">
              <span
                class="material-symbols-outlined icon-filled"
                style="color: var(--favorite); font-size: 22px;">star</span
              >
            </span>
          {/if}
          {#if app.previewSequence !== null}
            <button
              class="detail-preview-reset"
              onclick={app.restoreContactRevision}
              title="Return to selected snapshot"
            >
              <span class="material-symbols-outlined">undo</span>
              <span>Previewing snapshot #{app.previewSequence} · Back to selected</span>
            </button>
          {/if}
          <div
            class="detail-version-pill"
            data-tooltip="Contact revision #{app.detail.version}"
            data-tooltip-pos="bottom"
          >
            <span class="material-symbols-outlined" style="font-size: 15px;">history</span>
            <span>v{app.detail.version}</span>
          </div>
          <!-- Three-dots More Options Menu -->
          <div class="detail-menu-container">
            <button
              class="icon-btn"
              onclick={() => {
                app.showDetailMenu = !app.showDetailMenu;
                app.showPhotoQualityMenu = false;
              }}
              aria-label="More options"
              aria-haspopup="true"
              aria-expanded={app.showDetailMenu}
              data-tooltip="More options"
              data-tooltip-pos="bottom"
            >
              <span class="material-symbols-outlined">more_vert</span>
            </button>
            {#if app.showDetailMenu}
              <div class="detail-menu" role="menu">
                <button
                  class="detail-menu-item"
                  role="menuitem"
                  onclick={() => {
                    app.showDetailMenu = false;
                    app.showRawDataModal = true;
                  }}
                >
                  <span class="material-symbols-outlined">data_object</span>
                  <span>View raw payload</span>
                </button>
                <button
                  class="detail-menu-item"
                  role="menuitem"
                  onclick={() => {
                    app.showDetailMenu = false;
                    app.downloadContactCsv(app.detail!);
                  }}
                >
                  <span class="material-symbols-outlined">table_chart</span>
                  <span>Export Google CSV</span>
                </button>
                <button
                  class="detail-menu-item"
                  role="menuitem"
                  onclick={() => {
                    app.showDetailMenu = false;
                    app.downloadContactVcf(app.detail!);
                  }}
                >
                  <span class="material-symbols-outlined">contact_page</span>
                  <span>Export vCard</span>
                </button>
                <button
                  class="detail-menu-item"
                  role="menuitem"
                  onclick={() => {
                    app.showDetailMenu = false;
                    app.downloadContactJson(app.detail!);
                  }}
                >
                  <span class="material-symbols-outlined">download</span>
                  <span>Export JSON</span>
                </button>
                <div class="detail-photo-trigger">
                  <button
                    class="detail-menu-item detail-photo-main"
                    role="menuitem"
                    disabled={!app.detailPhotoUrl() || app.photoDownloadBusy}
                    title={!app.detailPhotoUrl()
                      ? 'No photo available for this contact'
                      : 'Download Photo at High quality'}
                    onclick={() => app.downloadDetailPhoto(true)}
                  >
                    <span class="material-symbols-outlined">image</span>
                    <span>Download Photo</span>
                  </button>
                  <button
                    class="detail-photo-expand"
                    type="button"
                    aria-label="Choose Photo quality"
                    aria-expanded={app.showPhotoQualityMenu}
                    aria-haspopup="true"
                    disabled={!app.detailPhotoUrl()}
                    onclick={app.openPhotoQualityMenu}
                  >
                    <span class="material-symbols-outlined">chevron_right</span>
                  </button>
                </div>
                {#if app.showPhotoQualityMenu}
                  <div
                    class="detail-photo-submenu"
                    role="group"
                    aria-label="Photo download quality"
                  >
                    {#if app.photoQualityLoading}
                      <div class="detail-photo-status">Checking available sizes…</div>
                      <div
                        class="detail-photo-progress"
                        role="progressbar"
                        aria-label="Checking available photo sizes"
                        aria-valuetext="Checking available sizes"
                      >
                        <div class="detail-photo-progress-fill"></div>
                      </div>
                    {:else if app.photoQualityInfo}
                      <div class="detail-photo-heading">Photo quality</div>
                      <div
                        class="detail-photo-options"
                        role="radiogroup"
                        aria-label="Photo quality"
                      >
                        <button
                          class="detail-photo-option"
                          class:selected={app.photoQualitySelection === null}
                          role="radio"
                          aria-checked={app.photoQualitySelection === null}
                          onclick={() => (app.photoQualitySelection = null)}
                        >
                          <span>Original</span><small
                            >{app.photoQualityInfo.width} × {app.photoQualityInfo.height} px</small
                          >
                        </button>
                        {#each [{ label: 'High', size: 512 }, { label: 'Medium', size: 256 }, { label: 'Low', size: 96 }] as quality}
                          {@const available =
                            app.photoQualityInfo.resizable &&
                            Math.max(app.photoQualityInfo.width, app.photoQualityInfo.height) >=
                              quality.size}
                          <button
                            class="detail-photo-option"
                            class:selected={app.photoQualitySelection === quality.size}
                            role="radio"
                            aria-checked={app.photoQualitySelection === quality.size}
                            disabled={!available}
                            title={available
                              ? `${quality.size} pixels on the longest side`
                              : `Requires a photo at least ${quality.size} pixels wide or high`}
                            onclick={() => (app.photoQualitySelection = quality.size)}
                          >
                            <span>{quality.label}</span><small>{quality.size} px</small>
                          </button>
                        {/each}
                      </div>
                      <button
                        class="detail-photo-save"
                        disabled={app.photoDownloadBusy}
                        onclick={() => app.downloadDetailPhoto()}
                        >{app.photoDownloadBusy ? 'Downloading…' : 'Download Photo'}</button
                      >
                    {/if}
                    {#if app.photoQualityError}<div class="detail-photo-error" role="alert">
                        {app.photoQualityError}
                      </div>{/if}
                  </div>
                {/if}
                <div class="detail-menu-divider"></div>
                <button
                  class="detail-menu-item"
                  role="menuitem"
                  onclick={() => {
                    app.showDetailMenu = false;
                    app.openPrintDialog(app.detail);
                  }}
                >
                  <span class="material-symbols-outlined">print</span>
                  <span>Print</span>
                </button>
              </div>
            {/if}
          </div>
        </div>
      </div>
    </div>

    <!-- Scrollable Detail Content (scrolls underneath frozen top bar) -->
    <div class="detail-view" bind:this={app.detailViewEl} onscroll={app.updateStickyState}>
      <!-- Detail Hero Avatar & Names (scrolls naturally) -->
      <div class="detail-hero">
        <button
          type="button"
          class="hero-avatar"
          bind:this={app.heroAvatarEl}
          onclick={() => (app.showPhotosModal = true)}
          aria-label="View photos for {app.getDisplayName(app.detail)}"
          data-tooltip="View photos"
          data-tooltip-pos="bottom"
        >
          {#if app.getAvatarSource(app.detail, app.media)}
            <img
              src={app.getAvatarSource(app.detail, app.media)}
              alt={app.getDisplayName(app.detail)}
              referrerpolicy="no-referrer"
              onerror={(e) => {
                (e.currentTarget as HTMLElement).classList.add('avatar-img-failed');
              }}
              onload={(e) => {
                (e.currentTarget as HTMLElement).classList.remove('avatar-img-failed');
              }}
            />
          {/if}
          <span>{app.getInitials(app.getDisplayName(app.detail))}</span>
          <div class="hero-avatar-overlay">
            <span class="material-symbols-outlined">photo_camera</span>
          </div>
        </button>
        <div class="hero-info">
          <h1 class="hero-name">{app.getDisplayName(app.detail)}</h1>
          {#if app.getNickname(app.detail.payload)}
            <span class="hero-nickname">{app.getNickname(app.detail.payload)}</span>
          {/if}
          {#if app.getOrganization(app.detail.payload).title || app.getOrganization(app.detail.payload).org}
            {@const organization = app.getOrganization(app.detail.payload)}
            <span class="hero-job-info"
              >{[organization.title, organization.org].filter(Boolean).join(' at ')}</span
            >
          {/if}
        </div>
      </div>

      <!-- Action Circles Row with Divider Line -->
      {#if app.detail.payload}
        {@const primaryEmail = app.getPrimaryEmail(app.detail.payload)}
        {@const hasEmail = Boolean(primaryEmail)}
        <div class="hero-actions-container">
          <div class="hero-action-buttons">
            <!-- Email -->
            <div class="action-circle-group">
              {#if hasEmail}
                <a
                  href="mailto:{primaryEmail}"
                  class="action-circle-btn"
                  data-tooltip="Send email to {primaryEmail}"
                  data-tooltip-pos="top"
                  aria-label="Send email"
                >
                  <span class="material-symbols-outlined">mail</span>
                </a>
              {:else}
                <div
                  class="action-circle-btn disabled"
                  aria-disabled="true"
                  data-tooltip="No email address"
                  data-tooltip-pos="top"
                  aria-label="Email unavailable"
                >
                  <span class="material-symbols-outlined">mail</span>
                </div>
              {/if}
              <span class="action-circle-label">Email</span>
            </div>

            <!-- Schedule -->
            <div class="action-circle-group">
              {#if hasEmail}
                <button
                  type="button"
                  class="action-circle-btn"
                  onclick={() =>
                    api.openExternalUrl(
                      `https://calendar.google.com/calendar/r/eventedit?add=${encodeURIComponent(primaryEmail)}`,
                    )}
                  data-tooltip="Schedule event with {primaryEmail}"
                  data-tooltip-pos="top"
                  aria-label="Schedule event"
                >
                  <span class="material-symbols-outlined">event</span>
                </button>
              {:else}
                <div
                  class="action-circle-btn disabled"
                  aria-disabled="true"
                  data-tooltip="No email address to schedule"
                  data-tooltip-pos="top"
                  aria-label="Schedule unavailable"
                >
                  <span class="material-symbols-outlined">event</span>
                </div>
              {/if}
              <span class="action-circle-label">Schedule</span>
            </div>

            <!-- Chat -->
            <div class="action-circle-group">
              {#if hasEmail}
                <a
                  href="mailto:{primaryEmail}"
                  class="action-circle-btn"
                  data-tooltip="Chat with {primaryEmail}"
                  data-tooltip-pos="top"
                  aria-label="Chat"
                >
                  <span class="material-symbols-outlined">chat</span>
                </a>
              {:else}
                <div
                  class="action-circle-btn disabled"
                  aria-disabled="true"
                  data-tooltip="No email address for chat"
                  data-tooltip-pos="top"
                  aria-label="Chat unavailable"
                >
                  <span class="material-symbols-outlined">chat</span>
                </div>
              {/if}
              <span class="action-circle-label">Chat</span>
            </div>

            <!-- Video -->
            <div class="action-circle-group">
              {#if hasEmail}
                <button
                  type="button"
                  class="action-circle-btn"
                  onclick={() => api.openExternalUrl('https://meet.google.com/new')}
                  data-tooltip="Start video meeting"
                  data-tooltip-pos="top"
                  aria-label="Start video meeting"
                >
                  <span class="material-symbols-outlined">videocam</span>
                </button>
              {:else}
                <div
                  class="action-circle-btn disabled"
                  aria-disabled="true"
                  data-tooltip="No video meeting available"
                  data-tooltip-pos="top"
                  aria-label="Video unavailable"
                >
                  <span class="material-symbols-outlined">videocam</span>
                </div>
              {/if}
              <span class="action-circle-label">Video</span>
            </div>
          </div>
          <div class="hero-actions-divider"></div>
        </div>
      {/if}

      <!-- Label Membership Chips Row -->
      {#if app.getContactLabelItems(app.detail.payload).length > 0}
        <div class="detail-chips-row">
          {#each app.getContactLabelItems(app.detail.payload) as lbl (lbl.resourceName)}
            {@const isSelected = app.selectedGroups.includes(lbl.resourceName)}
            <button
              type="button"
              class="detail-chip"
              class:active={isSelected}
              onclick={() => {
                app.toggleLabelFilter(lbl.resourceName);
                app.navigate('contacts');
              }}
              data-tooltip="{isSelected ? 'Remove from filter: ' : 'Filter by label: '}{lbl.name}"
              data-tooltip-pos="top"
              aria-label="{isSelected ? 'Remove from filter: ' : 'Filter by label: '}{lbl.name}"
            >
              <span class="material-symbols-outlined">label</span>
              <span>{lbl.name}</span>
            </button>
          {/each}
        </div>
      {/if}

      <!-- Structured Details Cards Grid -->
      <ContactFields {app} />
    </div>
  </div>
{/if}
