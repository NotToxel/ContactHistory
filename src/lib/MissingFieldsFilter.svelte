<script lang="ts">
  import { missingFieldOptions, type MissingField } from './missing-fields';
  let { fields, mode, onchange }: {
    fields: MissingField[];
    mode: 'any' | 'all';
    onchange: (fields: MissingField[], mode: 'any' | 'all') => void;
  } = $props();
  let expanded = $state(false);
  const panelId = $props.id();
  const sections = [
    { label: 'Common fields', options: missingFieldOptions.slice(0, 5) },
    { label: 'More details', options: missingFieldOptions.slice(5) },
  ];
</script>

<div class="missing-fields">
  <button type="button" class="filter-trigger" class:active={fields.length > 0} aria-expanded={expanded} aria-controls={panelId} onclick={() => expanded = !expanded}>
    <span class="material-symbols-outlined" aria-hidden="true">filter_alt</span>
    <span class="trigger-label">Missing fields</span>
    {#if fields.length}<span class="filter-count">{fields.length}</span>{/if}
    <span class="material-symbols-outlined chevron" class:expanded aria-hidden="true">expand_more</span>
  </button>
  <div id={panelId} hidden={!expanded} class="filter-panel">
    <p>Show contacts missing:</p>
    <div class="match-mode" role="group" aria-label="Missing field match mode">
      <button type="button" class:selected={mode === 'any'} aria-pressed={mode === 'any'} onclick={() => onchange(fields, 'any')}>Any selected</button>
      <button type="button" class:selected={mode === 'all'} aria-pressed={mode === 'all'} onclick={() => onchange(fields, 'all')}>All selected</button>
    </div>
    {#each sections as section}
      <fieldset>
        <legend>{section.label}</legend>
        {#each section.options as field}
          <label class:checked={fields.includes(field.key)}>
            <input type="checkbox" checked={fields.includes(field.key)} onchange={() => onchange(fields.includes(field.key) ? fields.filter(key => key !== field.key) : [...fields, field.key], mode)} />
            <span>{field.label}</span>
          </label>
        {/each}
      </fieldset>
    {/each}
    <div class="filter-footer">
      <span>{fields.length ? `${fields.length} selected` : 'No filters selected'}</span>
      <button type="button" disabled={!fields.length} onclick={() => onchange([], mode)}>Clear</button>
    </div>
  </div>
</div>

<style>
  .missing-fields { min-width: 0; color: var(--google-text); font-size: 13px; white-space: normal; }
  button { font: inherit; cursor: pointer; }
  .filter-trigger { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 44px; padding: 10px 12px; border: 1px solid var(--google-border); border-radius: 8px; background: var(--surface-base); color: var(--google-text); text-align: left; font-size: 14px; font-weight: 500; }
  .filter-trigger:hover { background: var(--google-surface-hover); }
  .filter-trigger.active { background: var(--google-blue-surface); border-color: var(--google-blue); color: var(--google-blue); }
  .trigger-label { flex: 1; min-width: 0; }
  .material-symbols-outlined { flex-shrink: 0; font-size: 20px; }
  .filter-count { display: grid; place-items: center; min-width: 22px; height: 22px; padding: 0 5px; border-radius: 11px; background: var(--google-blue); color: var(--on-accent); font-size: 12px; font-weight: 600; }
  .chevron { font-size: 18px; transition: transform 150ms ease; }
  .chevron.expanded { transform: rotate(180deg); }
  .filter-panel { margin-top: 6px; padding: 12px; border: 1px solid var(--google-border); border-radius: 12px; background: var(--surface-base); }
  p { margin: 0 0 10px; color: var(--google-text-secondary); line-height: 1.5; }
  .match-mode { display: flex; padding: 3px; gap: 2px; border-radius: 8px; background: var(--google-surface); }
  .match-mode button { flex: 1; min-width: 0; min-height: 32px; padding: 5px 4px; border: 0; border-radius: 6px; background: transparent; color: var(--google-text-secondary); font-size: 12px; font-weight: 500; }
  .match-mode button:hover { background: var(--google-surface-hover); }
  .match-mode button.selected { background: var(--google-blue-surface); color: var(--google-blue); }
  fieldset { min-width: 0; margin: 16px 0 0; padding: 0; border: 0; }
  legend { padding: 0; margin-bottom: 6px; color: var(--google-text-secondary); font-size: 12px; font-weight: 600; }
  label { display: flex; align-items: center; gap: 10px; min-height: 36px; padding: 6px 8px; border-radius: 6px; cursor: pointer; line-height: 1.4; }
  label:hover { background: var(--google-surface-hover); }
  label.checked { background: var(--google-blue-surface); color: var(--google-blue); }
  input { flex-shrink: 0; margin: 0; accent-color: var(--google-blue); width: 16px; height: 16px; cursor: pointer; }
  .filter-footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 12px; padding-top: 8px; border-top: 1px solid var(--google-border); color: var(--google-text-secondary); font-size: 12px; }
  .filter-footer button { min-height: 32px; padding: 6px 8px; border: 0; border-radius: 6px; background: transparent; color: var(--google-blue); font-weight: 500; }
  .filter-footer button:hover:not(:disabled) { background: var(--google-blue-surface); }
  .filter-footer button:disabled { color: var(--google-text-secondary); opacity: 0.6; cursor: default; }
  button:focus-visible, input:focus-visible { outline: 2px solid var(--google-blue); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { .chevron { transition: none; } }
</style>
