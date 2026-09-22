<script lang="ts">
  import type { AppModel } from '../model.svelte';
  let { app }: { app: AppModel } = $props();
</script>

<div class="onboarding-screen">
  <div class="onboarding-card">
    {#if app.selected && app.captures.length === 0}
      <!-- Case 1: Account connected, but no snapshots captured yet -->
      <div class="onboarding-avatar-circle">
        {#if app.accountProfile?.picture}
          <img
            src={app.accountProfile.picture}
            alt={app.accountProfile?.name || app.selected.email}
            class="onboarding-avatar-img"
            referrerpolicy="no-referrer"
            onerror={(e) => {
              (e.currentTarget as HTMLElement).style.display = 'none';
            }}
          />
        {:else}
          <span
            class="material-symbols-outlined icon-filled"
            style="font-size: 32px; color: var(--google-blue);">person</span
          >
        {/if}
      </div>

      <div class="onboarding-account-badge">
        <span class="material-symbols-outlined" style="font-size: 16px; color: var(--success-text);"
          >check_circle</span
        >
        <span
          >{app.accountProfile?.name
            ? `${app.accountProfile.name} (${app.selected.email})`
            : app.selected.email}</span
        >
      </div>

      <h1 class="onboarding-title">Capture your first snapshot</h1>
      <p class="onboarding-desc">
        Your Google account is connected. Capture your first snapshot to begin archiving your
        contact history and tracking revisions over time.
      </p>

      <div class="onboarding-form">
        {#if app.error}
          <div class="banner banner-error" style="margin-bottom: 4px; font-size: 13px;">
            <span class="material-symbols-outlined" style="font-size: 18px;">error</span>
            <span>{app.error}</span>
          </div>
        {/if}

        <button
          class="btn-primary"
          onclick={app.captureNow}
          disabled={app.busy}
          style="height: 48px; font-size: 15px; font-weight: 500; display: flex; align-items: center; justify-content: center; gap: 8px;"
        >
          <span class="material-symbols-outlined" class:spin={app.busy} style="font-size: 20px;">
            {app.busy ? 'sync' : 'photo_camera'}
          </span>
          <span>{app.busy ? 'Capturing snapshot...' : 'Capture contacts now'}</span>
        </button>

        <div class="onboarding-divider">or import existing data</div>

        <div class="onboarding-secondary-actions">
          <button
            class="btn-secondary"
            onclick={app.importCsv}
            disabled={app.busy}
            style="height: 40px; display: flex; align-items: center; justify-content: center; gap: 8px;"
          >
            <span class="material-symbols-outlined" style="font-size: 18px;">upload</span>
            <span>Import from CSV</span>
          </button>
          <button
            class="btn-secondary"
            onclick={app.restoreLocal}
            disabled={app.busy}
            style="height: 40px; display: flex; align-items: center; justify-content: center; gap: 8px;"
          >
            <span class="material-symbols-outlined" style="font-size: 18px;">unarchive</span>
            <span>Restore database backup</span>
          </button>
          <button
            class="btn-secondary"
            onclick={app.disconnectSelected}
            disabled={app.busy}
            style="height: 40px; color: var(--google-danger); border-color: transparent; display: flex; align-items: center; justify-content: center; gap: 8px;"
          >
            <span class="material-symbols-outlined" style="font-size: 18px;">logout</span>
            <span>Disconnect account</span>
          </button>
        </div>
      </div>
    {:else}
      <!-- Case 2: No account connected (or explicitly adding another account) -->
      <div class="onboarding-icon-circle">
        <span class="material-symbols-outlined icon-filled" style="font-size: 32px;">contacts</span>
      </div>

      <h1 class="onboarding-title">Welcome to Contact History</h1>
      <p class="onboarding-desc">
        Connect your Google Account using your OAuth Client credentials to begin archiving contacts
        and tracking revisions over time.
      </p>

      <div class="onboarding-form">
        <div>
          <label
            for="client-id"
            style="font-size: 12px; font-weight: 500; color: var(--google-text-secondary); display: block; margin-bottom: 6px;"
            >Client ID</label
          >
          <input
            id="client-id"
            type="text"
            bind:value={app.clientId}
            placeholder="apps.googleusercontent.com"
            style="width: 100%; height: 42px; padding: 0 14px; border: 1px solid var(--google-border); border-radius: 8px; font-family: inherit; font-size: 14px;"
          />
        </div>
        <div>
          <label
            for="client-secret"
            style="font-size: 12px; font-weight: 500; color: var(--google-text-secondary); display: block; margin-bottom: 6px;"
            >Client Secret</label
          >
          <input
            id="client-secret"
            type="password"
            bind:value={app.clientSecret}
            placeholder="Client secret"
            style="width: 100%; height: 42px; padding: 0 14px; border: 1px solid var(--google-border); border-radius: 8px; font-family: inherit; font-size: 14px;"
          />
        </div>
        {#if app.error}
          <div class="banner banner-error" style="margin-top: 4px; font-size: 13px;">
            <span class="material-symbols-outlined" style="font-size: 18px;">error</span>
            <span>{app.error}</span>
          </div>
        {/if}
        <button
          class="btn-primary"
          onclick={app.connectNewAccount}
          disabled={app.busy || !app.clientId.trim() || !app.clientSecret.trim()}
          style="height: 48px; font-size: 15px; font-weight: 500; margin-top: 4px; display: flex; align-items: center; justify-content: center; gap: 8px;"
        >
          <span class="material-symbols-outlined" class:spin={app.busy} style="font-size: 20px;">
            {app.busy ? 'sync' : 'login'}
          </span>
          <span>{app.busy ? 'Connecting to Google...' : 'Connect Google'}</span>
        </button>

        <div class="onboarding-divider">or restore an archive</div>

        <div class="onboarding-secondary-actions">
          <button
            class="btn-secondary"
            onclick={app.restoreLocal}
            disabled={app.busy}
            style="height: 40px; display: flex; align-items: center; justify-content: center; gap: 8px;"
          >
            <span class="material-symbols-outlined" style="font-size: 18px;">unarchive</span>
            <span>Restore from backup archive</span>
          </button>
          {#if app.hasData}
            <button
              class="btn-secondary"
              onclick={() => app.navigate('contacts')}
              style="height: 40px; margin-top: 4px; display: flex; align-items: center; justify-content: center; gap: 8px;"
            >
              <span class="material-symbols-outlined" style="font-size: 18px;">arrow_back</span>
              <span>Back to contacts</span>
            </button>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>
