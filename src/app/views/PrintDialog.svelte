<script lang="ts">
  import CustomSelect from '../../lib/CustomSelect.svelte';
  import type { AppModel } from '../model.svelte';
  let { app }: { app: AppModel } = $props();
</script>

{#if app.showPrintDialog}
  <div
    class="modal-overlay"
    role="presentation"
    onclick={(event) => {
      if (event.target === event.currentTarget) app.showPrintDialog = false;
    }}
  >
    <div
      class="modal-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="print-title"
      tabindex="-1"
      use:app.focusDialog
      onkeydown={(event) => {
        if (event.key === 'Escape') app.showPrintDialog = false;
      }}
    >
      <div class="modal-header">
        <h2 class="modal-title" id="print-title">Print contacts</h2>
        <button
          class="icon-btn"
          aria-label="Close print options"
          onclick={() => (app.showPrintDialog = false)}
          ><span class="material-symbols-outlined">close</span></button
        >
      </div>
      <div class="modal-body">
        <CustomSelect
          ariaLabel="Contacts to print"
          options={app.scopeChoices}
          bind:value={app.printScope}
        />
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick={() => (app.showPrintDialog = false)}>Cancel</button
        ><button
          class="btn-primary"
          disabled={app.printing ||
            !app.scopeChoices.find((choice) => choice.value === app.printScope)?.contacts.length}
          onclick={app.printChosenContacts}>Print</button
        >
      </div>
    </div>
  </div>
{/if}
