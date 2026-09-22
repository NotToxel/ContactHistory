<script lang="ts">
  import CustomSelect from '../../lib/CustomSelect.svelte';
  import type { AppModel } from '../model.svelte';
  let { app }: { app: AppModel } = $props();
  const qualities = [
    { label: 'Original', detail: 'Full size', size: null },
    { label: 'High', detail: '512 px', size: 512 },
    { label: 'Medium', detail: '256 px', size: 256 },
    { label: 'Low', detail: '96 px', size: 96 },
  ];
  const imageFormats = [
    { label: 'Original', value: 'original' },
    { label: 'JPEG', value: 'jpg' },
    { label: 'PNG', value: 'png' },
    { label: 'WebP', value: 'webp' },
  ];
</script>

{#if app.showPhotoExportModal}
  <div
    class="modal-overlay"
    onclick={(e) => {
      if (e.target === e.currentTarget && !app.photoExportBusy) app.showPhotoExportModal = false;
    }}
    onkeydown={(e) => {
      if (e.key === 'Escape' && !app.photoExportBusy) app.showPhotoExportModal = false;
    }}
    role="dialog"
    aria-modal="true"
    aria-labelledby="photo-export-title"
    use:app.focusDialog
    tabindex="-1"
  >
    <div class="modal-dialog photo-export-dialog" role="document">
      <div class="modal-header photo-export-header">
        <div class="photo-export-heading">
          <span class="heading-icon material-symbols-outlined" aria-hidden="true"
            >photo_library</span
          >
          <div>
            <h2 class="modal-title" id="photo-export-title">Export contact photos</h2>
            <p>Choose which photos to save and how they should be prepared.</p>
          </div>
        </div>
        <button
          type="button"
          class="icon-btn close-button"
          onclick={() => {
            if (!app.photoExportBusy) app.showPhotoExportModal = false;
          }}
          disabled={app.photoExportBusy}
          aria-label="Close photo export"
          ><span class="material-symbols-outlined" aria-hidden="true">close</span></button
        >
      </div>

      <div class="modal-body photo-export-body">
        <section aria-labelledby="contacts-label">
          <h3 id="contacts-label">Contacts</h3>
          <CustomSelect
            ariaLabel="Contacts to export"
            options={app.scopeChoices}
            bind:value={app.photoExportScope}
            disabled={app.photoExportBusy}
          />
        </section>

        <section aria-labelledby="quality-label">
          <div class="section-heading">
            <h3 id="quality-label">Photo quality</h3>
            <span>Smaller photos keep their available size</span>
          </div>
          <div class="segmented" role="radiogroup" aria-label="Photo quality">
            {#each qualities as quality}
              <button
                type="button"
                class:selected={app.photoExportQuality === quality.size}
                role="radio"
                aria-checked={app.photoExportQuality === quality.size}
                disabled={app.photoExportBusy}
                onclick={() => (app.photoExportQuality = quality.size)}
                ><strong>{quality.label}</strong><small>{quality.detail}</small></button
              >
            {/each}
          </div>
          <p class="note">
            <span class="material-symbols-outlined" aria-hidden="true">info</span>Animated GIFs
            always keep their original dimensions.
          </p>
        </section>

        <section aria-labelledby="format-label">
          <h3 id="format-label">Image format</h3>
          <div class="segmented" role="radiogroup" aria-label="Image format">
            {#each imageFormats as imageFormat}
              <button
                type="button"
                class:selected={app.photoExportImageFormat === imageFormat.value}
                role="radio"
                aria-checked={app.photoExportImageFormat === imageFormat.value}
                disabled={app.photoExportBusy}
                onclick={() =>
                  (app.photoExportImageFormat =
                    imageFormat.value as typeof app.photoExportImageFormat)}
                ><strong>{imageFormat.label}</strong></button
              >
            {/each}
          </div>
        </section>

        <section aria-labelledby="destination-label">
          <h3 id="destination-label">Save as</h3>
          <div class="destinations">
            <button
              type="button"
              class:selected={app.photoExportFormat === 'folder'}
              aria-pressed={app.photoExportFormat === 'folder'}
              onclick={() => (app.photoExportFormat = 'folder')}
              disabled={app.photoExportBusy}
              ><span class="destination-icon material-symbols-outlined" aria-hidden="true"
                >folder</span
              ><span><strong>Folder</strong><small>Save each photo separately</small></span><span
                class="selection-mark material-symbols-outlined"
                aria-hidden="true">check_circle</span
              ></button
            >
            <button
              type="button"
              class:selected={app.photoExportFormat === 'zip'}
              aria-pressed={app.photoExportFormat === 'zip'}
              onclick={() => (app.photoExportFormat = 'zip')}
              disabled={app.photoExportBusy}
              ><span class="destination-icon material-symbols-outlined" aria-hidden="true"
                >folder_zip</span
              ><span><strong>ZIP archive</strong><small>Save everything in one file</small></span
              ><span class="selection-mark material-symbols-outlined" aria-hidden="true"
                >check_circle</span
              ></button
            >
          </div>
        </section>

        {#if app.photoExportBusy}
          <div class="export-status progress" role="status" aria-live="polite">
            <div class="status-heading">
              <span
                >{app.photoExportProgress
                  ? `Exporting ${app.photoExportProgress.name}`
                  : 'Preparing export'}</span
              >{#if app.photoExportProgress && app.photoExportProgress.total > 0}<span
                  >{app.photoExportProgress.current} of {app.photoExportProgress.total}</span
                >{/if}
            </div>
            <div class="banner-progress-bar">
              <div
                class="banner-progress-fill"
                style="width: {app.photoExportProgress && app.photoExportProgress.total > 0
                  ? Math.min(
                      100,
                      Math.round(
                        (app.photoExportProgress.current / app.photoExportProgress.total) * 100,
                      ),
                    )
                  : 15}%;"
              ></div>
            </div>
          </div>
        {/if}
        {#if app.photoExportResult}
          <div class="export-status success" role="status" aria-live="polite">
            <span class="material-symbols-outlined" aria-hidden="true">check_circle</span>
            <div>
              <strong>Photos exported</strong>
              <p>
                {app.photoExportResult.exported_photos} photo{app.photoExportResult
                  .exported_photos === 1
                  ? ''
                  : 's'} saved
              </p>
              <code>{app.photoExportResult.destination}</code><small
                >{app.photoExportResult.skipped_no_photo} without a photo{#if app.photoExportResult.skipped_default > 0}
                  · {app.photoExportResult.skipped_default} default avatar{app.photoExportResult
                    .skipped_default === 1
                    ? ''
                    : 's'} skipped{/if}</small
              >
            </div>
          </div>
        {/if}
        {#if app.photoExportError}
          <div class="export-status error" role="alert">
            <span class="material-symbols-outlined" aria-hidden="true">error</span>
            <div>
              <strong>Export failed</strong>
              <p>{app.photoExportError}</p>
            </div>
          </div>
        {/if}
      </div>

      <div class="modal-footer photo-export-footer">
        {#if app.photoExportResult}<button
            class="btn-primary"
            onclick={() => (app.showPhotoExportModal = false)}>Done</button
          >
        {:else}<button
            class="btn-secondary"
            onclick={() => (app.showPhotoExportModal = false)}
            disabled={app.photoExportBusy}>Cancel</button
          ><button
            class="btn-primary submit"
            onclick={app.startPhotoExport}
            disabled={app.photoExportBusy ||
              !app.scopeChoices.find((choice) => choice.value === app.photoExportScope)?.contacts
                .length}
            >{#if app.photoExportBusy}<span
                class="material-symbols-outlined spinning"
                aria-hidden="true">progress_activity</span
              >Exporting…{:else}<span class="material-symbols-outlined" aria-hidden="true"
                >download</span
              >Export photos{/if}</button
          >{/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .photo-export-dialog {
    width: min(92vw, 560px);
    max-width: 560px;
  }
  .photo-export-header {
    align-items: flex-start;
    padding: 22px 24px 18px;
  }
  .photo-export-heading {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    min-width: 0;
  }
  .heading-icon {
    display: grid;
    place-items: center;
    flex: 0 0 40px;
    height: 40px;
    border-radius: 12px;
    background: var(--google-blue-surface);
    color: var(--google-blue);
    font-size: 22px;
  }
  .photo-export-heading h2 {
    margin: 1px 0 4px;
  }
  .photo-export-heading p {
    margin: 0;
    color: var(--google-text-secondary);
    font-size: 13px;
    line-height: 1.45;
  }
  .close-button {
    flex: none;
    margin: -5px -8px 0 8px;
  }
  .photo-export-body {
    display: flex;
    flex-direction: column;
    gap: 22px;
    padding: 20px 24px 24px;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 9px;
  }
  section h3 {
    margin: 0;
    color: var(--google-text);
    font-size: 13px;
    font-weight: 650;
  }
  .section-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }
  .section-heading > span {
    color: var(--google-text-secondary);
    font-size: 11px;
  }
  .segmented {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    border: 1px solid var(--google-border);
    border-radius: 10px;
    overflow: hidden;
  }
  .segmented button {
    min-width: 0;
    min-height: 52px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    border: 0;
    border-right: 1px solid var(--google-border);
    background: var(--surface-base);
    color: var(--google-text);
    cursor: pointer;
  }
  .segmented button:last-child {
    border-right: 0;
  }
  .segmented button:hover:not(:disabled),
  .destinations button:hover:not(:disabled) {
    background: var(--google-surface-hover);
  }
  .segmented button.selected {
    background: var(--google-blue-surface);
    color: var(--google-blue);
    box-shadow: inset 0 -2px 0 var(--google-blue);
  }
  .segmented button:focus-visible,
  .destinations button:focus-visible {
    outline: 2px solid var(--google-blue);
    outline-offset: -3px;
  }
  .segmented strong,
  .destinations strong {
    font-size: 12px;
    font-weight: 650;
  }
  .segmented small,
  .destinations small {
    color: var(--google-text-secondary);
    font-size: 10px;
  }
  .segmented button:disabled,
  .destinations button:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
  .note {
    display: flex;
    align-items: center;
    gap: 5px;
    margin: 0;
    color: var(--google-text-secondary);
    font-size: 11px;
  }
  .note .material-symbols-outlined {
    font-size: 15px;
  }
  .destinations {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .destinations button {
    display: grid;
    grid-template-columns: 34px 1fr 20px;
    align-items: center;
    gap: 10px;
    min-width: 0;
    padding: 13px;
    text-align: left;
    color: var(--google-text);
    background: var(--surface-base);
    border: 1px solid var(--google-border);
    border-radius: 12px;
    cursor: pointer;
  }
  .destinations button.selected {
    border-color: var(--google-blue);
    background: var(--google-blue-surface);
  }
  .destination-icon {
    color: var(--google-blue);
    font-size: 25px;
  }
  .destinations button > span:nth-child(2) {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .destinations small {
    line-height: 1.3;
  }
  .selection-mark {
    color: var(--google-blue);
    font-size: 19px;
    opacity: 0;
  }
  .selected .selection-mark {
    opacity: 1;
  }
  .export-status {
    display: flex;
    gap: 10px;
    padding: 13px 14px;
    border-radius: 12px;
    font-size: 12px;
  }
  .export-status.progress {
    flex-direction: column;
    gap: 9px;
    background: var(--google-blue-surface);
  }
  .status-heading {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    color: var(--google-text);
    font-weight: 550;
  }
  .export-status .banner-progress-bar {
    width: 100%;
    height: 6px;
  }
  .export-status.success {
    background: var(--success-surface);
    color: var(--success-text);
  }
  .export-status.error {
    background: var(--google-danger-surface);
    color: var(--google-danger);
  }
  .export-status > .material-symbols-outlined {
    flex: none;
    font-size: 20px;
  }
  .export-status strong {
    display: block;
    font-size: 13px;
  }
  .export-status p {
    margin: 3px 0 0;
    color: var(--google-text);
    line-height: 1.4;
  }
  .export-status code {
    display: block;
    max-width: 100%;
    margin-top: 7px;
    padding: 6px 8px;
    overflow-wrap: anywhere;
    border-radius: 6px;
    background: var(--surface-base);
    color: var(--google-text);
    font-family: var(--font-family);
    font-size: 11px;
  }
  .export-status small {
    display: block;
    margin-top: 7px;
    color: var(--google-text-secondary);
  }
  .photo-export-footer {
    padding: 14px 24px;
  }
  .submit {
    display: inline-flex;
    align-items: center;
    gap: 7px;
  }
  .submit .material-symbols-outlined {
    font-size: 17px;
  }
  .spinning {
    animation: spin 900ms linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (max-width: 520px) {
    .photo-export-dialog {
      width: calc(100vw - 24px);
      max-height: calc(100vh - 24px);
    }
    .photo-export-header,
    .photo-export-body {
      padding-left: 18px;
      padding-right: 18px;
    }
    .photo-export-body {
      gap: 18px;
    }
    .section-heading {
      align-items: flex-start;
      flex-direction: column;
      gap: 3px;
    }
    .destinations {
      grid-template-columns: 1fr;
    }
    .segmented button {
      min-height: 48px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .spinning {
      animation-duration: 1.8s;
    }
  }
</style>
