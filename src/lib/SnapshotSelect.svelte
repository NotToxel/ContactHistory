<script lang="ts">
  import type { Capture } from './ipc';
  let { label, captures, value, onchange }: { label: string; captures: Capture[]; value: number | null; onchange: (value: number) => void } = $props();
  let expanded = $state(false);
  let root: HTMLDivElement;
  const selected = $derived(captures.find((capture) => capture.sequence === value));
  const date = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  function handleKeys(event: KeyboardEvent) {
    if (!expanded && event.key === 'ArrowDown') {
      event.preventDefault();
      expanded = true;
      requestAnimationFrame(() => root.querySelector<HTMLButtonElement>('.snapshot-select-options button.active')?.focus() ?? root.querySelector<HTMLButtonElement>('.snapshot-select-options button')?.focus());
      return;
    }
    if (event.key === 'Escape' && expanded) {
      expanded = false;
      root.querySelector('button')?.focus();
    }
    if (expanded && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const options = [...root.querySelectorAll<HTMLButtonElement>('.snapshot-select-options button')];
      const index = options.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
      options[next]?.focus();
    }
  }
</script>

<svelte:window onclick={(event) => { if (root && !root.contains(event.target as Node)) expanded = false; }} onkeydown={(event) => { if (root?.contains(event.target as Node)) handleKeys(event); }} />
<div class="snapshot-select" bind:this={root}>
  <span class="compare-label">{label}</span>
  <button type="button" class="snapshot-select-trigger" aria-label={`${label}: Snapshot ${value ?? 'none'}`} aria-haspopup="true" aria-expanded={expanded} onclick={() => expanded = !expanded}>
    <span class="material-symbols-outlined">history</span>
    <span><strong>Snapshot #{value ?? '—'}</strong><small>{selected ? date(selected.committed_at) : 'Choose a snapshot'}</small></span>
    <span class="material-symbols-outlined">{expanded ? 'expand_less' : 'expand_more'}</span>
  </button>
  {#if expanded}
    <div class="snapshot-select-options" role="group" aria-label={label}>
      {#each captures as capture}
        <button type="button" class:active={capture.sequence === value} aria-pressed={capture.sequence === value} onclick={() => { onchange(capture.sequence); expanded = false; root.querySelector('button')?.focus(); }}>
          <span><strong>Snapshot #{capture.sequence}</strong><small>{date(capture.committed_at)} · {capture.contact_count} contacts</small></span>
          {#if capture.sequence === value}<span class="material-symbols-outlined">check</span>{/if}
        </button>
      {/each}
    </div>
  {/if}
</div>
