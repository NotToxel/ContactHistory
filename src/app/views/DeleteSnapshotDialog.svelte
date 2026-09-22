<script lang="ts">
  import type { AppModel } from '../model.svelte';
  let { app }: { app: AppModel } = $props();
</script>

{#if app.deleteSnapshotTarget}
  <div
    class="modal-overlay archive-confirm-overlay"
    use:app.focusDialog
    role="dialog"
    aria-modal="true"
    aria-labelledby="delete-snapshot-title"
    tabindex="-1"
    onkeydown={(e) => {
      if (e.key === 'Escape' && !app.archiveActionBusy) app.deleteSnapshotTarget = null;
    }}
  >
    <div class="modal-dialog archive-confirm-dialog" role="document">
      <div class="modal-header">
        <h2 class="modal-title" id="delete-snapshot-title">
          Delete Snapshot #{app.deleteSnapshotTarget.sequence}?
        </h2>
      </div>
      <div class="modal-body">
        <p>
          Captured {app.formatCaptureTime(app.deleteSnapshotTarget.committed_at)} with {app
            .deleteSnapshotTarget.contact_count} contacts.
        </p>
        <p>
          This permanently removes the snapshot and its unique history from this computer. Remaining
          snapshots stay available. This cannot be undone.
        </p>
        {#if app.error}<p class="settings-error" role="alert">{app.error}</p>{/if}
      </div>
      <div class="modal-footer archive-confirm-actions">
        <button
          class="btn-secondary"
          disabled={app.archiveActionBusy}
          onclick={() => (app.deleteSnapshotTarget = null)}>Cancel</button
        ><button
          class="btn-primary danger-button"
          disabled={app.archiveActionBusy}
          onclick={app.deleteSelectedSnapshot}
          >{app.archiveActionBusy ? 'Deleting...' : 'Delete snapshot'}</button
        >
      </div>
    </div>
  </div>
{/if}
