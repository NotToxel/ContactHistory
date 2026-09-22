<script lang="ts">
  import { getContactPhotos } from '../../lib/photos';

  import type { AppModel } from '../model.svelte';
  let { app }: { app: AppModel } = $props();
</script>

{#if app.showPhotosModal && app.detail}
  {@const contactPhotos = getContactPhotos(app.detail, app.media, app.avatarMap)}
  <div
    class="modal-overlay"
    use:app.focusDialog
    role="dialog"
    aria-modal="true"
    aria-labelledby="photos-modal-title"
    tabindex="-1"
    onclick={(e) => {
      if (e.target === e.currentTarget) {
        app.showPhotosModal = false;
        app.photoInfoTooltip = null;
      }
    }}
    onkeydown={(e) => {
      if (e.key === 'Escape') {
        app.showPhotosModal = false;
        app.photoInfoTooltip = null;
      }
    }}
  >
    <div class="modal-dialog photos-dialog" role="document">
      <div class="modal-header photos-modal-header">
        <h2 class="modal-title" id="photos-modal-title">Photos</h2>
        <button
          class="icon-btn"
          aria-label="Close photos dialog"
          onclick={() => {
            app.showPhotosModal = false;
            app.photoInfoTooltip = null;
          }}
        >
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
      <div class="modal-body photos-modal-body">
        {#if contactPhotos.length === 0}
          <div class="photos-empty-state">
            <div
              class="photo-circle empty-avatar"
              style="background-color: {app.getAvatarColor(app.getDisplayName(app.detail))};"
            >
              <span>{app.getInitials(app.getDisplayName(app.detail))}</span>
            </div>
            <p class="photos-empty-text">No photos held for this contact.</p>
          </div>
        {:else}
          <div class="photos-modal-grid">
            {#each contactPhotos as photo}
              <div class="photo-card" aria-label={photo.label}>
                <div class="photo-circle">
                  <img
                    src={photo.displayUrl}
                    alt={photo.label}
                    referrerpolicy="no-referrer"
                    onerror={(e) => {
                      (e.currentTarget as HTMLElement).classList.add('avatar-img-failed');
                    }}
                  />
                </div>
                <div class="photo-label-row">
                  <span class="photo-label">{photo.label}</span>
                  {#if photo.type === 'profile'}
                    {@const infoText = photo.sourceEmail
                      ? `This profile picture comes from the account for: ${photo.sourceEmail}`
                      : 'This profile picture comes from a linked Google Account'}
                    <span
                      class="photo-info-icon material-symbols-outlined"
                      role="button"
                      tabindex="0"
                      aria-label={infoText}
                      onmouseenter={(e) => {
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        app.photoInfoTooltip = {
                          text: infoText,
                          x: rect.left + rect.width / 2,
                          y: rect.top - 10,
                        };
                      }}
                      onmouseleave={() => {
                        app.photoInfoTooltip = null;
                      }}
                      onfocus={(e) => {
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        app.photoInfoTooltip = {
                          text: infoText,
                          x: rect.left + rect.width / 2,
                          y: rect.top - 10,
                        };
                      }}
                      onblur={() => {
                        app.photoInfoTooltip = null;
                      }}>info</span
                    >
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <!-- Photo info tooltip — rendered inside the fixed overlay so it is never clipped -->
    {#if app.photoInfoTooltip}
      <div
        class="photo-info-popover"
        style="left: {app.photoInfoTooltip.x}px; top: {app.photoInfoTooltip.y}px;"
        role="tooltip"
      >
        {app.photoInfoTooltip.text}
      </div>
    {/if}
  </div>
{/if}
