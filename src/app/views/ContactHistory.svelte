<script lang="ts">
  import { computeContactDiff } from '../../lib/diff';
  import FieldChanges from '../../lib/FieldChanges.svelte';
  import type { AppModel } from '../model.svelte';
  let { app }: { app: AppModel } = $props();
</script>

{#if app.detail}
  <div class="history-log-card">
    <div class="history-card-header">
      <div style="display: flex; align-items: center; gap: 8px;">
        <h2 class="card-title" style="margin-bottom: 0;">History</h2>
        <span
          class="material-symbols-outlined"
          style="color: var(--google-text-secondary); font-size: 18px; cursor: help;"
          data-tooltip="A chronological log of every change captured for this contact"
          data-tooltip-pos="top">help</span
        >
      </div>
      {#if app.contactHistory.length > 0}
        <span class="history-count-pill"
          >{app.contactHistory.length}
          {app.contactHistory.length === 1 ? 'revision' : 'revisions'}</span
        >
      {/if}
    </div>

    <!-- Key Dates Bar: Last Edited & Added to Contacts -->
    <div class="history-dates-bar">
      <div class="date-stat-card">
        <div class="date-stat-header">
          <span class="material-symbols-outlined">edit_calendar</span>
          <span>Last edited</span>
        </div>
        <div class="date-stat-value">{app.detailLastEdited.date}</div>
        {#if app.detailLastEdited.relative}
          <div class="date-stat-relative">{app.detailLastEdited.relative}</div>
        {/if}
      </div>
      <div class="date-stat-card">
        <div class="date-stat-header">
          <span class="material-symbols-outlined">person_add</span>
          <span>First seen</span>
        </div>
        <div class="date-stat-value">{app.detailFirstSeen.date}</div>
        {#if app.detailFirstSeen.relative}
          <div class="date-stat-relative">{app.detailFirstSeen.relative}</div>
        {/if}
      </div>
    </div>

    <!-- Timeline Log Entries -->
    {#if app.loadingHistory}
      <div
        style="display: flex; align-items: center; justify-content: center; gap: 8px; padding: 24px; color: var(--google-text-secondary); font-size: 13px;"
      >
        <span class="material-symbols-outlined" style="animation: spin 1s linear infinite;"
          >sync</span
        >
        <span>Loading history log...</span>
      </div>
    {:else if app.contactHistory.length === 0}
      <div
        style="padding: 16px; text-align: center; color: var(--google-text-secondary); font-size: 13px;"
      >
        No prior revisions recorded.
      </div>
    {:else}
      <div class="history-log-timeline">
        {#each app.contactHistory as entry, idx (entry.version)}
          {@const isCurrent = entry.version === app.detail.version}
          {@const diff = computeContactDiff(entry.before, entry.after, app.groupMap)}
          {@const isExpanded = app.expandedHistoryVersions.has(entry.version)}
          <div class="history-entry-card" class:is-current={isCurrent}>
            <div class="history-entry-top">
              <div class="history-entry-meta">
                <span class="history-version-badge">Version #{entry.version}</span>
                {#if isCurrent}
                  <span class="history-tag modified">Viewing</span>
                {/if}
                <span class="history-entry-snapshot">Snapshot #{entry.sequence}</span>
              </div>
              <span class="history-entry-date">{app.formatCaptureTime(entry.committed_at)}</span>
            </div>

            {#if entry.after !== null && (entry.version !== app.detail.version || app.previewSequence !== entry.sequence)}
              <button
                type="button"
                class="history-preview-btn"
                disabled={app.previewBusy}
                onclick={() => app.previewContactRevision(entry)}
              >
                <span class="material-symbols-outlined">visibility</span>
                <span>Preview contact at this revision</span>
              </button>
            {/if}

            <div class="history-entry-badges">
              {#if entry.before === null}
                <span class="history-tag added">
                  <span class="material-symbols-outlined" style="font-size: 13px;">add_circle</span>
                  <span>First captured record</span>
                </span>
              {:else if entry.after === null}
                <span class="history-tag deleted">
                  <span class="material-symbols-outlined" style="font-size: 13px;">delete</span>
                  <span>Deleted</span>
                </span>
              {:else if diff.badges.length > 0}
                {#each diff.badges as badge}
                  <span class="history-tag {badge.type}">
                    <span class="material-symbols-outlined" style="font-size: 13px;"
                      >{badge.icon}</span
                    >
                    <span>{badge.label}</span>
                  </span>
                {/each}
              {:else}
                <span class="history-tag neutral">
                  <span>Verified in snapshot</span>
                </span>
              {/if}
            </div>

            {#if entry.before !== null && entry.after !== null && diff.groups.length > 0}
              <button
                type="button"
                class="history-diff-toggle-btn"
                onclick={() => app.toggleHistoryVersionExpanded(entry.version)}
              >
                <span class="material-symbols-outlined" style="font-size: 14px;"
                  >{isExpanded ? 'expand_less' : 'expand_more'}</span
                >
                <span>{isExpanded ? 'Hide changes' : 'Show changes'}</span>
              </button>
              {#if isExpanded}
                <div class="history-diff-content">
                  <FieldChanges before={entry.before} after={entry.after} labels={app.groupMap} />
                </div>
              {/if}
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}
