<script lang="ts">
  import type { AppModel } from '../model.svelte';
  let { app }: { app: AppModel } = $props();
</script>

{#if app.showAccountMenu}
  <div
    class="menu-scrim"
    style="position: fixed; inset: 0; z-index: 101; background: transparent;"
    onclick={() => (app.showAccountMenu = false)}
    onkeydown={(e) => {
      if (e.key === 'Escape') app.showAccountMenu = false;
    }}
    role="presentation"
    tabindex="-1"
  ></div>
  <div
    class="popover account-menu"
    role="menu"
    aria-label="Google accounts"
    tabindex="-1"
    onkeydown={(e) => {
      if (e.key === 'Escape') app.showAccountMenu = false;
    }}
  >
    <div class="account-menu-heading">Google accounts</div>
    {#each app.accounts as acc}
      <button
        type="button"
        class="account-menu-item"
        class:selected={app.selected?.id === acc.id}
        role="menuitem"
        onclick={() => {
          app.selectAccount(acc);
          app.showAccountMenu = false;
        }}
        title={acc.email}
      >
        <div class="account-menu-avatar">
          {#if app.selected?.id === acc.id && app.accountProfile?.picture}
            <img
              src={app.accountProfile.picture}
              alt=""
              referrerpolicy="no-referrer"
              onerror={(e) => {
                (e.currentTarget as HTMLElement).style.display = 'none';
              }}
            />
          {:else}
            <span>{app.getInitials(acc.email)}</span>
          {/if}
        </div>
        <div class="account-menu-copy">
          <strong
            >{app.selected?.id === acc.id && app.accountProfile?.name
              ? app.accountProfile.name
              : acc.email}</strong
          >
          <small>{acc.email}</small>
        </div>
        {#if app.selected?.id === acc.id}
          <span class="material-symbols-outlined account-check" aria-label="Active account"
            >check</span
          >
        {/if}
      </button>
    {/each}
    <div class="menu-divider"></div>
    <button
      type="button"
      class="account-menu-action"
      role="menuitem"
      onclick={() => {
        app.showAccountMenu = false;
        app.navigate('onboarding');
      }}
    >
      <span class="material-symbols-outlined">person_add</span>
      <span>Add another Google account</span>
    </button>
    <button
      type="button"
      class="account-menu-action"
      role="menuitem"
      onclick={() => {
        app.showAccountMenu = false;
        app.showSettingsModal = true;
      }}
    >
      <span class="material-symbols-outlined">settings</span>
      <span>Settings & preferences</span>
    </button>
  </div>
{/if}
