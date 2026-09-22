import { save, open } from '@tauri-apps/plugin-dialog';
import { api, type Account } from '../../lib/ipc';
import type { AppModel } from '../model.svelte';
export async function refreshAccounts(
  this: Pick<
    AppModel,
    | 'accounts'
    | 'capture'
    | 'captures'
    | 'changes'
    | 'contacts'
    | 'error'
    | 'groups'
    | 'pageView'
    | 'selectAccount'
    | 'selected'
  >,
): Promise<void> {
  try {
    this.accounts = await api.accounts();
    if (this.accounts.length) {
      if (!this.selected || !this.accounts.some((a) => a.id === this.selected?.id)) {
        await this.selectAccount(this.accounts[0]);
      }
    } else {
      this.selected = undefined;
      this.captures = [];
      this.capture = undefined;
      this.contacts = [];
      this.changes = [];
      this.groups = [];
      this.pageView = 'onboarding';
    }
  } catch (e) {
    this.error = String(e);
  }
}

export async function selectAccount(
  this: Pick<
    AppModel,
    | 'accountProfile'
    | 'capture'
    | 'captures'
    | 'chosenChange'
    | 'connected'
    | 'detail'
    | 'due'
    | 'error'
    | 'missingFields'
    | 'navigate'
    | 'offset'
    | 'refreshAllChanges'
    | 'refreshChanges'
    | 'refreshContacts'
    | 'refreshGroups'
    | 'search'
    | 'selected'
    | 'selectedGroups'
  >,
  account: Account,
): Promise<void> {
  this.missingFields = [];
  this.selected = account;
  this.detail = undefined;
  this.chosenChange = undefined;
  this.search = '';
  this.offset = 0;
  this.selectedGroups = [];
  try {
    this.accountProfile = await api.profile(account.id);
  } catch (_) {
    this.accountProfile = null;
  }
  try {
    this.captures = await api.captures(account.id);
    this.capture = this.captures[0];
    this.due = await api.due(account.id);
    this.connected = (await api.health(account.id)).connected;
    await this.refreshGroups();
    await this.refreshContacts();
    await this.refreshChanges();
    await this.refreshAllChanges();
    if (this.captures.length > 0) {
      this.navigate('contacts');
    } else {
      this.navigate('onboarding');
    }
  } catch (e) {
    this.error = String(e);
  }
}

export async function refreshGroups(
  this: Pick<AppModel, 'capture' | 'groups' | 'selected'>,
): Promise<void> {
  if (!this.selected || !this.capture) {
    this.groups = [];
    return;
  }
  try {
    const fetched = await api.groups(this.selected.id, this.capture.sequence);
    this.groups = fetched;
  } catch (e) {
    this.groups = [];
  }
}

export async function refreshContacts(
  this: Pick<
    AppModel,
    | 'allSnapshotContacts'
    | 'avatarMap'
    | 'capture'
    | 'contacts'
    | 'contactsRequest'
    | 'detail'
    | 'error'
    | 'media'
    | 'selected'
    | 'updateDisplayedContacts'
  >,
): Promise<void> {
  const request = ++this.contactsRequest;
  if (!this.selected || !this.capture) {
    this.allSnapshotContacts = [];
    this.avatarMap = {};
    this.contacts = [];
    return;
  }
  try {
    const [nextContacts, nextAvatars] = await Promise.all([
      api.contacts(this.selected.id, this.capture.sequence, '', null, 0),
      api
        .avatars(this.selected.id, this.capture.sequence)
        .catch(() => ({}) as Record<string, string>),
    ]);
    if (request !== this.contactsRequest) return;
    this.allSnapshotContacts = nextContacts;
    this.avatarMap = nextAvatars;
    this.updateDisplayedContacts();
  } catch (e) {
    if (request !== this.contactsRequest) return;
    this.error = String(e);
    this.allSnapshotContacts = [];
    this.contacts = [];
  }
  this.detail = undefined;
  this.media = [];
}

export async function backupSelected(
  this: Pick<AppModel, 'captures' | 'error' | 'selected'>,
): Promise<void> {
  if (!this.selected || this.captures.length === 0) return;
  try {
    const destination = await save({
      defaultPath: `contact-history-${this.selected.email}.contacthistory`,
    });
    if (destination) {
      await api.backupAccount(this.selected.id, destination);
    }
  } catch (e) {
    this.error = String(e);
  }
}

export async function restoreLocal(
  this: Pick<AppModel, 'error' | 'refreshAccounts' | 'selectAccount'>,
): Promise<void> {
  try {
    const source = await open({ directory: true, multiple: false });
    if (typeof source === 'string') {
      const account = await api.restoreArchive(source);
      await this.refreshAccounts();
      await this.selectAccount(account);
    }
  } catch (e) {
    this.error = String(e);
  }
}

export async function disconnectSelected(
  this: Pick<
    AppModel,
    | 'capture'
    | 'captures'
    | 'changes'
    | 'contacts'
    | 'error'
    | 'groups'
    | 'refreshAccounts'
    | 'selected'
    | 'settingsError'
  >,
): Promise<void> {
  if (!this.selected) return;
  this.settingsError = '';
  try {
    await api.disconnect(this.selected.id);
    this.selected = undefined;
    this.captures = [];
    this.capture = undefined;
    this.contacts = [];
    this.changes = [];
    this.groups = [];
    await this.refreshAccounts();
  } catch (e) {
    this.error = String(e);
    this.settingsError = String(e);
  }
}

export async function connectNewAccount(
  this: Pick<
    AppModel,
    'busy' | 'clientId' | 'clientSecret' | 'error' | 'refreshAccounts' | 'selectAccount'
  >,
): Promise<void> {
  this.busy = true;
  this.error = '';
  try {
    const account = await api.connect(this.clientId.trim(), this.clientSecret.trim());
    await this.refreshAccounts();
    await this.selectAccount(account);
    this.clientSecret = '';
  } catch (e) {
    this.error = String(e);
  } finally {
    this.busy = false;
  }
}
