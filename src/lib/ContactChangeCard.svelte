<script lang="ts">
  import { computeContactDiff, extractDisplayName } from './diff';
  import { computeJsonDiff, type JsonDiffResult } from './json-diff';
  import type { Change } from './ipc';

  let {
    change,
    labels = new Map<string, string>(),
    avatarUrl = '',
    initiallyExpanded = false,
    showSnapshotBadge = false,
    snapshotSeq = null,
    committedAt = '',
  }: {
    change: Change;
    labels?: Map<string, string>;
    avatarUrl?: string;
    initiallyExpanded?: boolean;
    showSnapshotBadge?: boolean;
    snapshotSeq?: number | null;
    committedAt?: string;
  } = $props();

  let isExpanded = $state(false);
  $effect(() => {
    if (initiallyExpanded) isExpanded = true;
  });
  let showRawDiff = $state(false);
  let rawDiffViewMode = $state<'unified' | 'split'>('unified');
  let copiedJson = $state(false);
  let copiedDiff = $state(false);

  const diff = $derived(computeContactDiff(change.before, change.after, labels));
  const displayName = $derived(diff.displayName || change.resource_name);
  const jsonDiff = $derived<JsonDiffResult>(
    computeJsonDiff(
      change.before ? (diff.cleanBefore as Record<string, unknown>) : null,
      change.after ? (diff.cleanAfter as Record<string, unknown>) : null
    )
  );

  async function copyGitDiff() {
    try {
      await navigator.clipboard.writeText(jsonDiff.patch);
      copiedDiff = true;
      setTimeout(() => (copiedDiff = false), 2000);
    } catch (_) {}
  }

  const AVATAR_COLORS = [
    '#1a73e8', '#d93025', '#e37400', '#0f9d58', '#9334e6',
    '#0097a7', '#e91e63', '#5c6bc0', '#00897b', '#689f38',
  ];

  function getAvatarColor(str: string): string {
    if (!str) return AVATAR_COLORS[0];
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  }

  function getInitials(name: string): string {
    const parts = name.trim().split(/[\s@._-]+/).filter(Boolean);
    if (!parts.length) return '?';
    return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
  }

  async function copyJsonPayload() {
    const data = {
      resource_name: change.resource_name,
      kind: change.kind,
      version: change.version,
      before: diff.cleanBefore,
      after: diff.cleanAfter,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      copiedJson = true;
      setTimeout(() => (copiedJson = false), 2000);
    } catch (_) {}
  }

  function formatTime(isoStr?: string): string {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    return d.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
</script>

<div class="contact-change-card" class:expanded={isExpanded} class:kind-added={change.kind === 'added'} class:kind-removed={change.kind === 'removed'}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="change-card-main-header" onclick={() => (isExpanded = !isExpanded)}>
    <!-- Left: Avatar & Identity -->
    <div class="change-identity">
      <div class="change-avatar" style="background-color: {avatarUrl ? 'transparent' : getAvatarColor(displayName)};">
        {#if avatarUrl}
          <img src={avatarUrl} alt={displayName} class="change-avatar-img" />
        {:else}
          <span class="change-avatar-initials">{getInitials(displayName)}</span>
        {/if}
      </div>

      <div class="change-title-block">
        <div class="change-name-row">
          <span class="change-display-name">{displayName}</span>
          <span class="change-kind-badge {change.kind}">
            {#if change.kind === 'added'}
              <span class="material-symbols-outlined icon-micro">add_circle</span> Added
            {:else if change.kind === 'removed'}
              <span class="material-symbols-outlined icon-micro">remove_circle</span> Removed
            {:else}
              <span class="material-symbols-outlined icon-micro">edit</span> Changed
            {/if}
          </span>
          <span class="change-rev-badge">Rev #{change.version}</span>
          {#if showSnapshotBadge && snapshotSeq}
            <span class="change-snapshot-badge">
              <span class="material-symbols-outlined icon-micro">history</span> Snapshot #{snapshotSeq}
            </span>
          {/if}
        </div>

        <div class="change-sub-row">
          {#if committedAt}
            <span class="change-timestamp">{formatTime(committedAt)} · </span>
          {/if}
          <code class="change-resource-code">{change.resource_name}</code>
        </div>
      </div>
    </div>

    <!-- Right: Badges summary & expand button -->
    <div class="change-header-right">
      <div class="change-summary-badges">
        {#each diff.badges as badge}
          <span class="summary-badge-pill {badge.type}">
            <span class="material-symbols-outlined icon-micro">{badge.icon}</span>
            {badge.label}
          </span>
        {/each}
      </div>

      <button
        type="button"
        class="change-expand-btn"
        aria-label={isExpanded ? 'Collapse changes' : 'Expand changes'}
        title={isExpanded ? 'Collapse' : 'Expand'}
        onclick={(e) => {
          e.stopPropagation();
          isExpanded = !isExpanded;
        }}
      >
        <span class="material-symbols-outlined chevron" class:rotated={isExpanded}>expand_more</span>
      </button>
    </div>
  </div>

  <!-- Expanded Details Section -->
  {#if isExpanded}
    <div class="change-card-body">
      {#if change.kind === 'added'}
        <div class="state-banner banner-added">
          <span class="material-symbols-outlined icon-filled">person_add</span>
          <div>
            <strong>New Contact Created</strong>
            <p>This contact was added in this snapshot with the following information:</p>
          </div>
        </div>
      {:else if change.kind === 'removed'}
        <div class="state-banner banner-removed">
          <span class="material-symbols-outlined icon-filled">person_remove</span>
          <div>
            <strong>Contact Deleted</strong>
            <p>This contact was deleted in this snapshot. Last known information:</p>
          </div>
        </div>
      {/if}

      <!-- Visual Field Diff Groups -->
      {#if diff.groups.length > 0}
        <div class="diff-groups-container">
          {#each diff.groups as group}
            <div class="diff-group-card">
              <div class="diff-group-header">
                <span class="material-symbols-outlined group-icon">{group.icon}</span>
                <span class="group-title">{group.title}</span>
              </div>

              <div class="diff-group-items">
                {#each group.items as item}
                  {#if item.type === 'modified'}
                    <div class="diff-item-row modified">
                      {#if item.label}
                        <span class="diff-item-type-tag">{item.label}</span>
                      {/if}
                      <div class="diff-transition-box">
                        <div class="diff-before">
                          <span class="diff-state-tag old">Previous</span>
                          <span class="diff-val old-val">{item.before}</span>
                        </div>
                        <span class="material-symbols-outlined transition-arrow">arrow_forward</span>
                        <div class="diff-after">
                          <span class="diff-state-tag new">Updated</span>
                          <span class="diff-val new-val">{item.after}</span>
                        </div>
                      </div>
                    </div>
                  {:else if item.type === 'added'}
                    <div class="diff-item-row added">
                      <span class="diff-status-icon added">
                        <span class="material-symbols-outlined">add</span>
                      </span>
                      {#if item.label}
                        <span class="diff-item-type-tag added-tag">{item.label}:</span>
                      {/if}
                      <span class="diff-item-val">{item.text}</span>
                      <span class="diff-action-chip added">Added</span>
                    </div>
                  {:else if item.type === 'removed'}
                    <div class="diff-item-row removed">
                      <span class="diff-status-icon removed">
                        <span class="material-symbols-outlined">remove</span>
                      </span>
                      {#if item.label}
                        <span class="diff-item-type-tag removed-tag">{item.label}:</span>
                      {/if}
                      <span class="diff-item-val strikethrough">{item.text}</span>
                      <span class="diff-action-chip removed">Removed</span>
                    </div>
                  {/if}
                {/each}
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <div class="empty-diff-notice">
          <span class="material-symbols-outlined">info</span>
          <span>No visual field changes detected. Only internal sync metadata changed.</span>
        </div>
      {/if}

      <!-- Bottom Toolbar: Raw JSON Diff Toggle -->
      <div class="change-card-footer">
        <button
          type="button"
          class="raw-diff-toggle-btn"
          onclick={() => (showRawDiff = !showRawDiff)}
        >
          <span class="material-symbols-outlined">data_object</span>
          <span>{showRawDiff ? 'Hide Raw JSON' : 'Inspect Raw JSON Diff'}</span>
          {#if jsonDiff.stats.additions > 0 || jsonDiff.stats.deletions > 0}
            <span class="raw-diff-mini-badge-group">
              {#if jsonDiff.stats.additions > 0}
                <span class="mini-badge-add">+{jsonDiff.stats.additions}</span>
              {/if}
              {#if jsonDiff.stats.deletions > 0}
                <span class="mini-badge-del">-{jsonDiff.stats.deletions}</span>
              {/if}
            </span>
          {/if}
          <span class="material-symbols-outlined chevron-sm" class:rotated={showRawDiff}>expand_more</span>
        </button>
      </div>

      {#if showRawDiff}
        <div class="raw-diff-panel">
          <!-- Diff Toolbar -->
          <div class="raw-diff-toolbar">
            <div class="diff-summary-badges">
              <span class="diff-chip diff-chip-add" title="{jsonDiff.stats.additions} added lines">
                <span class="material-symbols-outlined chip-icon">add</span>
                {jsonDiff.stats.additions} {jsonDiff.stats.additions === 1 ? 'addition' : 'additions'}
              </span>
              <span class="diff-chip diff-chip-del" title="{jsonDiff.stats.deletions} deleted lines">
                <span class="material-symbols-outlined chip-icon">remove</span>
                {jsonDiff.stats.deletions} {jsonDiff.stats.deletions === 1 ? 'deletion' : 'deletions'}
              </span>
            </div>

            <div class="diff-controls">
              <!-- View Mode Toggle -->
              <div class="diff-view-mode-toggle" role="group" aria-label="Diff view mode">
                <button
                  type="button"
                  class="diff-view-mode-btn"
                  class:active={rawDiffViewMode === 'unified'}
                  onclick={() => (rawDiffViewMode = 'unified')}
                  title="Unified Git diff view"
                >
                  <span class="material-symbols-outlined icon-mode">view_agenda</span>
                  <span>Unified</span>
                </button>
                <button
                  type="button"
                  class="diff-view-mode-btn"
                  class:active={rawDiffViewMode === 'split'}
                  onclick={() => (rawDiffViewMode = 'split')}
                  title="Split side-by-side diff view"
                >
                  <span class="material-symbols-outlined icon-mode">vertical_split</span>
                  <span>Split</span>
                </button>
              </div>

              <!-- Action Buttons -->
              <button
                type="button"
                class="copy-json-btn"
                onclick={copyGitDiff}
                title="Copy Git-style diff patch"
              >
                <span class="material-symbols-outlined">{copiedDiff ? 'check' : 'difference'}</span>
                <span>{copiedDiff ? 'Copied Diff' : 'Copy Diff'}</span>
              </button>
              <button
                type="button"
                class="copy-json-btn"
                onclick={copyJsonPayload}
                title="Copy full JSON payload"
              >
                <span class="material-symbols-outlined">{copiedJson ? 'check' : 'content_copy'}</span>
                <span>{copiedJson ? 'Copied' : 'Copy JSON'}</span>
              </button>
            </div>
          </div>

          <!-- UNIFIED GIT DIFF VIEW -->
          {#if rawDiffViewMode === 'unified'}
            <div class="git-diff-container">
              <div class="git-diff-table" role="table">
                {#each jsonDiff.lines as line, idx (idx)}
                  <div class="git-diff-row diff-row-{line.type}" role="row">
                    <span class="git-diff-num git-diff-num-old" role="cell">
                      {line.oldLineNumber ?? ''}
                    </span>
                    <span class="git-diff-num git-diff-num-new" role="cell">
                      {line.newLineNumber ?? ''}
                    </span>
                    <span class="git-diff-marker" role="cell">
                      {#if line.type === 'add'}+{:else if line.type === 'del'}-{:else}&nbsp;{/if}
                    </span>
                    <span class="git-diff-code" role="cell">{line.text}</span>
                  </div>
                {:else}
                  <div class="git-diff-empty">No differences between revisions</div>
                {/each}
              </div>
            </div>
          {:else}
            <!-- SPLIT SIDE-BY-SIDE DIFF VIEW -->
            <div class="git-split-container">
              <div class="git-split-header">
                <div class="git-split-header-col">
                  <span class="diff-col-indicator before"></span>
                  <span>Before (Snapshot #{change.before ? 'Previous' : 'None'})</span>
                </div>
                <div class="git-split-header-col">
                  <span class="diff-col-indicator after"></span>
                  <span>After (Snapshot #{change.after ? 'Target' : 'Deleted'})</span>
                </div>
              </div>
              <div class="git-split-table">
                {#each jsonDiff.splitRows as row, idx (idx)}
                  <div class="git-split-row">
                    <div class="git-split-cell diff-cell-{row.left.type}">
                      <span class="git-diff-num">{row.left.lineNumber ?? ''}</span>
                      <span class="git-diff-marker">
                        {#if row.left.type === 'del'}-{:else}&nbsp;{/if}
                      </span>
                      <span class="git-diff-code">{row.left.text}</span>
                    </div>
                    <div class="git-split-cell diff-cell-{row.right.type}">
                      <span class="git-diff-num">{row.right.lineNumber ?? ''}</span>
                      <span class="git-diff-marker">
                        {#if row.right.type === 'add'}+{:else}&nbsp;{/if}
                      </span>
                      <span class="git-diff-code">{row.right.text}</span>
                    </div>
                  </div>
                {:else}
                  <div class="git-diff-empty">No differences between revisions</div>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .contact-change-card {
    background-color: var(--surface-base);
    border: 1px solid var(--google-border);
    border-radius: 12px;
    margin-bottom: 12px;
    transition: all 0.2s cubic-bezier(0.2, 0, 0, 1);
    overflow: hidden;
  }

  .contact-change-card:hover {
    border-color: var(--google-blue);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  }

  .contact-change-card.expanded {
    border-color: var(--google-blue);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  }

  /* Card Header */
  .change-card-main-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px;
    cursor: pointer;
    user-select: none;
    gap: 16px;
  }

  .change-identity {
    display: flex;
    align-items: center;
    gap: 14px;
    min-width: 0;
    flex: 1;
  }

  .change-avatar {
    width: 42px;
    height: 42px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: #ffffff;
    font-weight: 600;
    font-size: 15px;
    overflow: hidden;
  }

  .change-avatar-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .change-title-block {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .change-name-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }

  .change-display-name {
    font-size: 15px;
    font-weight: 600;
    color: var(--google-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .change-sub-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--google-text-secondary);
  }

  .change-resource-code {
    font-family: 'Consolas', 'Courier New', monospace;
    font-size: 11px;
    color: var(--google-text-tertiary);
    background: var(--google-surface);
    padding: 1px 5px;
    border-radius: 4px;
    max-width: 260px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Status Badges */
  .change-kind-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.2px;
    text-transform: uppercase;
  }

  .change-kind-badge.added {
    background-color: var(--success-surface);
    color: var(--success-text);
  }

  .change-kind-badge.changed {
    background-color: var(--google-blue-surface);
    color: var(--google-blue);
  }

  .change-kind-badge.removed {
    background-color: var(--google-danger-surface);
    color: var(--google-danger);
  }

  .change-rev-badge,
  .change-snapshot-badge {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 2px 7px;
    border-radius: 6px;
    background-color: var(--google-surface);
    color: var(--google-text-secondary);
    font-size: 11px;
    font-weight: 500;
    border: 1px solid var(--google-border-subtle);
  }

  .icon-micro {
    font-size: 13px !important;
  }

  /* Right Side Header Items */
  .change-header-right {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
  }

  .change-summary-badges {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .summary-badge-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 9px;
    border-radius: 14px;
    font-size: 11px;
    font-weight: 500;
    white-space: nowrap;
    border: 1px solid transparent;
  }

  .summary-badge-pill.added {
    background: var(--success-surface);
    color: var(--success-text);
    border-color: rgba(19, 115, 51, 0.2);
  }

  .summary-badge-pill.removed {
    background: var(--google-danger-surface);
    color: var(--google-danger);
    border-color: rgba(179, 38, 30, 0.2);
  }

  .summary-badge-pill.modified {
    background: var(--google-blue-surface);
    color: var(--google-blue);
    border-color: rgba(24, 90, 188, 0.2);
  }

  .change-expand-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: none;
    background: var(--google-surface);
    color: var(--google-text-secondary);
    cursor: pointer;
    transition: background-color 0.15s;
  }

  .change-expand-btn:hover {
    background: var(--google-surface-hover);
    color: var(--google-text);
  }

  .chevron {
    transition: transform 0.2s ease;
    font-size: 20px;
  }

  .chevron.rotated {
    transform: rotate(180deg);
  }

  /* Card Body */
  .change-card-body {
    padding: 0 18px 16px 18px;
    border-top: 1px solid var(--google-border-subtle);
  }

  /* State Banners */
  .state-banner {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px 14px;
    border-radius: 8px;
    margin-top: 14px;
    font-size: 13px;
    line-height: 1.4;
  }

  .state-banner .material-symbols-outlined {
    font-size: 22px;
    flex-shrink: 0;
  }

  .state-banner strong {
    font-size: 13px;
    display: block;
    margin-bottom: 2px;
  }

  .state-banner p {
    margin: 0;
    color: var(--google-text-secondary);
  }

  .banner-added {
    background: var(--success-surface);
    color: var(--success-text);
  }

  .banner-removed {
    background: var(--google-danger-surface);
    color: var(--google-danger);
  }

  /* Diff Groups Container */
  .diff-groups-container {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 14px;
  }

  .diff-group-card {
    background: var(--google-surface);
    border: 1px solid var(--google-border-subtle);
    border-radius: 8px;
    padding: 12px 14px;
  }

  .diff-group-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
  }

  .group-icon {
    font-size: 18px;
    color: var(--google-blue);
  }

  .group-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--google-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .diff-group-items {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .diff-item-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
  }

  .diff-item-row.modified {
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }

  .diff-transition-box {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    flex-wrap: wrap;
    background: var(--surface-base);
    border: 1px solid var(--google-border-subtle);
    border-radius: 6px;
    padding: 8px 12px;
  }

  .diff-before,
  .diff-after {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 140px;
  }

  .diff-state-tag {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  .diff-state-tag.old {
    color: var(--google-danger);
  }

  .diff-state-tag.new {
    color: var(--success-text);
  }

  .diff-val {
    font-size: 13px;
    font-weight: 500;
    line-height: 1.4;
    word-break: break-word;
  }

  .diff-val.old-val {
    color: var(--google-text-secondary);
    text-decoration: line-through;
    opacity: 0.85;
  }

  .diff-val.new-val {
    color: var(--google-text);
    font-weight: 600;
  }

  .transition-arrow {
    color: var(--google-text-secondary);
    font-size: 16px;
  }

  .diff-status-icon {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .diff-status-icon.added {
    background: var(--success-surface);
    color: var(--success-text);
  }

  .diff-status-icon.removed {
    background: var(--google-danger-surface);
    color: var(--google-danger);
  }

  .diff-status-icon .material-symbols-outlined {
    font-size: 14px;
  }

  .diff-item-type-tag {
    font-size: 12px;
    font-weight: 600;
    color: var(--google-text-secondary);
  }

  .diff-item-val {
    font-size: 13px;
    color: var(--google-text);
    flex: 1;
    word-break: break-word;
  }

  .diff-item-val.strikethrough {
    text-decoration: line-through;
    color: var(--google-text-secondary);
  }

  .diff-action-chip {
    font-size: 10px;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 4px;
    text-transform: uppercase;
  }

  .diff-action-chip.added {
    background: var(--success-surface);
    color: var(--success-text);
  }

  .diff-action-chip.removed {
    background: var(--google-danger-surface);
    color: var(--google-danger);
  }

  .empty-diff-notice {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 14px;
    padding: 12px;
    background: var(--google-surface);
    border-radius: 6px;
    color: var(--google-text-secondary);
    font-size: 12px;
  }

  /* Card Footer Toolbar */
  .change-card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid var(--google-border-subtle);
  }

  .raw-diff-toggle-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: none;
    font-size: 12px;
    font-weight: 500;
    color: var(--google-text-secondary);
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 6px;
    transition: background-color 0.15s, color 0.15s;
  }

  .raw-diff-toggle-btn:hover {
    background: var(--google-surface);
    color: var(--google-blue);
  }

  .raw-diff-toggle-btn .material-symbols-outlined {
    font-size: 16px;
  }

  .chevron-sm {
    font-size: 16px;
    transition: transform 0.2s ease;
  }

  .chevron-sm.rotated {
    transform: rotate(180deg);
  }

  .copy-json-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: var(--google-surface);
    border: 1px solid var(--google-border);
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 12px;
    font-weight: 500;
    color: var(--google-text-secondary);
    cursor: pointer;
    transition: all 0.15s;
  }

  .copy-json-btn:hover {
    background: var(--google-surface-hover);
    color: var(--google-text);
  }

  .copy-json-btn .material-symbols-outlined {
    font-size: 14px;
  }

  .raw-diff-mini-badge-group {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: 2px;
  }

  .mini-badge-add {
    display: inline-block;
    padding: 1px 5px;
    font-size: 10px;
    font-weight: 700;
    border-radius: 4px;
    background: var(--success-surface);
    color: var(--success-text);
    line-height: 1.2;
  }

  .mini-badge-del {
    display: inline-block;
    padding: 1px 5px;
    font-size: 10px;
    font-weight: 700;
    border-radius: 4px;
    background: var(--google-danger-surface);
    color: var(--google-danger);
    line-height: 1.2;
  }

  /* Raw JSON Inspection Panel */
  .raw-diff-panel {
    margin-top: 10px;
    border-radius: 8px;
    background: var(--surface-base);
    border: 1px solid var(--google-border);
    overflow: hidden;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
  }

  .raw-diff-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
    padding: 8px 12px;
    background: var(--google-surface);
    border-bottom: 1px solid var(--google-border);
  }

  .diff-summary-badges {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .diff-chip {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 12px;
    font-family: var(--font-family);
  }

  .diff-chip .chip-icon {
    font-size: 13px;
    font-weight: 700;
  }

  .diff-chip-add {
    background: var(--success-surface);
    color: var(--success-text);
  }

  .diff-chip-del {
    background: var(--google-danger-surface);
    color: var(--google-danger);
  }

  .diff-controls {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .diff-view-mode-toggle {
    display: inline-flex;
    background: var(--surface-base);
    border: 1px solid var(--google-border);
    border-radius: 6px;
    overflow: hidden;
  }

  .diff-view-mode-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: transparent;
    border: none;
    padding: 3px 8px;
    font-size: 11px;
    font-weight: 500;
    color: var(--google-text-secondary);
    cursor: pointer;
    transition: all 0.15s;
  }

  .diff-view-mode-btn.active {
    background: var(--google-blue-surface);
    color: var(--google-blue);
    font-weight: 600;
  }

  .diff-view-mode-btn .icon-mode {
    font-size: 14px;
  }

  /* Unified Git Diff */
  .git-diff-container {
    max-height: 420px;
    overflow-y: auto;
    overflow-x: auto;
    font-family: 'Consolas', 'Fira Code', 'Roboto Mono', 'Courier New', monospace;
    font-size: 12px;
    line-height: 1.55;
    background: var(--surface-base);
    user-select: text;
  }

  .git-diff-table {
    display: table;
    width: 100%;
    border-collapse: collapse;
  }

  .git-diff-row {
    display: table-row;
    transition: background-color 0.1s;
  }

  .git-diff-row:hover {
    filter: brightness(0.97);
  }

  .git-diff-num {
    display: table-cell;
    width: 38px;
    min-width: 38px;
    padding: 1px 6px;
    text-align: right;
    color: var(--google-text-tertiary);
    user-select: none;
    vertical-align: top;
    font-size: 11px;
    border-right: 1px solid var(--google-border-subtle);
  }

  .git-diff-num-old {
    background: rgba(0, 0, 0, 0.015);
  }

  .git-diff-num-new {
    background: rgba(0, 0, 0, 0.025);
    border-right: 1px solid var(--google-border);
  }

  .git-diff-marker {
    display: table-cell;
    width: 20px;
    min-width: 20px;
    padding: 1px 4px;
    text-align: center;
    user-select: none;
    font-weight: 700;
    vertical-align: top;
  }

  .git-diff-code {
    display: table-cell;
    padding: 1px 8px;
    white-space: pre-wrap;
    word-break: break-all;
    vertical-align: top;
  }

  /* Git colors for addition (+) */
  .diff-row-add {
    background-color: #e6f4ea;
    color: #137333;
  }

  .diff-row-add .git-diff-num-new {
    color: #137333;
    font-weight: 600;
  }

  .diff-row-add .git-diff-marker {
    color: #137333;
  }

  .diff-row-add .git-diff-code {
    color: #137333;
  }

  /* Git colors for deletion (-) */
  .diff-row-del {
    background-color: #fce8e6;
    color: #b3261e;
  }

  .diff-row-del .git-diff-num-old {
    color: #b3261e;
    font-weight: 600;
  }

  .diff-row-del .git-diff-marker {
    color: #b3261e;
  }

  .diff-row-del .git-diff-code {
    color: #b3261e;
  }

  /* Split side-by-side diff */
  .git-split-container {
    max-height: 420px;
    overflow-y: auto;
    overflow-x: auto;
    font-family: 'Consolas', 'Fira Code', 'Roboto Mono', 'Courier New', monospace;
    font-size: 12px;
    line-height: 1.55;
    background: var(--surface-base);
    user-select: text;
  }

  .git-split-header {
    display: grid;
    grid-template-columns: 1fr 1fr;
    background: var(--google-surface);
    border-bottom: 1px solid var(--google-border);
    position: sticky;
    top: 0;
    z-index: 1;
  }

  .git-split-header-col {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    font-family: var(--font-family);
    font-size: 11px;
    font-weight: 600;
    color: var(--google-text-secondary);
    text-transform: uppercase;
  }

  .git-split-header-col + .git-split-header-col {
    border-left: 1px solid var(--google-border);
  }

  .diff-col-indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .diff-col-indicator.before {
    background: var(--google-danger);
  }

  .diff-col-indicator.after {
    background: var(--success-text);
  }

  .git-split-table {
    display: flex;
    flex-direction: column;
    width: 100%;
  }

  .git-split-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .git-split-row:hover {
    filter: brightness(0.97);
  }

  .git-split-cell {
    display: flex;
    align-items: flex-start;
    min-width: 0;
    padding: 1px 0;
    overflow: hidden;
  }

  .git-split-cell + .git-split-cell {
    border-left: 1px solid var(--google-border);
  }

  .git-split-cell .git-diff-num {
    display: inline-block;
    width: 36px;
    min-width: 36px;
    flex-shrink: 0;
    padding: 1px 6px;
    text-align: right;
    color: var(--google-text-tertiary);
    user-select: none;
    font-size: 11px;
    border-right: 1px solid var(--google-border-subtle);
  }

  .git-split-cell .git-diff-marker {
    display: inline-block;
    width: 16px;
    min-width: 16px;
    flex-shrink: 0;
    text-align: center;
    user-select: none;
    font-weight: 700;
  }

  .git-split-cell .git-diff-code {
    display: inline-block;
    padding: 1px 6px;
    white-space: pre-wrap;
    word-break: break-all;
    flex-grow: 1;
  }

  .diff-cell-add {
    background-color: #e6f4ea;
    color: #137333;
  }

  .diff-cell-add .git-diff-num,
  .diff-cell-add .git-diff-marker,
  .diff-cell-add .git-diff-code {
    color: #137333;
  }

  .diff-cell-del {
    background-color: #fce8e6;
    color: #b3261e;
  }

  .diff-cell-del .git-diff-num,
  .diff-cell-del .git-diff-marker,
  .diff-cell-del .git-diff-code {
    color: #b3261e;
  }

  .diff-cell-empty {
    background-color: rgba(0, 0, 0, 0.02);
  }

  .git-diff-empty {
    padding: 20px;
    text-align: center;
    color: var(--google-text-secondary);
    font-family: var(--font-family);
    font-size: 13px;
  }
</style>
