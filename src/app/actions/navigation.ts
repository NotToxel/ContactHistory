import type { AppModel } from '../model.svelte';
import type { Page, NavigationEntry } from '../types';
// Navigation & Data Refresh
export function currentNavigation(
  this: Pick<
    AppModel,
    | 'capture'
    | 'changesTab'
    | 'compareBaseSeq'
    | 'compareTargetSeq'
    | 'detail'
    | 'missingFieldMode'
    | 'missingFields'
    | 'navigationIndex'
    | 'pageView'
    | 'selected'
    | 'selectedGroups'
  >,
): NavigationEntry {
  return {
    contactHistoryNavigation: true,
    index: this.navigationIndex,
    accountId: this.selected?.id ?? null,
    snapshot: this.capture?.sequence ?? null,
    page: this.pageView,
    contact: this.detail?.resource_name ?? null,
    groups: [...this.selectedGroups],
    missingFields: [...this.missingFields],
    missingFieldMode: this.missingFieldMode,
    changesTab: this.changesTab,
    compareBase: this.compareBaseSeq,
    compareTarget: this.compareTargetSeq,
  };
}

export function recordNavigation(
  this: Pick<
    AppModel,
    | 'currentNavigation'
    | 'navigationIndex'
    | 'navigationMaxIndex'
    | 'navigationQueued'
    | 'navigationReady'
    | 'restoringNavigation'
  >,
): void {
  if (!this.navigationReady || this.restoringNavigation || this.navigationQueued) return;
  this.navigationQueued = true;
  queueMicrotask(() => {
    this.navigationQueued = false;
    if (this.restoringNavigation) return;
    const next = this.currentNavigation();
    const previous = window.history.state as NavigationEntry | null;
    if (previous?.contactHistoryNavigation) {
      const { index: _oldIndex, ...oldDestination } = previous;
      const { index: _newIndex, ...newDestination } = next;
      if (JSON.stringify(oldDestination) === JSON.stringify(newDestination)) return;
    }
    this.navigationIndex++;
    this.navigationMaxIndex = this.navigationIndex;
    window.history.pushState({ ...next, index: this.navigationIndex }, '');
  });
}

export function goBack(this: Pick<AppModel, 'navigationIndex'>): void {
  if (this.navigationIndex > 0) window.history.back();
}

export function goForward(this: Pick<AppModel, 'navigationIndex' | 'navigationMaxIndex'>): void {
  if (this.navigationIndex < this.navigationMaxIndex) window.history.forward();
}

export async function restoreNavigation(
  this: Pick<
    AppModel,
    | 'accounts'
    | 'allSnapshotContacts'
    | 'capture'
    | 'captures'
    | 'changeCapture'
    | 'changesTab'
    | 'compareBaseSeq'
    | 'compareTargetSeq'
    | 'detail'
    | 'error'
    | 'groups'
    | 'missingFieldMode'
    | 'missingFields'
    | 'navigationIndex'
    | 'navigationRequest'
    | 'offset'
    | 'pageView'
    | 'refreshChangesComparison'
    | 'restoringNavigation'
    | 'selectAccount'
    | 'selectContact'
    | 'selected'
    | 'selectedGroups'
    | 'showAccountMenu'
    | 'showPhotosModal'
    | 'showRawDataModal'
    | 'showSettingsModal'
    | 'showSnapshotDropdown'
    | 'updateDisplayedContacts'
  >,
  entry: NavigationEntry,
): Promise<void> {
  const request = ++this.navigationRequest;
  this.restoringNavigation = true;
  this.navigationIndex = entry.index;
  try {
    const account = this.accounts.find((item) => item.id === entry.accountId);
    if (account && this.selected?.id !== account.id) await this.selectAccount(account);
    if (request !== this.navigationRequest) return;
    if (
      entry.snapshot &&
      this.capture?.sequence !== entry.snapshot &&
      this.captures.some((item) => item.sequence === entry.snapshot)
    ) {
      await this.changeCapture(entry.snapshot);
    }
    if (request !== this.navigationRequest) return;
    this.selectedGroups = entry.groups.filter((name) =>
      this.groups.some((group) => group.resource_name === name),
    );
    this.missingFields = entry.missingFields ?? [];
    this.missingFieldMode = entry.missingFieldMode ?? 'any';
    this.offset = 0;
    this.updateDisplayedContacts();
    this.pageView = entry.page;
    this.changesTab = entry.changesTab;
    this.compareBaseSeq = entry.compareBase;
    this.compareTargetSeq = entry.compareTarget;
    if (this.pageView === 'changes' && this.changesTab === 'comparison')
      this.refreshChangesComparison();
    this.detail = undefined;
    if (entry.contact && this.pageView === 'contacts') {
      const contact = this.allSnapshotContacts.find((item) => item.resource_name === entry.contact);
      if (contact) await this.selectContact(contact);
    }
    this.showSettingsModal = false;
    this.showRawDataModal = false;
    this.showPhotosModal = false;
    this.showAccountMenu = false;
    this.showSnapshotDropdown = false;
    this.error = '';
  } finally {
    if (request === this.navigationRequest) this.restoringNavigation = false;
  }
}

export function handlePopState(
  this: Pick<AppModel, 'restoreNavigation'>,
  event: PopStateEvent,
): void {
  const entry = event.state as NavigationEntry | null;
  if (entry?.contactHistoryNavigation) void this.restoreNavigation(entry);
}

export function handleNativeNavigation(
  this: Pick<AppModel, 'goBack' | 'goForward'>,
  event: MouseEvent,
): void {
  if (event.button === 3 || event.button === 4) {
    event.preventDefault();
    if (event.button === 3) this.goBack();
    else this.goForward();
  }
}

export function navigate(
  this: Pick<AppModel, 'error' | 'pageView' | 'recordNavigation'>,
  to: Page,
): void {
  this.pageView = to;
  this.error = '';
  this.recordNavigation();
}
