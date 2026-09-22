<script lang="ts">
  import PrintDialog from './app/views/PrintDialog.svelte';
  import PhotoGalleryDialog from './app/views/PhotoGalleryDialog.svelte';
  import PhotoExportDialog from './app/views/PhotoExportDialog.svelte';
  import RawDataDialog from './app/views/RawDataDialog.svelte';
  import ResetArchiveDialog from './app/views/ResetArchiveDialog.svelte';
  import DeleteSnapshotDialog from './app/views/DeleteSnapshotDialog.svelte';
  import SettingsDialog from './app/views/SettingsDialog.svelte';
  import ColumnSettings from './app/views/ColumnSettings.svelte';
  import AccountMenu from './app/views/AccountMenu.svelte';
  import OnboardingView from './app/views/OnboardingView.svelte';
  import ContactsView from './app/views/ContactsView.svelte';
  import ChangesView from './app/views/ChangesView.svelte';
  import ContactDetail from './app/views/ContactDetail.svelte';
  import Sidebar from './app/views/Sidebar.svelte';
  import TopBar from './app/views/TopBar.svelte';
  import ContactPrint from './lib/ContactPrint.svelte';
  import ContextMenu from './lib/ContextMenu.svelte';
  import { SIDEBAR } from './app/layout';
  import { AppModel } from './app/model.svelte';
  const app = new AppModel();
</script>

<div class="app-container">
  <!-- Native Custom Frameless Topbar -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <TopBar {app} />

  <!-- Account Popover Menu -->
  <AccountMenu {app} />

  <!-- Capture in Progress Banner with Cancel -->
  {#if app.captureProgress}
    <div class="capture-banner">
      <div class="banner-content">
        <span class="material-symbols-outlined" style="font-size: 18px;">sync</span>
        <span>{app.captureProgress.message}</span>
        {#if app.captureProgress.percent !== undefined && app.captureProgress.percent !== null}
          <div class="banner-progress-bar">
            <div class="banner-progress-fill" style="width: {app.captureProgress.percent}%"></div>
          </div>
          <span>{app.captureProgress.percent}%</span>
        {/if}
      </div>
      <button class="banner-cancel-btn" onclick={app.cancelCapture}>Cancel</button>
    </div>
  {/if}

  <!-- Toast Notification Banner -->
  {#if app.toastMessage}
    <div class="toast-banner">
      <div class="toast-content">
        <span class="material-symbols-outlined toast-icon">info</span>
        <span>{app.toastMessage}</span>
      </div>
      <button
        class="toast-close-btn"
        onclick={() => {
          app.toastMessage = '';
        }}
        aria-label="Dismiss notification"
      >
        <span class="material-symbols-outlined" style="font-size: 18px;">close</span>
      </button>
    </div>
  {/if}

  <!-- Body Content -->
  <div class="content-body">
    {#if app.hasData && app.pageView !== 'onboarding'}
      <!-- Google Contacts Sidebar -->
      <Sidebar {app} />

      {#if !app.sidebarCollapsed}
        <div
          class="sidebar-resizer"
          class:is-resizing={app.isResizingSidebar}
          onmousedown={app.startSidebarResize}
          ondblclick={app.resetSidebarWidth}
          onkeydown={app.handleSidebarResizerKeyDown}
          role="slider"
          aria-label="Resize sidebar"
          aria-orientation="vertical"
          aria-valuenow={app.sidebarWidth}
          aria-valuemin={SIDEBAR.min}
          aria-valuemax={SIDEBAR.max}
          tabindex="0"
          title="Drag to resize sidebar • Double-click to reset ({SIDEBAR.defaultWidth}px)"
        ></div>
      {/if}

      <!-- Main View Workspace -->
      <main class="main-area">
        {#if app.pageView === 'contacts'}
          {#if app.detail}
            <ContactDetail {app} />
          {:else}<ContactsView {app} />{/if}
        {:else if app.pageView === 'changes'}<ChangesView {app} />{/if}
      </main>
    {:else}
      <!-- Simple Onboarding Screen -->
      <OnboardingView {app} />
    {/if}
  </div>

  <!-- Column Customizer Modal (Google Contacts Style) -->
  <ColumnSettings {app} />

  <!-- Settings keeps personal preferences, capture schedules, account controls, and About together. -->
  <SettingsDialog {app} />
  <DeleteSnapshotDialog {app} />
  <ResetArchiveDialog {app} />
  <!-- Contact Raw Data Modal -->
  <RawDataDialog {app} />

  <!-- Export Contact Photos Modal -->
  <PhotoExportDialog {app} />

  <!-- Photos Modal (Google Contacts Authentic Style) -->
  <PhotoGalleryDialog {app} />

  <!-- Floating Material Design Tooltip (Rendered at root, never clipped or hidden) -->
  {#if app.activeFloatingTooltip}
    <div
      class="floating-global-tooltip pos-{app.activeFloatingTooltip.pos}"
      style="left: {app.activeFloatingTooltip.x}px; top: {app.activeFloatingTooltip.y}px;"
      role="tooltip"
    >
      {app.activeFloatingTooltip.text}
    </div>
  {/if}

  <!-- Global Custom Desktop Context Menu -->
  <ContextMenu />
</div>

<ContactPrint contacts={app.printContacts} />
<PrintDialog {app} />
