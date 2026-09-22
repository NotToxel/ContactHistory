<script lang="ts">
  import brandLogo from '../../assets/contact-history.png';
  import { version as appVersion } from '../../../package.json';
  import { type Preferences, type BirthdayFormat } from '../../lib/preferences';
  import ToggleSwitch from '../../lib/ToggleSwitch.svelte';
  import CustomSelect from '../../lib/CustomSelect.svelte';

  import type { AppModel } from '../model.svelte';
  let { app }: { app: AppModel } = $props();
</script>

{#if app.showSettingsModal}
  <div
    class="modal-overlay"
    use:app.focusDialog
    role="dialog"
    aria-modal="true"
    aria-labelledby="settings-title"
    tabindex="-1"
    onclick={(e) => {
      if (e.target === e.currentTarget) app.showSettingsModal = false;
    }}
    onkeydown={(e) => {
      if (e.key === 'Escape') app.showSettingsModal = false;
    }}
  >
    <div class="modal-dialog settings-dialog" role="document">
      <div class="modal-header">
        <h2 class="modal-title" id="settings-title">Settings</h2>
        <button
          class="icon-btn"
          aria-label="Close settings"
          onclick={() => (app.showSettingsModal = false)}
          ><span class="material-symbols-outlined">close</span></button
        >
      </div>
      <nav class="settings-tabs" aria-label="Settings sections">
        <button
          aria-pressed={app.settingsTab === 'preferences'}
          onclick={() => (app.settingsTab = 'preferences')}
        >
          <span class="material-symbols-outlined">tune</span>
          Preferences
        </button>
        <button
          aria-pressed={app.settingsTab === 'schedule'}
          onclick={() => (app.settingsTab = 'schedule')}
        >
          <span class="material-symbols-outlined">schedule</span>
          Capture Schedule
        </button>
        <button
          aria-pressed={app.settingsTab === 'about'}
          onclick={() => (app.settingsTab = 'about')}
        >
          <span class="material-symbols-outlined">info</span>
          About
        </button>
      </nav>
      <div class="modal-body settings-body">
        {#if app.settingsError}<p class="settings-error" role="alert">{app.settingsError}</p>{/if}

        {#if app.settingsTab === 'preferences'}
          <!-- Appearance & Display -->
          <div class="settings-section-header">
            <h3>
              <span class="material-symbols-outlined">palette</span>
              Appearance & Display
            </h3>
            <p>Customize the look, density, and ordering of your contacts workspace.</p>
          </div>
          <div class="settings-card">
            <div class="setting-row">
              <div class="setting-row-text">
                <span class="setting-row-title">Color theme</span>
                <span class="setting-row-desc"
                  >Choose Light, Dark, or let the app automatically match your operating system.</span
                >
              </div>
              <div class="theme-options" role="group" aria-label="Color theme">
                {#each [{ value: 'system', label: 'System', icon: 'desktop_windows' }, { value: 'light', label: 'Light', icon: 'light_mode' }, { value: 'dark', label: 'Dark', icon: 'dark_mode' }] as option}
                  <button
                    aria-pressed={app.preferences.theme === option.value}
                    onclick={() =>
                      app.updatePreferences({ theme: option.value as Preferences['theme'] })}
                  >
                    <span class="material-symbols-outlined" aria-hidden="true">{option.icon}</span>
                    {option.label}
                  </button>
                {/each}
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-row-text">
                <span class="setting-row-title">Contact density</span>
                <span class="setting-row-desc"
                  >Adjust the vertical spacing between contact table rows.</span
                >
              </div>
              <div class="setting-row-control">
                <CustomSelect
                  options={app.densityOptions}
                  value={app.preferences.density}
                  onchange={(v) => app.updatePreferences({ density: v })}
                  ariaLabel="Contact density"
                />
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-row-text">
                <span class="setting-row-title">Sort contacts by</span>
                <span class="setting-row-desc"
                  >Order contacts by their first name or last name.</span
                >
              </div>
              <div class="setting-row-control">
                <CustomSelect
                  options={app.sortFieldOptions}
                  value={app.nameSortField}
                  onchange={(v) => app.setSortField(v as 'first' | 'last')}
                  ariaLabel="Sort contacts by"
                />
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-row-text">
                <span class="setting-row-title">Name sort order</span>
                <span class="setting-row-desc">Alphabetical A to Z, or descending Z to A.</span>
              </div>
              <div class="setting-row-control">
                <CustomSelect
                  options={app.sortDirectionOptions}
                  value={app.nameSortDirection}
                  onchange={(v) => app.setSortDirection(v as 'asc' | 'desc')}
                  ariaLabel="Name sort order"
                />
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-row-text">
                <span class="setting-row-title">Birthday format</span>
                <span class="setting-row-desc"
                  >Choose how birthdays are displayed across the table, contact details, and
                  changes.</span
                >
              </div>
              <div class="setting-row-control">
                <CustomSelect
                  options={app.birthdayFormatOptions}
                  value={app.preferences.birthdayFormat}
                  onchange={(v) => app.updatePreferences({ birthdayFormat: v as BirthdayFormat })}
                  ariaLabel="Birthday format"
                />
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-row-text">
                <span class="setting-row-title">Reduce motion</span>
                <span class="setting-row-desc"
                  >Minimize animations. Your device’s reduced-motion preference is always respected.</span
                >
              </div>
              <div class="setting-row-control">
                <ToggleSwitch
                  checked={app.preferences.reduceMotion}
                  onchange={(c) => app.updatePreferences({ reduceMotion: c })}
                  label="Reduce motion"
                />
              </div>
            </div>

            <div
              class="settings-actions"
              style="margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--google-border-subtle);"
            >
              <button
                class="btn-secondary"
                onclick={() => {
                  app.showSettingsModal = false;
                  app.showColCustomizer = true;
                }}
              >
                <span class="material-symbols-outlined" style="font-size: 18px;">view_column</span>
                Change column order & visibility...
              </button>
            </div>
          </div>

          <!-- Phone & Region Settings -->
          <div class="settings-section-header">
            <h3>
              <span class="material-symbols-outlined">call</span>
              Phone & Region
            </h3>
            <p>
              Configure how national phone numbers without country prefixes are formatted and
              dialed.
            </p>
          </div>
          <div class="settings-card">
            <div class="setting-row">
              <div class="setting-row-text">
                <span class="setting-row-title">Default country code</span>
                <span class="setting-row-desc">
                  Used for phone numbers without an international country code.
                </span>
              </div>
              <div class="setting-row-control">
                <CustomSelect
                  options={app.countryOptions}
                  searchable={true}
                  searchPlaceholder="Search country or code..."
                  value={app.preferences.defaultCountry || 'auto'}
                  onchange={(val) => app.updatePreferences({ defaultCountry: String(val) })}
                  ariaLabel="Default phone country code"
                />
              </div>
            </div>
          </div>

          <!-- Active Account -->
          <div class="settings-section-header">
            <h3>
              <span class="material-symbols-outlined">account_circle</span>
              Active Account
            </h3>
            <p>The Google account currently connected for contact sync and snapshots.</p>
          </div>
          <div class="settings-card">
            <div class="setting-row">
              <div class="setting-row-text">
                <span class="setting-row-title">{app.selected?.email || 'No account selected'}</span
                >
                <span class="setting-row-desc">
                  {#if app.accountProfile?.name}
                    Google profile: {app.accountProfile.name}
                  {:else}
                    All contact archives and snapshot history remain stored securely on this
                    computer.
                  {/if}
                </span>
              </div>
              <div class="setting-row-control">
                <button
                  class="btn-secondary"
                  style="color: var(--google-danger);"
                  disabled={!app.selected || app.busy}
                  onclick={app.disconnectSelected}
                >
                  Disconnect account
                </button>
              </div>
            </div>
          </div>

          <div class="settings-section-header">
            <h3><span class="material-symbols-outlined">database</span> Local database</h3>
            <p>Manage the archived contact data stored on this computer.</p>
          </div>
          <div class="settings-card">
            <div class="setting-row">
              <div class="setting-row-text">
                <span class="setting-row-title">Clear and reset database</span>
                <span class="setting-row-desc"
                  >Permanently delete every snapshot, contact history entry, and saved photo for all
                  accounts. Connected accounts and preferences stay available.</span
                >
              </div>
              <div class="setting-row-control">
                <button
                  class="btn-secondary danger-action"
                  disabled={app.archiveActionBusy || app.busy || app.accounts.length === 0}
                  onclick={() => (app.showResetDatabaseConfirm = true)}>Reset database</button
                >
              </div>
            </div>
          </div>
        {:else if app.settingsTab === 'schedule'}
          <!-- Capture Schedule Tab -->
          <div class="settings-section-header">
            <h3>
              <span class="material-symbols-outlined">schedule</span>
              Automated Background Capture
            </h3>
            <p>
              Configure automatic snapshot intervals, scheduled times, and logon checks to keep your
              archive up to date.
            </p>
          </div>

          <div class="schedule-status-banner">
            <div class="status-indicator-group">
              <span class="status-dot" class:active={app.scheduleConfig.enabled}></span>
              <div class="status-text-info">
                <span class="status-title"
                  >{app.scheduleConfig.enabled
                    ? 'Automatic Capture Active'
                    : 'Automatic Capture Paused'}</span
                >
                <span class="status-subtitle">
                  {#if app.due?.next_due_at}
                    Next snapshot due: {new Date(app.due.next_due_at).toLocaleDateString(
                      undefined,
                      {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      },
                    )}
                    {#if app.due.due}
                      &middot; <strong style="color: var(--google-blue);">Due now</strong>{/if}
                  {:else if app.scheduleConfig.enabled}
                    Snapshots will run automatically in the background when contacts are due.
                  {:else}
                    Turn on the switch below to automate background snapshot capture.
                  {/if}
                </span>
              </div>
            </div>
            <ToggleSwitch
              checked={app.scheduleConfig.enabled}
              disabled={app.scheduleBusy || !app.scheduleReady}
              onchange={() => app.toggleSchedule()}
              label="Toggle automatic capture"
            />
          </div>

          <div
            class="settings-card"
            style="opacity: {app.scheduleConfig.enabled ? '1' : '0.5'}; pointer-events: {app
              .scheduleConfig.enabled
              ? 'auto'
              : 'none'}; transition: opacity 0.2s ease;"
          >
            <div class="setting-row">
              <div class="setting-row-text">
                <span class="setting-row-title">Capture interval rule</span>
                <span class="setting-row-desc"
                  >Minimum age of your previous snapshot before a new one is captured. Prevents
                  redundant snapshots if contacts haven't changed.</span
                >
              </div>
              <div class="setting-row-control">
                <CustomSelect
                  options={app.intervalOptions}
                  value={app.scheduleConfig.interval_days}
                  disabled={!app.scheduleConfig.enabled || app.scheduleBusy}
                  onchange={(val) => app.updateSchedule({ interval_days: Number(val) })}
                  ariaLabel="Capture interval"
                />
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-row-text">
                <span class="setting-row-title">Preferred daily check time</span>
                <span class="setting-row-desc"
                  >The time of day Windows triggers the automated capture check.</span
                >
              </div>
              <div class="setting-row-control">
                <input
                  type="time"
                  class="schedule-time-input"
                  value={app.scheduleConfig.time_of_day || '09:00'}
                  disabled={!app.scheduleConfig.enabled || app.scheduleBusy}
                  onchange={(e) => app.updateSchedule({ time_of_day: e.currentTarget.value })}
                  aria-label="Preferred daily check time"
                />
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-row-text">
                <span class="setting-row-title">Run at user sign-in (Logon)</span>
                <span class="setting-row-desc"
                  >Checks if a capture is due whenever you log into Windows.</span
                >
              </div>
              <div class="setting-row-control">
                <ToggleSwitch
                  checked={app.scheduleConfig.run_at_logon}
                  disabled={!app.scheduleConfig.enabled || app.scheduleBusy}
                  onchange={(c) => app.updateSchedule({ run_at_logon: c })}
                  label="Run at logon"
                />
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-row-text">
                <span class="setting-row-title">Run daily at preferred time</span>
                <span class="setting-row-desc"
                  >Schedules a recurring Windows background task at your specified time.</span
                >
              </div>
              <div class="setting-row-control">
                <ToggleSwitch
                  checked={app.scheduleConfig.run_daily}
                  disabled={!app.scheduleConfig.enabled || app.scheduleBusy}
                  onchange={(c) => app.updateSchedule({ run_daily: c })}
                  label="Run daily"
                />
              </div>
            </div>
          </div>
        {:else}
          <!-- About Tab -->
          <section class="settings-section about-copy" aria-labelledby="about-title">
            <div class="about-brand">
              <img class="brand-logo" src={brandLogo} alt="" />
              <div>
                <h3 id="about-title">Contact History</h3>
                <p>Version {appVersion}</p>
              </div>
            </div>
            <p>
              A local archive of your Google contacts, with snapshots that let you revisit details
              and see what changed over time.
            </p>
            <p>
              Browse earlier snapshots, compare revisions, and export contacts or back up an account
              using the sidebar’s export and archive actions.
            </p>
            <p>
              Contact archives are stored privately on this computer. Connecting and capturing
              contacts requires access to your Google account.
            </p>
          </section>
        {/if}
      </div>
      <div class="modal-footer">
        {#if app.preferenceNotice}
          <span class="settings-note" role="status">
            {app.preferenceNotice}
          </span>
        {/if}
        <button class="btn-primary" onclick={() => (app.showSettingsModal = false)}>Done</button>
      </div>
    </div>
  </div>
{/if}
