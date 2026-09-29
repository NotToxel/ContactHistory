<script lang="ts">
  import { api, type Contact } from '../../lib/ipc';
  import { getPhotoUrl } from '../actions/avatars';
  import PhotoChangePreview from '../../lib/PhotoChangePreview.svelte';
  import type { AppModel } from '../model.svelte';
  let { app, contact }: { app: AppModel; contact: Contact } = $props();
  const isSelected = $derived(app.selectedContactKeySet.has(contact.resource_name));
  const isPreviewed = $derived(app.selectionPreviewKeySet.has(contact.resource_name));
  const isDeselectPreview = $derived(isPreviewed && app.selectionPreviewMode === 'deselect');
  const photoChange = $derived(
    app.compareTargetSeq === app.capture?.sequence
      ? app.changesByResource.get(contact.resource_name)
      : undefined,
  );
  const hasPhotoChange = $derived(
    Boolean(
      photoChange && getPhotoUrl(photoChange.before || {}) !== getPhotoUrl(photoChange.after || {}),
    ),
  );
  let photoPreviewOpen = $state(false);
</script>

<tr
  class="contact-row"
  class:is-selected={isSelected}
  class:is-range-preview={isPreviewed}
  class:is-range-deselect-preview={isDeselectPreview}
  data-contact-res={contact.resource_name}
  onmouseenter={(e) => app.previewContactSelection(contact.resource_name, e.shiftKey)}
  onmouseleave={() => app.endContactSelectionPreview(contact.resource_name)}
  onclick={(e) => {
    if (e.shiftKey) {
      e.preventDefault();
      app.toggleContactSelection(contact.resource_name, e);
      app.clearContactSelectionPreview();
    } else {
      app.selectContact(contact);
    }
  }}
>
  {#each app.activeColKeys as colKey}
    {#if colKey === 'name'}
      <td>
        <div class="name-cell-content">
          <div
            class="avatar-select-container"
            class:selected={isSelected}
            class:preview={isPreviewed}
            class:deselect-preview={isDeselectPreview}
            onclick={(e) => {
              app.toggleContactSelection(contact.resource_name, e);
              app.clearContactSelectionPreview();
            }}
            onkeydown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation();
                e.preventDefault();
                app.toggleContactSelection(contact.resource_name, e);
                app.clearContactSelectionPreview();
              }
            }}
            role="checkbox"
            aria-checked={isSelected}
            tabindex="0"
            title={isSelected ? 'Deselect contact' : 'Select contact'}
          >
            <div
              class="avatar-circle"
              style="background-color: {app.getAvatarColor(
                app.getDisplayName(contact),
              )}; color: #ffffff;"
            >
              {#if app.getAvatarSource(contact)}
                <img
                  src={app.getAvatarSource(contact)}
                  alt={app.getDisplayName(contact)}
                  class="avatar-img"
                  loading="lazy"
                  referrerpolicy="no-referrer"
                  onerror={(e) => {
                    (e.currentTarget as HTMLElement).classList.add('avatar-img-failed');
                  }}
                  onload={(e) => {
                    (e.currentTarget as HTMLElement).classList.remove('avatar-img-failed');
                  }}
                />
              {/if}
              <span>{app.getInitials(app.getDisplayName(contact))}</span>
            </div>
            <div
              class="contact-select-checkbox"
              class:checked={isSelected}
              class:preview={isPreviewed}
              class:deselect-preview={isDeselectPreview}
            >
              {#if isDeselectPreview}
                <span class="material-symbols-outlined check-icon">remove</span>
              {:else if isSelected || isPreviewed}
                <span class="material-symbols-outlined check-icon">check</span>
              {/if}
            </div>
          </div>
          <span class="name-text">{app.getDisplayName(contact)}</span>
        </div>
        {#if hasPhotoChange && photoChange}
          <button
            type="button"
            class="contact-photo-change-toggle"
            aria-expanded={photoPreviewOpen}
            onclick={(event) => {
              event.stopPropagation();
              photoPreviewOpen = !photoPreviewOpen;
            }}
          >
            <span class="material-symbols-outlined" aria-hidden="true"
              >{photoPreviewOpen ? 'expand_less' : 'compare'}</span
            >
            {photoPreviewOpen ? 'Hide photo change' : 'Preview photo change'}
          </button>
          {#if photoPreviewOpen}
            <div
              class="contact-photo-change-panel"
              onclick={(event) => event.stopPropagation()}
              role="presentation"
            >
              <PhotoChangePreview
                accountId={app.selected?.id || ''}
                resourceName={contact.resource_name}
                before={photoChange.before}
                after={photoChange.after}
                beforeSequence={app.compareBaseSeq === app.compareTargetSeq
                  ? (app.captures.find((capture) => capture.sequence < (app.compareBaseSeq ?? 0))
                      ?.sequence ?? null)
                  : app.compareBaseSeq}
                afterSequence={app.compareTargetSeq}
              />
            </div>
          {/if}
        {/if}
      </td>
    {:else if colKey === 'job'}
      {@const jobInfo = app.getOrganization(contact.payload)}
      {@const jobText = [jobInfo.title, jobInfo.org].filter(Boolean).join(' • ')}
      {@const cellKey = `table-${contact.resource_name}-job`}
      <td title={jobText}>
        {#if jobText}
          <div class="table-cell-content">
            <span class="table-cell-text">{jobText}</span>
            <button
              type="button"
              class="table-cell-copy-btn"
              class:copied={app.copiedFieldKey === cellKey}
              onclick={(e) => {
                e.stopPropagation();
                app.copyFieldValue(cellKey, jobText);
                app.showTooltip(e, 'Copied!', 'right');
              }}
              onmouseenter={(e) =>
                app.showTooltip(
                  e,
                  app.copiedFieldKey === cellKey ? 'Copied!' : 'Copy job info',
                  'right',
                )}
              onmouseleave={app.hideTooltip}
              onblur={app.hideTooltip}
              aria-label="Copy job info"
            >
              <span class="material-symbols-outlined">
                {app.copiedFieldKey === cellKey ? 'check' : 'content_copy'}
              </span>
            </button>
          </div>
        {/if}
      </td>
    {:else if colKey === 'email'}
      {@const email = app.getPrimaryEmail(contact.payload)}
      {@const cellKey = `table-${contact.resource_name}-email`}
      <td>
        {#if email}
          <div class="table-cell-content">
            <a
              href="mailto:{email}"
              class="table-cell-link"
              onclick={(e) => e.stopPropagation()}
              aria-label="Send email to {email}"
            >
              {email}
            </a>
            <button
              type="button"
              class="table-cell-copy-btn"
              class:copied={app.copiedFieldKey === cellKey}
              onclick={(e) => {
                e.stopPropagation();
                app.copyFieldValue(cellKey, email);
                app.showTooltip(e, 'Copied!', 'right');
              }}
              onmouseenter={(e) =>
                app.showTooltip(
                  e,
                  app.copiedFieldKey === cellKey ? 'Copied!' : 'Copy email',
                  'right',
                )}
              onmouseleave={app.hideTooltip}
              onblur={app.hideTooltip}
              aria-label="Copy email"
            >
              <span class="material-symbols-outlined">
                {app.copiedFieldKey === cellKey ? 'check' : 'content_copy'}
              </span>
            </button>
          </div>
        {/if}
      </td>
    {:else if colKey === 'phone'}
      {@const phone = app.getPrimaryPhone(contact.payload)}
      {@const cellKey = `table-${contact.resource_name}-phone`}
      <td>
        {#if phone}
          <div class="table-cell-content">
            <a
              href="tel:{phone}"
              class="table-cell-link"
              onclick={(e) => e.stopPropagation()}
              aria-label="Call {phone}"
            >
              {phone}
            </a>
            <button
              type="button"
              class="table-cell-copy-btn"
              class:copied={app.copiedFieldKey === cellKey}
              onclick={(e) => {
                e.stopPropagation();
                app.copyFieldValue(cellKey, phone);
                app.showTooltip(e, 'Copied!', 'right');
              }}
              onmouseenter={(e) =>
                app.showTooltip(
                  e,
                  app.copiedFieldKey === cellKey ? 'Copied!' : 'Copy phone',
                  'right',
                )}
              onmouseleave={app.hideTooltip}
              onblur={app.hideTooltip}
              aria-label="Copy phone"
            >
              <span class="material-symbols-outlined">
                {app.copiedFieldKey === cellKey ? 'check' : 'content_copy'}
              </span>
            </button>
          </div>
        {/if}
      </td>
    {:else if colKey === 'birthday'}
      {@const bday = app.getBirthday(contact.payload)}
      {@const cellKey = `table-${contact.resource_name}-birthday`}
      <td>
        {#if bday}
          <div class="table-cell-content">
            <span class="table-cell-text">{bday}</span>
            <button
              type="button"
              class="table-cell-copy-btn"
              class:copied={app.copiedFieldKey === cellKey}
              onclick={(e) => {
                e.stopPropagation();
                app.copyFieldValue(cellKey, bday);
                app.showTooltip(e, 'Copied!', 'right');
              }}
              onmouseenter={(e) =>
                app.showTooltip(
                  e,
                  app.copiedFieldKey === cellKey ? 'Copied!' : 'Copy birthday',
                  'right',
                )}
              onmouseleave={app.hideTooltip}
              onblur={app.hideTooltip}
              aria-label="Copy birthday"
            >
              <span class="material-symbols-outlined">
                {app.copiedFieldKey === cellKey ? 'check' : 'content_copy'}
              </span>
            </button>
          </div>
        {/if}
      </td>
    {:else if colKey === 'labels'}
      <td class="labels-cell">
        <div class="labels-container">
          {#each app.getContactLabelItems(contact.payload) as lbl (lbl.resourceName)}
            {@const isSelected = app.selectedGroups.includes(lbl.resourceName)}
            <button
              type="button"
              class="label-chip"
              class:active={isSelected}
              onclick={(e) => {
                e.stopPropagation();
                app.toggleLabelFilter(lbl.resourceName);
                app.navigate('contacts');
              }}
              onmouseenter={(e) =>
                app.showTooltip(
                  e,
                  isSelected ? `Remove filter: ${lbl.name}` : `Filter by label: ${lbl.name}`,
                  'top',
                )}
              onmouseleave={app.hideTooltip}
              onblur={app.hideTooltip}
              aria-label="{isSelected ? 'Remove from filter: ' : 'Filter by label: '}{lbl.name}"
            >
              {lbl.name}
            </button>
          {/each}
        </div>
      </td>
    {:else if colKey === 'org'}
      {@const org = app.getOrganization(contact.payload).org}
      {@const cellKey = `table-${contact.resource_name}-org`}
      <td>
        {#if org}
          <div class="table-cell-content">
            <span class="table-cell-text">{org}</span>
            <button
              type="button"
              class="table-cell-copy-btn"
              class:copied={app.copiedFieldKey === cellKey}
              onclick={(e) => {
                e.stopPropagation();
                app.copyFieldValue(cellKey, org);
                app.showTooltip(e, 'Copied!', 'right');
              }}
              onmouseenter={(e) =>
                app.showTooltip(
                  e,
                  app.copiedFieldKey === cellKey ? 'Copied!' : 'Copy company',
                  'right',
                )}
              onmouseleave={app.hideTooltip}
              onblur={app.hideTooltip}
              aria-label="Copy company"
            >
              <span class="material-symbols-outlined">
                {app.copiedFieldKey === cellKey ? 'check' : 'content_copy'}
              </span>
            </button>
          </div>
        {/if}
      </td>
    {:else if colKey === 'title'}
      {@const title = app.getOrganization(contact.payload).title}
      {@const cellKey = `table-${contact.resource_name}-title`}
      <td>
        {#if title}
          <div class="table-cell-content">
            <span class="table-cell-text">{title}</span>
            <button
              type="button"
              class="table-cell-copy-btn"
              class:copied={app.copiedFieldKey === cellKey}
              onclick={(e) => {
                e.stopPropagation();
                app.copyFieldValue(cellKey, title);
                app.showTooltip(e, 'Copied!', 'right');
              }}
              onmouseenter={(e) =>
                app.showTooltip(
                  e,
                  app.copiedFieldKey === cellKey ? 'Copied!' : 'Copy job title',
                  'right',
                )}
              onmouseleave={app.hideTooltip}
              onblur={app.hideTooltip}
              aria-label="Copy job title"
            >
              <span class="material-symbols-outlined">
                {app.copiedFieldKey === cellKey ? 'check' : 'content_copy'}
              </span>
            </button>
          </div>
        {/if}
      </td>
    {:else if colKey === 'address'}
      {@const addr = app.getPrimaryAddress(contact.payload)}
      {@const cellKey = `table-${contact.resource_name}-address`}
      <td>
        {#if addr}
          <div class="table-cell-content">
            <a
              href={app.getMapsUrlFromAddress(addr)}
              class="table-cell-link"
              onclick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                api.openExternalUrl(app.getMapsUrlFromAddress(addr));
              }}
              aria-label="Open in Google Maps: {addr}"
            >
              {addr}
            </a>
            <button
              type="button"
              class="table-cell-copy-btn"
              class:copied={app.copiedFieldKey === cellKey}
              onclick={(e) => {
                e.stopPropagation();
                app.copyFieldValue(cellKey, addr);
                app.showTooltip(e, 'Copied!', 'right');
              }}
              onmouseenter={(e) =>
                app.showTooltip(
                  e,
                  app.copiedFieldKey === cellKey ? 'Copied!' : 'Copy address',
                  'right',
                )}
              onmouseleave={app.hideTooltip}
              onblur={app.hideTooltip}
              aria-label="Copy address"
            >
              <span class="material-symbols-outlined">
                {app.copiedFieldKey === cellKey ? 'check' : 'content_copy'}
              </span>
            </button>
          </div>
        {/if}
      </td>
    {:else if colKey === 'notes'}
      {@const notes = app.getNotes(contact.payload)}
      {@const cellKey = `table-${contact.resource_name}-notes`}
      <td>
        {#if notes}
          <div class="table-cell-content">
            <span class="table-cell-text">{notes}</span>
            <button
              type="button"
              class="table-cell-copy-btn"
              class:copied={app.copiedFieldKey === cellKey}
              onclick={(e) => {
                e.stopPropagation();
                app.copyFieldValue(cellKey, notes);
                app.showTooltip(e, 'Copied!', 'right');
              }}
              onmouseenter={(e) =>
                app.showTooltip(
                  e,
                  app.copiedFieldKey === cellKey ? 'Copied!' : 'Copy notes',
                  'right',
                )}
              onmouseleave={app.hideTooltip}
              onblur={app.hideTooltip}
              aria-label="Copy notes"
            >
              <span class="material-symbols-outlined">
                {app.copiedFieldKey === cellKey ? 'check' : 'content_copy'}
              </span>
            </button>
          </div>
        {/if}
      </td>
    {/if}
  {/each}
</tr>

<style>
  .contact-photo-change-toggle {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin: 4px 0 0 48px;
    padding: 2px 4px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--google-blue);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }
  .contact-photo-change-toggle:hover {
    background: var(--google-blue-surface);
  }
  .contact-photo-change-toggle:focus-visible {
    outline: 2px solid var(--google-blue);
    outline-offset: 2px;
  }
  .contact-photo-change-toggle .material-symbols-outlined {
    font-size: 15px;
  }
  .contact-photo-change-panel {
    margin: 8px 0 6px 48px;
  }
</style>
