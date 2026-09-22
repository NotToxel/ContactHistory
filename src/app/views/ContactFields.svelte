<script lang="ts">
  import ContactHistory from './ContactHistory.svelte';
  import { api } from '../../lib/ipc';
  import type { AppModel } from '../model.svelte';
  let { app }: { app: AppModel } = $props();
</script>

{#if app.detail}
  <div class="detail-cards-grid">
    <!-- Left Column: Contact Details + Relocated Archive Snapshot -->
    <div class="detail-column-left">
      <div class="detail-card">
        <h2 class="card-title">Contact details</h2>
        <div class="field-list">
          {#if app.getAllEmails(app.detail.payload).length === 0}
            <div class="field-item">
              <span class="material-symbols-outlined field-icon">mail</span>
              <div class="field-content">
                <span class="field-value field-placeholder">Add email</span>
              </div>
            </div>
          {:else}
            {#each app.getAllEmails(app.detail.payload) as email, idx}
              <div class="field-item" data-context="email" data-email-value={email.value}>
                <!-- Show icon only on first email row; spacer on subsequent rows -->
                {#if idx === 0}
                  <span class="material-symbols-outlined field-icon">mail</span>
                {:else}
                  <span class="field-icon-spacer"></span>
                {/if}
                <div class="field-content">
                  <a href="mailto:{email.value}" class="field-value">{email.value}</a>
                  <span class="field-meta">• {email.type}</span>
                  <div class="field-actions">
                    <button
                      class="field-copy-btn"
                      data-tooltip="Copy email"
                      data-tooltip-pos="top"
                      aria-label="Copy email"
                      onclick={() => app.copyFieldValue(`email-${idx}`, email.value)}
                    >
                      <span class="material-symbols-outlined">content_copy</span>
                    </button>
                    {#if app.copiedFieldKey === `email-${idx}`}
                      <div class="copy-popup-badge">
                        <span class="material-symbols-outlined" style="font-size: 13px;">check</span
                        >
                        <span>Copied!</span>
                      </div>
                    {/if}
                  </div>
                </div>
              </div>
            {/each}
          {/if}

          {#each app.getAllPhones(app.detail.payload) as phone, idx}
            <div class="field-item" data-context="phone" data-phone-value={phone.value}>
              <!-- Show icon only on first phone row; spacer on subsequent rows -->
              {#if idx === 0}
                <span class="material-symbols-outlined field-icon">call</span>
              {:else}
                <span class="field-icon-spacer"></span>
              {/if}
              <div class="field-content">
                <a href="tel:{phone.value}" class="field-value">{phone.formatted || phone.value}</a>
                <span class="field-meta">• {phone.type}</span>
                <div class="field-actions">
                  <button
                    class="field-copy-btn"
                    data-tooltip="Copy phone"
                    data-tooltip-pos="top"
                    aria-label="Copy phone"
                    onclick={() => app.copyFieldValue(`phone-${idx}`, phone.value)}
                  >
                    <span class="material-symbols-outlined">content_copy</span>
                  </button>
                  {#if app.copiedFieldKey === `phone-${idx}`}
                    <div class="copy-popup-badge">
                      <span class="material-symbols-outlined" style="font-size: 13px;">check</span>
                      <span>Copied!</span>
                    </div>
                  {/if}
                </div>
              </div>
            </div>
          {/each}

          {#if app.getBirthday(app.detail.payload)}
            <div class="field-item">
              <span class="material-symbols-outlined field-icon">cake</span>
              <div class="field-content">
                <span class="field-value text-plain">{app.getBirthday(app.detail.payload)}</span>
                <span class="field-meta">• Birthday</span>
                <div class="field-actions">
                  <button
                    class="field-copy-btn"
                    data-tooltip="Copy birthday"
                    data-tooltip-pos="top"
                    aria-label="Copy birthday"
                    onclick={() =>
                      app.copyFieldValue('birthday', app.getBirthday(app.detail!.payload))}
                  >
                    <span class="material-symbols-outlined">content_copy</span>
                  </button>
                  {#if app.copiedFieldKey === 'birthday'}
                    <div class="copy-popup-badge">
                      <span class="material-symbols-outlined" style="font-size: 13px;">check</span>
                      <span>Copied!</span>
                    </div>
                  {/if}
                </div>
              </div>
            </div>
          {/if}

          {#if app.getNickname(app.detail.payload)}
            <div class="field-item">
              <span class="material-symbols-outlined field-icon">person</span>
              <div class="field-content">
                <span class="field-value text-plain">{app.getNickname(app.detail.payload)}</span>
                <span class="field-meta">• Nickname</span>
                <div class="field-actions">
                  <button
                    class="field-copy-btn"
                    data-tooltip="Copy nickname"
                    data-tooltip-pos="top"
                    aria-label="Copy nickname"
                    onclick={() =>
                      app.copyFieldValue('nickname', app.getNickname(app.detail!.payload))}
                  >
                    <span class="material-symbols-outlined">content_copy</span>
                  </button>
                  {#if app.copiedFieldKey === 'nickname'}
                    <div class="copy-popup-badge">
                      <span class="material-symbols-outlined" style="font-size: 13px;">check</span>
                      <span>Copied!</span>
                    </div>
                  {/if}
                </div>
              </div>
            </div>
          {/if}

          {#if app.getOrganization(app.detail.payload).org || app.getOrganization(app.detail.payload).title}
            {@const orgInfo = [
              app.getOrganization(app.detail.payload).title,
              app.getOrganization(app.detail.payload).org,
            ]
              .filter(Boolean)
              .join(' at ')}
            <div class="field-item">
              <span class="material-symbols-outlined field-icon">domain</span>
              <div class="field-content">
                <span class="field-value text-plain">{orgInfo}</span>
                <span class="field-meta">• Job info</span>
                <div class="field-actions">
                  <button
                    class="field-copy-btn"
                    data-tooltip="Copy job info"
                    data-tooltip-pos="top"
                    aria-label="Copy job info"
                    onclick={() => app.copyFieldValue('org', orgInfo)}
                  >
                    <span class="material-symbols-outlined">content_copy</span>
                  </button>
                  {#if app.copiedFieldKey === 'org'}
                    <div class="copy-popup-badge">
                      <span class="material-symbols-outlined" style="font-size: 13px;">check</span>
                      <span>Copied!</span>
                    </div>
                  {/if}
                </div>
              </div>
            </div>
          {/if}

          {#each app.getAllAddresses(app.detail.payload) as addr, idx}
            <div class="field-item field-item--multiline">
              {#if idx === 0}
                <span
                  class="material-symbols-outlined field-icon"
                  style="align-self: flex-start; margin-top: 1px;">location_on</span
                >
              {:else}
                <span class="field-icon-spacer" style="align-self: flex-start;"></span>
              {/if}
              <div
                class="field-content field-content--address"
                data-context="address"
                data-address-value={addr.copyValue}
              >
                <div class="field-address-text">
                  {#if addr.lines.length > 1}
                    <a
                      class="field-address-lines field-address-link"
                      href={app.getAddressMapsUrl(addr)}
                      onclick={(e) => {
                        e.preventDefault();
                        api.openExternalUrl(app.getAddressMapsUrl(addr));
                      }}
                      tabindex="-1"
                    >
                      {#each addr.lines.slice(0, -1) as line}
                        <span class="field-value field-address-line">{line}</span>
                      {/each}
                    </a>
                  {/if}
                  <div class="field-address-last-line">
                    <a
                      class="field-address-link"
                      href={app.getAddressMapsUrl(addr)}
                      onclick={(e) => {
                        e.preventDefault();
                        api.openExternalUrl(app.getAddressMapsUrl(addr));
                      }}
                      aria-label="Open {addr.copyValue} in Google Maps"
                      ><span class="field-value field-address-line"
                        >{addr.lines[addr.lines.length - 1]}</span
                      ></a
                    >
                    <span class="field-meta" title={addr.type}>• {addr.type}</span>
                  </div>
                </div>
                <div class="field-actions field-address-actions">
                  <button
                    class="field-copy-btn"
                    data-tooltip="Copy address"
                    data-tooltip-pos="top"
                    aria-label="Copy address"
                    onclick={() => app.copyFieldValue(`address-${idx}`, addr.copyValue)}
                  >
                    <span class="material-symbols-outlined">content_copy</span>
                  </button>
                  <button
                    class="field-copy-btn"
                    data-tooltip="Open in Google Maps"
                    data-tooltip-pos="top"
                    aria-label="Open in Google Maps"
                    onclick={() => api.openExternalUrl(app.getAddressMapsUrl(addr))}
                  >
                    <span class="material-symbols-outlined">open_in_new</span>
                  </button>
                  {#if app.copiedFieldKey === `address-${idx}`}
                    <div class="copy-popup-badge">
                      <span class="material-symbols-outlined" style="font-size: 13px;">check</span>
                      <span>Copied!</span>
                    </div>
                  {/if}
                </div>
              </div>
            </div>
          {/each}

          {#if app.getNotes(app.detail.payload)}
            {@const notes = app.getNotes(app.detail.payload)}
            <div class="field-item" data-context="notes" data-notes-value={notes}>
              <span class="material-symbols-outlined field-icon">notes</span>
              <div class="field-content">
                <span class="field-value text-plain" style="white-space: pre-wrap;">{notes}</span>
                <span class="field-meta">• Notes</span>
                <div class="field-actions">
                  <button
                    class="field-copy-btn"
                    data-tooltip="Copy notes"
                    data-tooltip-pos="top"
                    aria-label="Copy notes"
                    onclick={() => app.copyFieldValue('notes', notes)}
                  >
                    <span class="material-symbols-outlined">content_copy</span>
                  </button>
                  {#if app.copiedFieldKey === 'notes'}
                    <div class="copy-popup-badge">
                      <span class="material-symbols-outlined" style="font-size: 13px;">check</span>
                      <span>Copied!</span>
                    </div>
                  {/if}
                </div>
              </div>
            </div>
          {/if}

          <!-- ── Events (non-birthday: anniversaries, custom, etc.) ── -->
          {#each app.getAllEvents(app.detail.payload) as evt, idx}
            <div class="field-item">
              {#if idx === 0}
                <span class="material-symbols-outlined field-icon">event</span>
              {:else}
                <span class="field-icon-spacer"></span>
              {/if}
              <div class="field-content">
                <span class="field-value text-plain">{evt.date}</span>
                <span class="field-meta">• {evt.type}</span>
                <div class="field-actions">
                  <button
                    class="field-copy-btn"
                    data-tooltip="Copy date"
                    data-tooltip-pos="top"
                    aria-label="Copy date"
                    onclick={() => app.copyFieldValue(`event-${idx}`, evt.date)}
                  >
                    <span class="material-symbols-outlined">content_copy</span>
                  </button>
                  {#if app.copiedFieldKey === `event-${idx}`}
                    <div class="copy-popup-badge">
                      <span class="material-symbols-outlined" style="font-size: 13px;">check</span>
                      <span>Copied!</span>
                    </div>
                  {/if}
                </div>
              </div>
            </div>
          {/each}

          <!-- ── Related People ──────────────────────────────────────── -->
          {#each app.getAllRelations(app.detail.payload) as rel, idx}
            <div class="field-item">
              {#if idx === 0}
                <span class="material-symbols-outlined field-icon">group</span>
              {:else}
                <span class="field-icon-spacer"></span>
              {/if}
              <div class="field-content">
                <span class="field-value text-plain">{rel.name}</span>
                <span class="field-meta">• {rel.type}</span>
                <div class="field-actions">
                  <button
                    class="field-copy-btn"
                    data-tooltip="Copy name"
                    data-tooltip-pos="top"
                    aria-label="Copy name"
                    onclick={() => app.copyFieldValue(`rel-${idx}`, rel.name)}
                  >
                    <span class="material-symbols-outlined">content_copy</span>
                  </button>
                  {#if app.copiedFieldKey === `rel-${idx}`}
                    <div class="copy-popup-badge">
                      <span class="material-symbols-outlined" style="font-size: 13px;">check</span>
                      <span>Copied!</span>
                    </div>
                  {/if}
                </div>
              </div>
            </div>
          {/each}

          <!-- ── Websites / URLs ─────────────────────────────────────── -->
          {#each app.getAllUrls(app.detail.payload) as url, idx}
            <div class="field-item">
              {#if idx === 0}
                <span class="material-symbols-outlined field-icon">link</span>
              {:else}
                <span class="field-icon-spacer"></span>
              {/if}
              <div class="field-content">
                <a
                  class="field-value"
                  href={url.url}
                  onclick={(e) => {
                    e.preventDefault();
                    api.openExternalUrl(url.url);
                  }}>{url.url}</a
                >
                <span class="field-meta">• {url.type}</span>
                <div class="field-actions">
                  <button
                    class="field-copy-btn"
                    data-tooltip="Copy URL"
                    data-tooltip-pos="top"
                    aria-label="Copy URL"
                    onclick={() => app.copyFieldValue(`url-${idx}`, url.url)}
                  >
                    <span class="material-symbols-outlined">content_copy</span>
                  </button>
                  <button
                    class="field-copy-btn"
                    data-tooltip="Open URL"
                    data-tooltip-pos="top"
                    aria-label="Open URL"
                    onclick={() => api.openExternalUrl(url.url)}
                  >
                    <span class="material-symbols-outlined">open_in_new</span>
                  </button>
                  {#if app.copiedFieldKey === `url-${idx}`}
                    <div class="copy-popup-badge">
                      <span class="material-symbols-outlined" style="font-size: 13px;">check</span>
                      <span>Copied!</span>
                    </div>
                  {/if}
                </div>
              </div>
            </div>
          {/each}

          <!-- ── Custom / User-Defined Fields ───────────────────────── -->
          {#each app.getAllUserDefined(app.detail.payload) as ud, idx}
            <div class="field-item">
              {#if idx === 0}
                <span class="material-symbols-outlined field-icon">list_alt</span>
              {:else}
                <span class="field-icon-spacer"></span>
              {/if}
              <div class="field-content">
                <span class="field-value text-plain">{ud.value}</span>
                <span class="field-meta">• {ud.key}</span>
                <div class="field-actions">
                  <button
                    class="field-copy-btn"
                    data-tooltip="Copy value"
                    data-tooltip-pos="top"
                    aria-label="Copy value"
                    onclick={() => app.copyFieldValue(`ud-${idx}`, ud.value)}
                  >
                    <span class="material-symbols-outlined">content_copy</span>
                  </button>
                  {#if app.copiedFieldKey === `ud-${idx}`}
                    <div class="copy-popup-badge">
                      <span class="material-symbols-outlined" style="font-size: 13px;">check</span>
                      <span>Copied!</span>
                    </div>
                  {/if}
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>

      <!-- Relocated Archive Snapshot Card (Left Column) -->
      <div class="snapshot-card">
        <h2 class="card-title">
          <span>Archive Snapshot</span>
          <span
            class="material-symbols-outlined"
            style="color: var(--google-blue); font-size: 18px;">verified</span
          >
        </h2>
        <div class="snapshot-info-grid">
          <div class="snapshot-info-row">
            <span class="snapshot-info-label">
              <span class="material-symbols-outlined" style="font-size: 16px;">photo_library</span>
              <span>{app.previewSequence === null ? 'Selected Snapshot' : 'Preview Snapshot'}</span>
            </span>
            <span class="snapshot-info-value"
              >Snapshot #{app.previewSequence ?? app.capture?.sequence}</span
            >
          </div>
          <div class="snapshot-info-row">
            <span class="snapshot-info-label">
              <span class="material-symbols-outlined" style="font-size: 16px;">calendar_today</span>
              <span>Captured Date</span>
            </span>
            <span class="snapshot-info-value"
              >{app.formatCaptureTime(
                app.previewSequence === null
                  ? app.capture?.committed_at
                  : app.contactHistory.find((entry) => entry.sequence === app.previewSequence)
                      ?.committed_at,
              )}</span
            >
          </div>
          <div class="snapshot-info-row">
            <span class="snapshot-info-label">
              <span class="material-symbols-outlined" style="font-size: 16px;">tag</span>
              <span>Snapshot Revision</span>
            </span>
            <span class="snapshot-info-value">#{app.detail.version}</span>
          </div>
          <div class="snapshot-info-row">
            <span class="snapshot-info-label">
              <span class="material-symbols-outlined" style="font-size: 16px;">fingerprint</span>
              <span>Resource</span>
            </span>
            <span class="snapshot-info-value"><code>{app.detail.resource_name}</code></span>
          </div>
        </div>
      </div>
    </div>

    <!-- Right Card: Full History Log with Last Edited & First Seen Dates -->
    <ContactHistory {app} />
  </div>
{/if}
