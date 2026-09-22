<script lang="ts">
  import type { AppModel } from '../model.svelte';
  let { app }: { app: AppModel } = $props();
</script>

{#if app.showResetDatabaseConfirm}
  <div
    class="modal-overlay archive-confirm-overlay"
    use:app.focusDialog
    role="dialog"
    aria-modal="true"
    aria-labelledby="reset-database-title"
    tabindex="-1"
    onkeydown={(e) => {
      if (e.key === 'Escape' && !app.archiveActionBusy) app.showResetDatabaseConfirm = false;
    }}
  >
    <div class="modal-dialog archive-confirm-dialog" role="document">
      <div class="modal-header">
        <h2 class="modal-title" id="reset-database-title">Reset the entire database?</h2>
      </div>
      <div class="modal-body">
        <p>
          All snapshots, contact history, and stored photos for {app.accounts.length}
          {app.accounts.length === 1 ? 'account' : 'accounts'} will be permanently deleted. Connected
          accounts and preferences will remain. This cannot be undone.
        </p>
        <p>Back up any archives you want to keep before continuing.</p>
        {#if app.settingsError}<p class="settings-error" role="alert">{app.settingsError}</p>{/if}
      </div>
      <div class="modal-footer archive-confirm-actions">
        <button
          class="btn-secondary"
          disabled={app.archiveActionBusy}
          onclick={() => (app.showResetDatabaseConfirm = false)}>Cancel</button
        ><button
          class="btn-primary danger-button"
          disabled={app.archiveActionBusy}
          onclick={app.resetAllDatabase}
          >{app.archiveActionBusy ? 'Resetting...' : 'Reset database'}</button
        >
      </div>
    </div>
  </div>
{/if}
