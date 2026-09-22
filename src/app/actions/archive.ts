import { open } from '@tauri-apps/plugin-dialog';
import { api, type Capture } from '../../lib/ipc';
import type { AppModel } from '../model.svelte';
export async function deleteSelectedSnapshot(
  this: Pick<
    AppModel,
    | 'archiveActionBusy'
    | 'deleteSnapshotTarget'
    | 'error'
    | 'mediaCache'
    | 'selectAccount'
    | 'selected'
    | 'showSnapshotDropdown'
    | 'toastMessage'
  >,
): Promise<void> {
  if (!this.selected || !this.deleteSnapshotTarget || this.archiveActionBusy) return;
  const sequence = this.deleteSnapshotTarget.sequence;
  this.archiveActionBusy = true;
  this.error = '';
  try {
    await api.deleteSnapshot(this.selected.id, sequence);
    this.deleteSnapshotTarget = null;
    this.showSnapshotDropdown = false;
    this.mediaCache.clear();
    await this.selectAccount(this.selected);
    this.toastMessage = `Snapshot #${sequence} deleted.`;
  } catch (e) {
    this.error = String(e);
  } finally {
    this.archiveActionBusy = false;
  }
}

export async function resetAllDatabase(
  this: Pick<
    AppModel,
    | 'archiveActionBusy'
    | 'mediaCache'
    | 'selectAccount'
    | 'selected'
    | 'settingsError'
    | 'showResetDatabaseConfirm'
    | 'showSettingsModal'
    | 'toastMessage'
  >,
): Promise<void> {
  if (this.archiveActionBusy) return;
  this.archiveActionBusy = true;
  this.settingsError = '';
  try {
    await api.resetDatabase();
    this.showResetDatabaseConfirm = false;
    this.showSettingsModal = false;
    this.mediaCache.clear();
    if (this.selected) await this.selectAccount(this.selected);
    this.toastMessage =
      'Local database reset. Your connected accounts are ready for a new capture.';
  } catch (e) {
    this.settingsError = String(e);
  } finally {
    this.archiveActionBusy = false;
  }
}

// Capture & Cancel Action
export async function captureNow(
  this: Pick<
    AppModel,
    'busy' | 'captureProgress' | 'error' | 'selectAccount' | 'selected' | 'toastMessage'
  >,
): Promise<void> {
  if (!this.selected) return;
  this.busy = true;
  this.error = '';
  this.captureProgress = {
    account_id: this.selected.id,
    stage: 'contacts',
    message: 'Connecting to Google People API...',
    percent: 5,
  };
  try {
    const outcome = await api.capture(this.selected.id);
    await this.selectAccount(this.selected);
    if (!outcome.is_new) {
      this.toastMessage = `No changes detected. Snapshot #${outcome.capture.sequence} is up to date.`;
    } else {
      this.toastMessage = `Snapshot #${outcome.capture.sequence} captured (${outcome.change_count} changes).`;
    }
    setTimeout(() => {
      this.toastMessage = '';
    }, 5000);
  } catch (e) {
    this.error = String(e);
  } finally {
    this.busy = false;
    this.captureProgress = null;
  }
}

export async function importCsv(
  this: Pick<
    AppModel,
    'busy' | 'captureProgress' | 'error' | 'selectAccount' | 'selected' | 'toastMessage'
  >,
): Promise<void> {
  if (!this.selected) return;
  try {
    const selectedPath = await open({
      multiple: false,
      filters: [{ name: 'Google Contacts CSV', extensions: ['csv'] }],
    });
    if (typeof selectedPath === 'string') {
      this.busy = true;
      this.error = '';
      this.captureProgress = {
        account_id: this.selected.id,
        stage: 'contacts',
        message: 'Importing contacts from CSV...',
        percent: 30,
      };
      const outcome = await api.importCsv(this.selected.id, selectedPath);
      await this.selectAccount(this.selected);
      if (!outcome.is_new) {
        this.toastMessage = `No changes detected in CSV. Snapshot #${outcome.capture.sequence} is up to date.`;
      } else {
        this.toastMessage = `Imported CSV. Snapshot #${outcome.capture.sequence} created (${outcome.change_count} changes).`;
      }
      setTimeout(() => {
        this.toastMessage = '';
      }, 5000);
    }
  } catch (e) {
    this.error = String(e);
  } finally {
    this.busy = false;
    this.captureProgress = null;
  }
}

export async function cancelCapture(
  this: Pick<AppModel, 'captureProgress' | 'error' | 'selected'>,
): Promise<void> {
  if (!this.selected) return;
  try {
    await api.cancelCapture(this.selected.id);
    this.captureProgress = {
      account_id: this.selected.id,
      stage: 'contacts',
      message: 'Cancelling capture...',
      percent: 0,
    };
  } catch (e) {
    this.error = String(e);
  }
}
