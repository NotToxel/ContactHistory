<script lang="ts">
  import { api, type Contact } from '../../lib/ipc';
  import type { AppModel } from '../model.svelte';
  let { app, contact }: { app: AppModel; contact: Contact } = $props();
</script>

<tr
  class="contact-row"
  class:is-selected={app.selectedContactKeys.includes(contact.resource_name)}
  data-contact-res={contact.resource_name}
  onclick={() => app.selectContact(contact)}
>
  {#each app.activeColKeys as colKey}
    {#if colKey === 'name'}
      <td>
        <div class="name-cell-content">
          <div
            class="avatar-select-container"
            class:selected={app.selectedContactKeys.includes(contact.resource_name)}
            onclick={(e) => app.toggleContactSelection(contact.resource_name, e)}
            onkeydown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation();
                e.preventDefault();
                app.toggleContactSelection(contact.resource_name);
              }
            }}
            role="checkbox"
            aria-checked={app.selectedContactKeys.includes(contact.resource_name)}
            tabindex="0"
            title={app.selectedContactKeys.includes(contact.resource_name)
              ? 'Deselect contact'
              : 'Select contact'}
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
              class:checked={app.selectedContactKeys.includes(contact.resource_name)}
            >
              {#if app.selectedContactKeys.includes(contact.resource_name)}
                <span class="material-symbols-outlined check-icon">check</span>
              {/if}
            </div>
          </div>
          <span class="name-text">{app.getDisplayName(contact)}</span>
        </div>
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
