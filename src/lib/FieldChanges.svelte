<script lang="ts">
  import { computeContactDiff } from './diff';
  import PhotoChangePreview from './PhotoChangePreview.svelte';
  let {
    before,
    after,
    labels = new Map<string, string>(),
    accountId = '',
    resourceName = '',
    beforeSequence = null,
    afterSequence = null,
  }: {
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
    labels?: Map<string, string>;
    accountId?: string;
    resourceName?: string;
    beforeSequence?: number | null;
    afterSequence?: number | null;
  } = $props();

  const diff = $derived(computeContactDiff(before, after, labels));
</script>

<div class="field-diff-list">
  {#each diff.groups as group (group.key)}
    <div class="field-diff">
      <div
        class="field-diff-header"
        style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;"
      >
        <span
          class="material-symbols-outlined"
          style="font-size: 15px; color: var(--google-text-secondary);">{group.icon}</span
        >
        <h4 style="margin: 0;">{group.title}</h4>
      </div>
      {#if group.key === 'photos'}
        <PhotoChangePreview
          {accountId}
          {resourceName}
          {before}
          {after}
          {beforeSequence}
          {afterSequence}
        />
      {:else}
        {#each group.items as item}
          <div class="field-diff-values">
            <div class="value-before">
              <span>Before {item.label ? `(${item.label})` : ''}</span>
              <p>{item.before || 'Not set'}</p>
            </div>
            <div class="value-after">
              <span>After {item.label ? `(${item.label})` : ''}</span>
              <p>{item.after || 'Not set'}</p>
            </div>
          </div>
        {/each}
      {/if}
    </div>
  {:else}
    <p class="timeline-note">No visible detail changes. Only archive metadata changed.</p>
  {/each}
</div>
