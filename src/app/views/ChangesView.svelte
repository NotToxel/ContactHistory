<script lang="ts">
  import SnapshotSelect from '../../lib/SnapshotSelect.svelte';
  import ContactChangeCard from '../../lib/ContactChangeCard.svelte';

  import type { AppModel } from '../model.svelte';
  let { app }: { app: AppModel } = $props();
</script>

<!-- Changes & Changelog View -->
<div class="view-header" style="border-bottom: none; padding-bottom: 4px;">
  <h1 class="view-title">
    {#if app.changesTab === 'comparison'}
      {#if app.compareBaseSeq && app.compareTargetSeq && app.compareBaseSeq !== app.compareTargetSeq}
        Snapshot Comparison: #{app.compareBaseSeq} → #{app.compareTargetSeq}
      {:else}
        Changes in Snapshot #{app.capture?.sequence}
      {/if}
    {:else}
      Entire Changelog
    {/if}
  </h1>

  <!-- Segmented Tab Navigation -->
  <div class="segmented-nav-group" role="tablist">
    <button
      type="button"
      role="tab"
      aria-selected={app.changesTab === 'comparison'}
      class="segmented-nav-btn"
      class:active={app.changesTab === 'comparison'}
      onclick={() => {
        app.changesTab = 'comparison';
        app.recordNavigation();
      }}
    >
      <span class="material-symbols-outlined">compare_arrows</span>
      <span>Snapshot Comparison</span>
    </button>
    <button
      type="button"
      role="tab"
      aria-selected={app.changesTab === 'changelog'}
      class="segmented-nav-btn"
      class:active={app.changesTab === 'changelog'}
      onclick={() => {
        app.changesTab = 'changelog';
        app.recordNavigation();
        if (app.changelogList.length === 0) app.refreshAllChanges();
      }}
    >
      <span class="material-symbols-outlined">history</span>
      <span>Entire Changelog</span>
      {#if app.changelogList.length > 0}
        <span class="filter-pill-count">{app.changelogList.length}</span>
      {/if}
    </button>
  </div>
</div>

<div class="changes-container">
  {#if app.changesTab === 'comparison'}
    <!-- TAB 1: SNAPSHOT COMPARISON -->
    {#if app.captures.length > 1}
      <div class="comparison-bar">
        <SnapshotSelect
          label="Base snapshot"
          captures={app.captures}
          value={app.compareBaseSeq}
          onchange={(value) => {
            app.compareBaseSeq = value;
            app.refreshChangesComparison();
            app.recordNavigation();
          }}
        />

        <button
          type="button"
          class="compare-swap-btn"
          title="Swap base and target snapshots"
          aria-label="Swap snapshots"
          onclick={app.swapComparisonSnapshots}
        >
          <span class="material-symbols-outlined">swap_horiz</span>
        </button>

        <SnapshotSelect
          label="Compare with"
          captures={app.captures}
          value={app.compareTargetSeq}
          onchange={(value) => {
            app.compareTargetSeq = value;
            app.refreshChangesComparison();
            app.recordNavigation();
          }}
        />

        <div class="compare-presets" role="group" aria-label="Comparison shortcuts">
          <button
            type="button"
            class="compare-quick-btn"
            onclick={() => {
              if (app.capture) {
                const curSeq = app.capture.sequence;
                app.compareTargetSeq = curSeq;
                const prior = app.captures.find((c) => c.sequence < curSeq);
                app.compareBaseSeq = prior ? prior.sequence : curSeq;
                app.refreshChangesComparison();
                app.recordNavigation();
              }
            }}
          >
            Compare with previous
          </button>
          <button
            type="button"
            class="compare-quick-btn"
            onclick={() => {
              if (app.captures.length >= 2) {
                app.compareBaseSeq = app.captures[app.captures.length - 1].sequence;
                app.compareTargetSeq = app.captures[0].sequence;
                app.refreshChangesComparison();
                app.recordNavigation();
              }
            }}
          >
            Earliest vs Latest
          </button>
        </div>
      </div>
    {/if}

    <!-- Summary Metrics & Filter Toolbar -->
    {#if app.changes.length > 0}
      <div class="changes-stats-row">
        <div class="stat-chip">
          <strong>{app.comparisonStats.total}</strong>
          <span class="label">Total {app.comparisonStats.total === 1 ? 'Change' : 'Changes'}</span>
        </div>
        {#if app.comparisonStats.added > 0}
          <div class="stat-chip added">
            <span class="material-symbols-outlined icon-micro">add_circle</span>
            <strong>+{app.comparisonStats.added}</strong>
            <span class="label">Added</span>
          </div>
        {/if}
        {#if app.comparisonStats.changed > 0}
          <div class="stat-chip changed">
            <span class="material-symbols-outlined icon-micro">edit</span>
            <strong>~{app.comparisonStats.changed}</strong>
            <span class="label">Modified</span>
          </div>
        {/if}
        {#if app.comparisonStats.removed > 0}
          <div class="stat-chip removed">
            <span class="material-symbols-outlined icon-micro">remove_circle</span>
            <strong>-{app.comparisonStats.removed}</strong>
            <span class="label">Removed</span>
          </div>
        {/if}
      </div>

      <div class="changes-filter-toolbar">
        <div class="changes-search-box">
          <span class="material-symbols-outlined">search</span>
          <input
            type="text"
            class="changes-search-input"
            placeholder="Filter comparison changes..."
            bind:value={app.comparisonSearch}
          />
          {#if app.comparisonSearch}
            <button
              type="button"
              class="icon-btn"
              style="width: 24px; height: 24px;"
              onclick={() => (app.comparisonSearch = '')}
            >
              <span class="material-symbols-outlined" style="font-size: 16px;">close</span>
            </button>
          {/if}
        </div>

        <div class="filter-pills-row">
          <button
            type="button"
            class="filter-pill"
            class:active={app.comparisonKindFilter === 'all'}
            onclick={() => (app.comparisonKindFilter = 'all')}
          >
            All <span class="filter-pill-count">{app.changes.length}</span>
          </button>
          {#if app.comparisonStats.added > 0}
            <button
              type="button"
              class="filter-pill"
              class:active={app.comparisonKindFilter === 'added'}
              onclick={() => (app.comparisonKindFilter = 'added')}
            >
              Added <span class="filter-pill-count">{app.comparisonStats.added}</span>
            </button>
          {/if}
          {#if app.comparisonStats.changed > 0}
            <button
              type="button"
              class="filter-pill"
              class:active={app.comparisonKindFilter === 'changed'}
              onclick={() => (app.comparisonKindFilter = 'changed')}
            >
              Modified <span class="filter-pill-count">{app.comparisonStats.changed}</span>
            </button>
          {/if}
          {#if app.comparisonStats.removed > 0}
            <button
              type="button"
              class="filter-pill"
              class:active={app.comparisonKindFilter === 'removed'}
              onclick={() => (app.comparisonKindFilter = 'removed')}
            >
              Removed <span class="filter-pill-count">{app.comparisonStats.removed}</span>
            </button>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Changes Card List -->
    {#each app.filteredComparisonChanges as change (change.resource_name + '-' + change.version)}
      <ContactChangeCard
        {change}
        labels={app.groupMap}
        avatarUrl={app.getAvatarSource(
          {
            resource_name: change.resource_name,
            display_name: '',
            payload: change.after || change.before || {},
            version: change.version,
          },
          app.media,
        )}
        birthdayFormat={app.preferences.birthdayFormat}
      />
    {/each}

    {#if app.changes.length === 0}
      <div class="empty-state">
        <span
          class="material-symbols-outlined"
          style="font-size: 48px; color: var(--google-text-secondary); margin-bottom: 12px;"
          >history_toggle_off</span
        >
        <h3 class="empty-state-title">No changes recorded</h3>
        <p class="empty-state-desc">
          {#if app.compareBaseSeq && app.compareTargetSeq && app.compareBaseSeq === app.compareTargetSeq}
            Base snapshot and Target snapshot are identical. Select two different snapshots above to
            compare them.
          {:else}
            No contacts were added, modified, or removed between Snapshot #{app.compareBaseSeq} and Snapshot
            #{app.compareTargetSeq}.
          {/if}
        </p>
      </div>
    {:else if app.filteredComparisonChanges.length === 0}
      <div class="empty-state" style="padding: 40px 20px;">
        <span
          class="material-symbols-outlined"
          style="font-size: 36px; color: var(--google-text-secondary); margin-bottom: 8px;"
          >filter_list_off</span
        >
        <h3 class="empty-state-title">No matching changes</h3>
        <p class="empty-state-desc">No changes match your current search and type filters.</p>
        <button
          type="button"
          class="compare-quick-btn"
          style="margin-top: 12px;"
          onclick={() => {
            app.comparisonSearch = '';
            app.comparisonKindFilter = 'all';
          }}
        >
          Reset filters
        </button>
      </div>
    {/if}
  {:else}
    <!-- TAB 2: ENTIRE CHANGELOG -->
    <!-- Full Lifetime Archive Stats -->
    <div class="changelog-overview-grid">
      <div class="changelog-metric-card">
        <span class="num">{app.changelogStats.totalSnapshots}</span>
        <span class="title">Total Snapshots</span>
      </div>
      <div class="changelog-metric-card">
        <span class="num" style="color: var(--google-blue);">{app.changelogStats.totalEvents}</span>
        <span class="title">Revisions Recorded</span>
      </div>
      <div class="changelog-metric-card">
        <span class="num" style="color: var(--success-text);">+{app.changelogStats.added}</span>
        <span class="title">Total Contacts Added</span>
      </div>
      <div class="changelog-metric-card">
        <span class="num" style="color: var(--google-blue);">~{app.changelogStats.changed}</span>
        <span class="title">Modifications</span>
      </div>
      <div class="changelog-metric-card">
        <span class="num" style="color: var(--google-danger);">-{app.changelogStats.removed}</span>
        <span class="title">Total Contacts Removed</span>
      </div>
    </div>

    <!-- Search & Filter for Changelog -->
    <div class="changes-filter-toolbar">
      <div class="changes-search-box">
        <span class="material-symbols-outlined">search</span>
        <input
          type="text"
          class="changes-search-input"
          placeholder="Search entire changelog by name or field..."
          bind:value={app.changelogSearch}
        />
        {#if app.changelogSearch}
          <button
            type="button"
            class="icon-btn"
            style="width: 24px; height: 24px;"
            onclick={() => (app.changelogSearch = '')}
          >
            <span class="material-symbols-outlined" style="font-size: 16px;">close</span>
          </button>
        {/if}
      </div>

      <div class="filter-pills-row">
        <button
          type="button"
          class="filter-pill"
          class:active={app.changelogKindFilter === 'all'}
          onclick={() => (app.changelogKindFilter = 'all')}
        >
          All <span class="filter-pill-count">{app.changelogList.length}</span>
        </button>
        <button
          type="button"
          class="filter-pill"
          class:active={app.changelogKindFilter === 'added'}
          onclick={() => (app.changelogKindFilter = 'added')}
        >
          Added <span class="filter-pill-count">{app.changelogStats.added}</span>
        </button>
        <button
          type="button"
          class="filter-pill"
          class:active={app.changelogKindFilter === 'changed'}
          onclick={() => (app.changelogKindFilter = 'changed')}
        >
          Modified <span class="filter-pill-count">{app.changelogStats.changed}</span>
        </button>
        <button
          type="button"
          class="filter-pill"
          class:active={app.changelogKindFilter === 'removed'}
          onclick={() => (app.changelogKindFilter = 'removed')}
        >
          Removed <span class="filter-pill-count">{app.changelogStats.removed}</span>
        </button>
      </div>
    </div>

    {#if app.loadingChangelog}
      <div class="empty-state" style="padding: 60px 20px;">
        <span
          class="material-symbols-outlined spin"
          style="font-size: 36px; color: var(--google-blue); margin-bottom: 12px;">sync</span
        >
        <h3 class="empty-state-title">Loading entire changelog...</h3>
      </div>
    {:else if app.changelogSnapshotGroups.length > 0}
      <!-- Chronological Snapshot Timeline Feed -->
      <div class="timeline-feed">
        {#each app.changelogSnapshotGroups as group (group.sequence)}
          {@const isCollapsed = app.collapsedSnapshots.has(group.sequence)}
          <div class="timeline-snapshot-block">
            <div class="timeline-node-pin"></div>
            <div class="timeline-snapshot-header">
              <div class="timeline-header-left">
                <span class="timeline-snap-title">Snapshot #{group.sequence}</span>
                <span class="timeline-snap-time">{app.formatCaptureTime(group.committed_at)}</span>
                <span class="timeline-snap-count">
                  {group.changes.length}
                  {group.changes.length === 1 ? 'change' : 'changes'}
                </span>
              </div>

              <div style="display: flex; align-items: center; gap: 8px;">
                <button
                  type="button"
                  class="timeline-compare-btn"
                  onclick={() => app.compareSnapshotWithPrior(group.sequence)}
                  title="Open snapshot comparison for this snapshot"
                >
                  <span class="material-symbols-outlined" style="font-size: 16px;"
                    >compare_arrows</span
                  >
                  <span>Compare this snapshot</span>
                </button>
                <button
                  type="button"
                  class="icon-btn"
                  style="width: 32px; height: 32px;"
                  title={isCollapsed ? 'Expand snapshot changes' : 'Collapse snapshot changes'}
                  onclick={() => app.toggleSnapshotCollapse(group.sequence)}
                >
                  <span class="material-symbols-outlined" style="font-size: 20px;">
                    {isCollapsed ? 'expand_more' : 'expand_less'}
                  </span>
                </button>
              </div>
            </div>

            {#if !isCollapsed}
              <div class="timeline-changes-wrap">
                {#each group.changes as item (item.resource_name + '-' + item.version)}
                  <ContactChangeCard
                    change={{
                      resource_name: item.resource_name,
                      kind: item.kind,
                      version: item.version,
                      before: item.before,
                      after: item.after,
                    }}
                    labels={app.groupMap}
                    avatarUrl={app.getAvatarSource(
                      {
                        resource_name: item.resource_name,
                        display_name: '',
                        payload: item.after || item.before || {},
                        version: item.version,
                      },
                      app.media,
                    )}
                    showSnapshotBadge={false}
                    committedAt={item.committed_at}
                    birthdayFormat={app.preferences.birthdayFormat}
                  />
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {:else}
      <div class="empty-state">
        <span
          class="material-symbols-outlined"
          style="font-size: 48px; color: var(--google-text-secondary); margin-bottom: 12px;"
          >history</span
        >
        <h3 class="empty-state-title">No changelog entries found</h3>
        <p class="empty-state-desc">
          {#if app.changelogSearch || app.changelogKindFilter !== 'all'}
            No records match your filters. Try clearing search or selecting "All".
          {:else}
            No contact revisions have been recorded in this archive yet.
          {/if}
        </p>
      </div>
    {/if}
  {/if}
</div>
