import { onMount } from 'svelte';
import { api, listenCaptureProgress } from '../lib/ipc';
import { readLayout } from './layout';
import type { NavigationEntry } from './types';
import type { AppModel } from './model.svelte';
export function registerLifecycle(this: AppModel): void {
  onMount(() => {
    let disposed = false;
    const events = new AbortController();
    const options = { signal: events.signal };
    window.addEventListener('keydown', this.handleGlobalKeyDown, options);
    window.addEventListener('popstate', this.handlePopState, options);
    window.addEventListener('mouseup', this.handleNativeNavigation, options);
    window.addEventListener('click', this.handleWindowClick, options);
    window.addEventListener('contextmenu', this.handleGlobalContextMenu, options);
    window.addEventListener('resize', this.updateStickyState, options);
    this.colorScheme.addEventListener('change', this.syncSystemTheme, options);
    Object.assign(this, readLayout());

    // Subscribe before loading the archive, and release late subscriptions on teardown.
    void listenCaptureProgress((progress) => {
      if (!disposed) this.captureProgress = progress;
    })
      .then((unlisten) => {
        if (disposed) unlisten();
        else this.unlistenProgress = unlisten;
      })
      .catch((error) => {
        if (!disposed) this.error = `Unable to listen for capture progress: ${String(error)}`;
      });

    void loadSchedule(this, () => disposed);
    void initializeArchive(this, () => disposed).catch((error) => {
      if (!disposed) this.error = String(error);
    });

    return () => {
      disposed = true;
      events.abort();
      this.unlistenProgress?.();
      this.unlistenProgress = undefined;
      clearTimeout(this.copiedTimeout);
      clearTimeout(this.toastTimeout);
      this.activeDragCleanup?.();
    };
  });
}

async function loadSchedule(app: AppModel, disposed: () => boolean): Promise<void> {
  try {
    const config = await api.getScheduleConfig();
    if (disposed()) return;
    app.scheduleConfig = config;
    app.scheduled = config.enabled;
  } catch {
    try {
      const enabled = await api.scheduleState();
      if (disposed()) return;
      app.scheduled = enabled;
      app.scheduleConfig.enabled = enabled;
    } catch {
      if (!disposed()) app.settingsError = 'Unable to load the capture schedule.';
    }
  } finally {
    if (!disposed()) app.scheduleReady = true;
  }
}

async function initializeArchive(app: AppModel, disposed: () => boolean): Promise<void> {
  try {
    const maximized = await api.winIsMaximized().catch(() => app.appWindow.isMaximized());
    if (disposed()) return;
    app.isMaximized = maximized;
  } catch {
    /* Window controls can be unavailable outside the desktop shell. */
  }
  if (disposed()) return;
  await app.refreshAccounts();
  if (disposed()) return;
  const entry = window.history.state as NavigationEntry | null;
  if (entry?.contactHistoryNavigation) {
    app.navigationIndex = entry.index;
    app.navigationMaxIndex = entry.index;
    await app.restoreNavigation(entry);
  } else {
    window.history.replaceState(app.currentNavigation(), '');
  }
  if (!disposed()) app.navigationReady = true;
}
