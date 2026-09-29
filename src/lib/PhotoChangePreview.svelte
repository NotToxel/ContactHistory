<script lang="ts">
  import { api, type MediaView } from './ipc';
  import { getPhotoUrl } from '../app/actions/avatars';

  let {
    accountId,
    resourceName,
    before,
    after,
    beforeSequence = null,
    afterSequence = null,
  }: {
    accountId: string;
    resourceName: string;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
    beforeSequence?: number | null;
    afterSequence?: number | null;
  } = $props();

  const beforeUrl = $derived(getPhotoUrl(before || {}));
  const afterUrl = $derived(getPhotoUrl(after || {}));
  let beforeImage = $state('');
  let afterImage = $state('');
  let loading = $state(false);

  $effect(() => {
    const previousUrl = beforeUrl;
    const updatedUrl = afterUrl;
    const previousSequence = beforeSequence;
    const updatedSequence = afterSequence;
    const account = accountId;
    const resource = resourceName;
    let active = true;
    beforeImage = '';
    afterImage = '';
    const shouldLoad = Boolean(
      account && resource && ((previousUrl && previousSequence) || (updatedUrl && updatedSequence)),
    );
    loading = shouldLoad;

    async function load() {
      const sequences = [
        ...new Set([previousUrl ? previousSequence : null, updatedUrl ? updatedSequence : null]),
      ].filter((sequence): sequence is number => sequence !== null);
      const results = await Promise.all(
        sequences.map(async (sequence) => {
          try {
            return [sequence, await api.media(account, sequence, resource)] as const;
          } catch {
            return [sequence, [] as MediaView[]] as const;
          }
        }),
      );
      if (!active) return;
      const bySequence = new Map(results);
      beforeImage =
        bySequence.get(previousSequence ?? -1)?.find((media) => media.source_url === previousUrl)
          ?.data_url || '';
      afterImage =
        bySequence.get(updatedSequence ?? -1)?.find((media) => media.source_url === updatedUrl)
          ?.data_url || '';
      loading = false;
    }

    if (shouldLoad) void load();
    return () => {
      active = false;
    };
  });
</script>

<div class="photo-change-preview" aria-label="Photo before and after">
  <div class="photo-change-side">
    <span class="photo-change-label">Before</span>
    <div class="photo-change-frame">
      {#if beforeUrl && beforeImage}
        <img src={beforeImage} alt="Previous" />
      {:else if beforeUrl && loading}
        <span class="photo-change-status">Loading photo…</span>
      {:else if beforeUrl}
        <span class="photo-change-status">Archived photo unavailable</span>
      {:else}
        <span class="photo-change-status">No photo</span>
      {/if}
    </div>
  </div>
  <span class="material-symbols-outlined photo-change-arrow" aria-hidden="true">arrow_forward</span>
  <div class="photo-change-side">
    <span class="photo-change-label">After</span>
    <div class="photo-change-frame">
      {#if afterUrl && afterImage}
        <img src={afterImage} alt="Updated" />
      {:else if afterUrl && loading}
        <span class="photo-change-status">Loading photo…</span>
      {:else if afterUrl}
        <span class="photo-change-status">Archived photo unavailable</span>
      {:else}
        <span class="photo-change-status">No photo</span>
      {/if}
    </div>
  </div>
</div>

<style>
  .photo-change-preview {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 20px minmax(0, 1fr);
    align-items: center;
    gap: 10px;
    width: min(100%, 340px);
    margin-top: 4px;
  }
  .photo-change-side {
    min-width: 0;
  }
  .photo-change-label {
    display: block;
    margin-bottom: 8px;
    font-size: 11px;
    font-weight: 600;
    color: var(--google-text-secondary);
  }
  .photo-change-frame {
    display: grid;
    place-items: center;
    width: min(100%, 126px);
    aspect-ratio: 1;
    padding: 4px;
    border: 1px solid var(--google-border-subtle);
    border-radius: 50%;
    background: var(--surface-base);
  }
  .photo-change-frame img {
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
  }
  .photo-change-status {
    max-width: 100px;
    text-align: center;
    font-size: 12px;
    line-height: 1.4;
    color: var(--google-text-secondary);
  }
  .photo-change-arrow {
    color: var(--google-text-secondary);
    font-size: 20px;
  }
  @media (max-width: 450px) {
    .photo-change-preview {
      gap: 6px;
    }
    .photo-change-status {
      font-size: 11px;
    }
  }
</style>
