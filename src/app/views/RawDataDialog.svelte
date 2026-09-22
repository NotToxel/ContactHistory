<script lang="ts">
  import ContactPayloadViewer from '../../lib/ContactPayloadViewer.svelte';

  import type { AppModel } from '../model.svelte';
  let { app }: { app: AppModel } = $props();
</script>

{#if app.showRawDataModal && app.detail}
  <div
    class="modal-overlay"
    onclick={(e) => {
      if (e.target === e.currentTarget) app.showRawDataModal = false;
    }}
    onkeydown={(e) => {
      if (e.key === 'Escape') app.showRawDataModal = false;
    }}
    role="dialog"
    aria-modal="true"
    use:app.focusDialog
    tabindex="-1"
  >
    <div
      class="modal-dialog"
      role="document"
      style="max-width: 940px; width: 95%; height: 80vh; display: flex; flex-direction: column;"
    >
      <div class="modal-header">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="material-symbols-outlined" style="color: var(--google-blue);"
            >data_object</span
          >
          <h2 class="modal-title">Raw Contact Payload: {app.getDisplayName(app.detail)}</h2>
        </div>
        <button class="icon-btn" onclick={() => (app.showRawDataModal = false)}>
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
      <div
        class="modal-body"
        style="flex: 1; overflow: hidden; display: flex; flex-direction: column; padding-bottom: 0;"
      >
        <ContactPayloadViewer
          payload={app.detail.payload as Record<string, unknown>}
          maxHeight="100%"
        />
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick={() => app.downloadContactCsv(app.detail!)}>
          <span class="material-symbols-outlined" style="font-size: 16px;">table_chart</span>
          <span>Download CSV</span>
        </button>
        <button class="btn-secondary" onclick={() => app.downloadContactJson(app.detail!)}>
          <span class="material-symbols-outlined" style="font-size: 16px;">download</span>
          <span>Download JSON</span>
        </button>
        <button class="btn-secondary" onclick={() => app.downloadContactVcf(app.detail!)}>
          <span class="material-symbols-outlined" style="font-size: 16px;">contact_page</span>
          <span>Download vCard</span>
        </button>
        <button class="btn-primary" onclick={() => (app.showRawDataModal = false)}>Close</button>
      </div>
    </div>
  </div>
{/if}
