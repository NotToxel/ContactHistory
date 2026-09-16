<script lang="ts">
  import { onMount } from 'svelte';
  import { save, open } from '@tauri-apps/plugin-dialog';
  import { Archive, ArrowLeft, ArrowRight, CalendarDays, Check, ChevronDown, ChevronRight, Clock3, CloudDownload, ContactRound, Download, FileClock, FileText, History, Info, LockKeyhole, Menu, Plus, RefreshCw, Search, Settings2, ShieldCheck, Sparkles, Upload, UserRound, UsersRound, X } from '@lucide/svelte';
  import { api, listenCaptureProgress, type Account, type Capture, type Contact, type MediaView, type DueStatus, type Change, type CaptureProgress } from './lib/ipc';

  type Page = 'contacts' | 'changes' | 'settings' | 'onboarding';
  let accounts: Account[] = $state([]);
  let selected: Account | undefined = $state();
  let captures: Capture[] = $state([]);
  let capture: Capture | undefined = $state();
  let contacts: Contact[] = $state([]);
  let detail: Contact | undefined = $state();
  let media: MediaView[] = $state([]);
  let due: DueStatus | undefined = $state();
  let scheduled = $state(false);
  let connected = $state(false);
  let changes: Change[] = $state([]);
  let chosenChange: Change | undefined = $state();
  let pageView: Page = $state('onboarding');
  let dateInput = $state('');
  let search = $state('');
  let clientId = $state('');
  let clientSecret = $state('');
  let busy = $state(false);
  let error = $state('');
  let offset = $state(0);
  let navOpen = $state(false);
  let captureProgress = $state<CaptureProgress | null>(null);
  const currentStage = $derived(captureProgress?.stage ?? 'contacts');
  function isStageDone(stage: string): boolean {
    if (!captureProgress) return false;
    const stages = ['contacts', 'groups', 'media', 'indexing', 'complete'];
    return stages.indexOf(captureProgress.stage) > stages.indexOf(stage);
  }

  const dateTime = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const shortDate = (value: string) => new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const initials = (value: string) => value.trim().split(/[\s@._-]+/).slice(0, 2).map(part => part[0]?.toUpperCase() ?? '').join('') || '?';
  const message = (e: unknown) => error = String(e);
  const changeLabel = (kind: string) => kind.toLowerCase().replace(/_/g, ' ');

  function navigate(to: Page) { pageView = to; navOpen = false; error = ''; }
  async function refreshAccounts() {
    accounts = await api.accounts();
    if (!selected && accounts.length) await selectAccount(accounts[0]);
    else if (!accounts.length) pageView = 'onboarding';
  }
  async function selectAccount(account: Account) {
    selected = account; detail = undefined; chosenChange = undefined; search = ''; offset = 0;
    captures = await api.captures(account.id); capture = captures[0];
    due = await api.due(account.id); connected = (await api.health(account.id)).connected;
    await refreshContacts(); await refreshChanges(); navigate('contacts');
  }
  async function refreshContacts() {
    contacts = selected && capture ? await api.contacts(selected.id, capture.sequence, search, offset) : [];
    detail = undefined; media = [];
  }
  async function refreshChanges() {
    changes = selected && capture ? await api.changes(selected.id, capture.sequence, 0) : [];
    chosenChange = undefined;
  }
  async function selectContact(contact: Contact) {
    detail = contact; media = [];
    if (selected && capture) {
      try { media = await api.media(selected.id, capture.sequence, contact.resource_name); }
      catch (e) { message(e); }
    }
  }
  async function connect() {
    busy = true; error = '';
    try {
      const account = await api.connect(clientId.trim(), clientSecret.trim());
      await refreshAccounts(); await selectAccount(account); clientSecret = '';
    } catch (e) { message(e); } finally { busy = false; }
  }
  async function captureNow() {
    if (!selected) return;
    busy = true;
    error = '';
    captureProgress = {
      account_id: selected.id,
      stage: 'contacts',
      message: 'Connecting to Google...',
      percent: 5,
    };
    try {
      await api.capture(selected.id);
      await selectAccount(selected);
    } catch (e) {
      message(e);
    } finally {
      busy = false;
      captureProgress = null;
    }
  }
  async function changeCapture(sequence: number) {
    capture = captures.find(c => c.sequence === sequence); offset = 0;
    await refreshContacts(); await refreshChanges();
  }
  async function chooseDate() {
    if (!selected || !dateInput) return;
    try {
      const found = await api.captureAt(selected.id, new Date(dateInput).toISOString());
      if (!found) { error = 'No capture existed at that time. Try a later date.'; return; }
      if (!captures.some(c => c.sequence === found.sequence)) captures = [found, ...captures];
      await changeCapture(found.sequence);
    } catch (e) { message(e); }
  }
  async function find() { offset = 0; try { await refreshContacts(); } catch (e) { message(e); } }
  async function movePage(step: number) { offset = Math.max(0, offset + step); try { await refreshContacts(); } catch (e) { message(e); } }
  async function checkDue() {
    for (const account of accounts) {
      try {
        await api.retryMedia(account.id);
        const result = await api.captureDue(account.id);
        if (result && selected?.id === account.id) await selectAccount(account);
      } catch (e) { message(e); }
    }
  }
  async function toggleSchedule() {
    try {
      if (scheduled) await api.disableSchedule(); else await api.enableSchedule();
      scheduled = await api.scheduleState();
    } catch (e) { message(e); }
  }
  async function exportSelected(format: 'csv' | 'vcf') {
    if (!selected || !capture) return;
    try {
      const destination = await save({ defaultPath: `contacts-capture-${capture.sequence}.${format}`, filters: [{ name: format === 'csv' ? 'Google CSV' : 'vCard', extensions: [format] }] });
      if (destination) await api.exportCapture(selected.id, capture.sequence, format, destination);
    } catch (e) { message(e); }
  }
  async function backupSelected() {
    if (!selected) return;
    try {
      const destination = await save({ defaultPath: `contact-history-${selected.email}.contacthistory` });
      if (destination) await api.backupAccount(selected.id, destination);
    } catch (e) { message(e); }
  }
  async function restoreLocal() {
    try {
      const source = await open({ directory: true, multiple: false });
      if (typeof source === 'string') {
        const account = await api.restoreArchive(source); await refreshAccounts(); await selectAccount(account);
      }
    } catch (e) { message(e); }
  }
  async function disconnectSelected() {
    if (!selected) return;
    try { await api.disconnect(selected.id); connected = false; } catch (e) { message(e); }
  }
  let unlistenProgress: (() => void) | undefined;
  onMount(() => {
    refreshAccounts().then(checkDue).catch(message);
    api.scheduleState().then(value => scheduled = value).catch(message);
    listenCaptureProgress((p) => {
      if (selected && p.account_id === selected.id) {
        captureProgress = p;
      }
    }).then(unlisten => { unlistenProgress = unlisten; }).catch(console.error);
    const timer = setInterval(checkDue, 60 * 60 * 1000);
    return () => {
      clearInterval(timer);
      if (unlistenProgress) unlistenProgress();
    };
  });
</script>

<svelte:head><title>Contact History</title><meta name="theme-color" content="#f8f9ff" /></svelte:head>
<div class="app-shell">
  <aside class:open={navOpen} class="sidebar" aria-label="Main navigation">
    <div class="brand"><span class="brand-mark"><History size={23} strokeWidth={2.3} /></span><span class="brand-name">Contact<br /><strong>History</strong></span><button class="icon-button nav-close" aria-label="Close navigation" onclick={() => navOpen = false}><X size={20} /></button></div>
    <nav class="nav-group" aria-label="Views"><button class:active={pageView === 'contacts'} disabled={!selected} onclick={() => navigate('contacts')}><ContactRound size={20} /><span>Contacts</span></button><button class:active={pageView === 'changes'} disabled={!selected} onclick={() => navigate('changes')}><History size={20} /><span>Changes</span></button><button class:active={pageView === 'settings'} disabled={!selected} onclick={() => navigate('settings')}><Settings2 size={20} /><span>Settings</span></button></nav>
    <div class="sidebar-section-label">YOUR ACCOUNTS</div>
    <div class="account-list">{#each accounts as account}<button class:active={selected?.id === account.id && pageView !== 'onboarding'} class="account-button" onclick={() => selectAccount(account)} title={account.email}><span class="avatar small">{initials(account.email)}</span><span class="account-name">{account.email}</span></button>{/each}<button class="add-account" onclick={() => navigate('onboarding')}><Plus size={19} /><span>Add Google account</span></button></div>
    <div class="sidebar-bottom"><div class="private-note"><LockKeyhole size={17} /><span>Your archive stays on this device</span></div><span class="version">Contact History</span></div>
  </aside>
  {#if navOpen}<button class="nav-scrim" aria-label="Close navigation" onclick={() => navOpen = false}></button>{/if}
  <div class="workspace">
    <header class="topbar"><button class="icon-button mobile-menu" aria-label="Open navigation" onclick={() => navOpen = true}><Menu size={23} /></button><div class="topbar-title">{pageView === 'onboarding' ? 'Add an account' : pageView === 'settings' ? 'Settings' : pageView === 'changes' ? 'Changes' : 'Contacts'}</div><div class="topbar-actions">{#if selected && pageView !== 'onboarding'}{#if busy && captureProgress}<div class="topbar-progress" title={captureProgress.message}><div class="topbar-progress-info"><RefreshCw size={13} class="spinning" /><span class="topbar-progress-msg">{captureProgress.message}</span></div><div class="topbar-track"><div class="topbar-fill" style="width: {captureProgress.percent ?? 15}%"></div></div></div>{/if}<span class:disconnected={!connected} class="connection-status"><span class="status-dot"></span>{connected ? 'Google connected' : 'Local archive'}</span><button class="button primary capture-button" disabled={busy || !connected} onclick={captureNow}><RefreshCw size={17} class={busy ? 'spinning' : ''} />{busy ? 'Capturing…' : 'Capture now'}</button>{/if}</div></header>
    {#if error}<div class="error-banner" role="alert"><Info size={19} /><span>{error}</span><button class="icon-button" aria-label="Dismiss message" onclick={() => error = ''}><X size={18} /></button></div>{/if}
    <main class:setup={pageView === 'onboarding'}>
      {#if pageView === 'onboarding'}
        <div class="onboarding">{#if accounts.length}<button class="back-link" onclick={() => navigate('contacts')}><ArrowLeft size={17} /> Back to archive</button>{/if}<div class="welcome-art" aria-hidden="true"><div class="art-ring ring-one"></div><div class="art-ring ring-two"></div><div class="art-center"><ContactRound size={52} strokeWidth={1.5} /></div><div class="art-spark spark-one"><Sparkles size={20} /></div><div class="art-spark spark-two"><History size={20} /></div></div><div class="welcome-copy"><h1>A clearer view of your contacts, over time.</h1><p>Connect Google Contacts and save private snapshots on this device. Look back at any capture to see what was there and what changed.</p></div>
          <div class="setup-layout"><section class="setup-card" aria-labelledby="setup-title"><div class="setup-card-heading"><span class="step-badge">1</span><div><h2 id="setup-title">Connect your Google account</h2><p>Use a desktop OAuth client from Google Cloud. Contact History only requests read access.</p></div></div><div class="setup-instructions"><div><span class="instruction-number">1</span><p>Create a <strong>Desktop app</strong> OAuth client in Google Cloud.</p></div><div><span class="instruction-number">2</span><p>Enable the <strong>People API</strong> for that project.</p></div><div><span class="instruction-number">3</span><p>Paste the client credentials below, then sign in with Google.</p></div></div><form class="connect-form" onsubmit={(event) => { event.preventDefault(); connect(); }}><label for="client-id">Client ID</label><input id="client-id" bind:value={clientId} placeholder="…apps.googleusercontent.com" autocomplete="off" required /><label for="client-secret">Client secret <span class="optional">if provided</span></label><input id="client-secret" bind:value={clientSecret} type="password" placeholder="Paste client secret" autocomplete="off" /><button class="button primary full" disabled={busy || !clientId.trim()} type="submit">{busy ? 'Connecting…' : 'Connect with Google'}<ArrowRight size={18} /></button></form></section><aside class="setup-aside"><div class="aside-icon"><ShieldCheck size={25} /></div><h3>Private by design</h3><p>Snapshots live in a local archive. Contact History does not edit your Google Contacts.</p><div class="aside-divider"></div><div class="next-step"><span class="step-badge muted">2</span><div><strong>Capture your contacts</strong><span>After connecting, make your first snapshot to start your timeline.</span></div></div><button class="text-button" onclick={restoreLocal}><Upload size={17} /> Restore an existing archive</button></aside></div></div>
      {:else if pageView === 'settings' && selected}
        <div class="page-container settings-page"><div class="page-heading"><h1>Settings</h1><p>Manage captures, your Google connection, and local archive files for {selected.email}.</p></div><div class="settings-grid"><section class="settings-section"><div class="setting-icon"><CalendarDays size={22} /></div><div class="setting-body"><h2>Weekly captures</h2><p>Windows checks for overdue captures daily and when you sign in.</p><div class="setting-state"><span class:enabled={scheduled} class="state-dot"></span>{scheduled ? 'Background checks on' : 'Background checks off'}</div></div><button class="button tonal" onclick={toggleSchedule}>{scheduled ? 'Turn off' : 'Turn on'}</button></section><section class="settings-section"><div class="setting-icon"><CloudDownload size={22} /></div><div class="setting-body"><h2>Archive files</h2><p>Keep a portable copy of this account or restore an archive saved on this device.</p><div class="setting-actions"><button class="button outline" onclick={backupSelected}><Download size={17} /> Back up account</button><button class="button outline" onclick={restoreLocal}><Upload size={17} /> Restore archive</button></div></div></section><section class="settings-section"><div class="setting-icon"><ShieldCheck size={22} /></div><div class="setting-body"><h2>Google connection</h2><p>{connected ? 'Connected for future read-only captures.' : 'This account is available as a local archive.'}</p><div class="setting-state"><span class:enabled={connected} class="state-dot"></span>{connected ? 'Connected' : 'Disconnected'}</div></div>{#if connected}<button class="button outline" onclick={disconnectSelected}>Disconnect</button>{/if}</section></div><div class="settings-footer"><LockKeyhole size={18} /> Your contacts and snapshots are stored locally on this device.</div></div>
      {:else if selected}
        <div class="page-container archive-page"><div class="page-heading archive-heading"><div><h1>{pageView === 'changes' ? 'What changed' : 'Your contact archive'}</h1><p>{pageView === 'changes' ? 'Compare observed contact revisions across captures.' : `Browse saved snapshots for ${selected.email}.`}</p></div><span class="avatar heading-avatar">{initials(selected.email)}</span></div><div class="overview-strip"><div><span class="overview-icon"><Archive size={20} /></span><span><small>CAPTURES</small><strong>{captures.length}</strong></span></div><div><span class="overview-icon"><UsersRound size={20} /></span><span><small>CONTACTS IN VIEW</small><strong>{capture?.contact_count ?? '—'}</strong></span></div><div><span class="overview-icon"><Clock3 size={20} /></span><span><small>NEXT CAPTURE</small><strong>{due?.next_due_at ? shortDate(due.next_due_at) : 'Not scheduled'}</strong></span></div></div>
          {#if capture}<div class="capture-section"><div class="capture-main"><div class="capture-label"><FileClock size={19} /><span>Viewing capture</span></div><div class="capture-controls"><select value={capture.sequence} onchange={(event) => changeCapture(Number(event.currentTarget.value))} aria-label="Historical capture">{#each captures as item}<option value={item.sequence}>Capture {item.sequence} · {dateTime(item.committed_at)}</option>{/each}</select><ChevronDown size={17} class="select-chevron" /></div></div><div class="capture-meta">Observed {dateTime(capture.started_at)} – {dateTime(capture.committed_at)} <span>·</span> {capture.group_count} groups {#if !capture.media_complete}<span>·</span> Some photos unavailable{/if}</div></div><div class="archive-tools"><div class="date-tools"><label for="capture-date">Go to date</label><input id="capture-date" type="datetime-local" bind:value={dateInput} /><button class="button tonal" onclick={chooseDate}>Find capture</button></div><div class="export-tools"><button class="button outline" onclick={() => exportSelected('csv')}><Download size={16} /> CSV</button><button class="button outline" onclick={() => exportSelected('vcf')}><Download size={16} /> vCard</button></div></div>
            {#if pageView === 'contacts'}<div class="browser-head"><div><h2>Contacts</h2><p>People as they appeared in this capture</p></div><form class="search-form" onsubmit={(event) => { event.preventDefault(); find(); }}><Search size={19} /><input bind:value={search} aria-label="Search contacts" placeholder="Search captured fields" /><button type="submit" aria-label="Run search"><ArrowRight size={18} /></button></form></div><div class="data-browser"><div class="item-list" aria-label="Captured contacts"><div class="list-title">{search ? 'SEARCH RESULTS' : 'ALL CONTACTS'}<span>{contacts.length}{offset ? '+' : ''}</span></div>{#each contacts as contact}<button class:active={detail?.resource_name === contact.resource_name} class="contact-row" onclick={() => selectContact(contact)}><span class="avatar">{initials(contact.display_name)}</span><span class="row-copy"><strong>{contact.display_name || 'Unnamed contact'}</strong><small>Revision {contact.version}</small></span><ChevronRight size={17} /></button>{/each}{#if !contacts.length}<div class="list-empty"><Search size={24} /><strong>No contacts found</strong><span>Try another search or choose a different capture.</span></div>{/if}<div class="pagination"><button disabled={offset === 0} onclick={() => movePage(-100)}><ArrowLeft size={16} /> Previous</button><span>{contacts.length ? `${offset + 1}–${offset + contacts.length}` : '0 results'}</span><button disabled={contacts.length < 100} onclick={() => movePage(100)}>Next <ArrowRight size={16} /></button></div></div><div class="detail-panel">{#if detail}<div class="detail-header"><span class="avatar detail-avatar">{initials(detail.display_name)}</span><div><h2>{detail.display_name || 'Unnamed contact'}</h2><p>Revision {detail.version} · {detail.resource_name}</p></div></div>{#each media as item}{#if item.data_url}<img class="contact-photo" src={item.data_url} alt={`Archived photo of ${detail.display_name}`} />{#if item.status === 'late'}<p class="inline-note">Photo retrieved later on {dateTime(item.retrieved_at!)}.</p>{/if}{:else if item.status === 'failed'}<p class="inline-note">This photo could not be archived.</p>{/if}{/each}<div class="detail-divider"></div><div class="detail-section-title"><FileText size={18} /><h3>Captured fields</h3></div><pre>{JSON.stringify(detail.payload, null, 2)}</pre>{:else}<div class="detail-empty"><div class="empty-symbol"><UserRound size={35} /></div><h3>Select a contact</h3><p>Choose someone from the list to inspect every field saved in this capture.</p></div>{/if}</div></div>
            {:else}<div class="browser-head"><div><h2>Changes</h2><p>Differences observed in this capture</p></div><span class="count-pill">{changes.length} changes</span></div><div class="data-browser"><div class="item-list" aria-label="Observed changes"><div class="list-title">CHANGED CONTACTS</div>{#each changes as change}<button class:active={chosenChange?.resource_name === change.resource_name} class="contact-row" onclick={() => chosenChange = change}><span class="change-icon"><History size={20} /></span><span class="row-copy"><strong>{change.resource_name}</strong><small>{changeLabel(change.kind)} · Revision {change.version}</small></span><ChevronRight size={17} /></button>{/each}{#if !changes.length}<div class="list-empty"><Check size={25} /><strong>No changes recorded</strong><span>This capture has no semantic contact changes.</span></div>{/if}</div><div class="detail-panel">{#if chosenChange}<div class="change-detail-heading"><span class="change-kind">{changeLabel(chosenChange.kind)}</span><h2>{chosenChange.resource_name}</h2><p>Revision {chosenChange.version}</p></div><div class="compare-grid"><div><h3>Before</h3><pre>{JSON.stringify(chosenChange.before, null, 2)}</pre></div><div><h3>After</h3><pre>{JSON.stringify(chosenChange.after, null, 2)}</pre></div></div>{:else}<div class="detail-empty"><div class="empty-symbol"><History size={35} /></div><h3>Explore a change</h3><p>Choose an item to compare its saved before and after states.</p></div>{/if}</div></div>{/if}
          {:else}
            {#if busy}
              <div class="first-capture-card" aria-live="polite">
                <div class="processing-glow-ring">
                  <div class="processing-icon-container">
                    <RefreshCw size={34} class="spinning brand-spin" />
                  </div>
                </div>
                <div class="processing-heading">
                  <span class="processing-badge"><Sparkles size={14} /> Initial Baseline Archive</span>
                  <h2>Creating Your First Capture</h2>
                  <p class="processing-subtext">Contact History is reading your contacts from Google, downloading photos in parallel, and indexing your local archive.</p>
                </div>

                <div class="progress-bar-wrapper">
                  <div class="progress-bar-header">
                    <span class="progress-stage-label">
                      {#if captureProgress}
                        {captureProgress.message}
                      {:else}
                        Connecting to Google People API...
                      {/if}
                    </span>
                    <span class="progress-percent-label">
                      {captureProgress?.percent ?? 10}%
                    </span>
                  </div>
                  <div class="progress-track" role="progressbar" aria-valuenow={captureProgress?.percent ?? 10} aria-valuemin="0" aria-valuemax="100">
                    <div
                      class="progress-fill"
                      style="width: {captureProgress?.percent ?? 10}%"
                    >
                      <div class="progress-fill-glow"></div>
                    </div>
                  </div>
                </div>

                <div class="pipeline-grid">
                  <div class="pipeline-step" class:active={currentStage === 'contacts'} class:done={isStageDone('contacts')}>
                    <div class="step-indicator">
                      {#if isStageDone('contacts')}<Check size={14} />{:else}1{/if}
                    </div>
                    <div class="step-meta">
                      <strong>Contacts</strong>
                      <span>Connections</span>
                    </div>
                  </div>
                  <div class="pipeline-step" class:active={currentStage === 'groups'} class:done={isStageDone('groups')}>
                    <div class="step-indicator">
                      {#if isStageDone('groups')}<Check size={14} />{:else}2{/if}
                    </div>
                    <div class="step-meta">
                      <strong>Groups</strong>
                      <span>Labels</span>
                    </div>
                  </div>
                  <div class="pipeline-step" class:active={currentStage === 'media'} class:done={isStageDone('media')}>
                    <div class="step-indicator">
                      {#if isStageDone('media')}<Check size={14} />{:else}3{/if}
                    </div>
                    <div class="step-meta">
                      <strong>Avatars</strong>
                      <span>Parallel fetch</span>
                    </div>
                  </div>
                  <div class="pipeline-step" class:active={currentStage === 'indexing' || currentStage === 'complete'} class:done={isStageDone('indexing')}>
                    <div class="step-indicator">
                      {#if isStageDone('indexing')}<Check size={14} />{:else}4{/if}
                    </div>
                    <div class="step-meta">
                      <strong>Timeline</strong>
                      <span>Index snapshot</span>
                    </div>
                  </div>
                </div>

                <div class="processing-footer">
                  <LockKeyhole size={14} />
                  <span>Optimized parallel engine &middot; Stored safely on this device &middot; Read-only</span>
                </div>
              </div>
            {:else}
              <div class="first-capture">
                <div class="first-icon"><Archive size={31} /></div>
                <h2>Ready for your first capture</h2>
                <p>Save the current state of this account to begin your contact timeline.</p>
                <button class="button primary" disabled={busy || !connected} onclick={captureNow}>
                  <RefreshCw size={18} /> Capture contacts
                </button>
                {#if !connected}<span>Connect Google to create a new capture.</span>{/if}
              </div>
            {/if}
          {/if}
        </div>
      {/if}
    </main>
  </div>
</div>
