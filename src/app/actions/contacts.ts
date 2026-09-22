import { api, type Contact, type ContactHistoryEntry } from '../../lib/ipc';
import type { AppModel } from '../model.svelte';
export async function selectContact(
  this: Pick<
    AppModel,
    | 'capture'
    | 'contactHistory'
    | 'detail'
    | 'detailViewEl'
    | 'expandedHistoryVersions'
    | 'isScrolled'
    | 'loadingHistory'
    | 'media'
    | 'mediaCache'
    | 'originalDetail'
    | 'previewBusy'
    | 'previewRequest'
    | 'previewSequence'
    | 'recordNavigation'
    | 'selected'
    | 'selectedPhotoUrl'
    | 'showDetailMenu'
    | 'showStickyName'
  >,
  contact: Contact,
): Promise<void> {
  const request = ++this.previewRequest;
  this.originalDetail = contact;
  this.previewSequence = null;
  this.previewBusy = false;
  this.detail = contact;
  this.recordNavigation();
  this.showStickyName = false;
  this.isScrolled = false;
  this.showDetailMenu = false;
  if (this.detailViewEl) {
    this.detailViewEl.scrollTop = 0;
  }
  this.selectedPhotoUrl = null;
  this.contactHistory = [];
  this.expandedHistoryVersions = new Set();
  this.media = this.mediaCache.get(contact.resource_name) || [];
  if (this.selected) {
    this.loadingHistory = true;
    try {
      const history = await api.contactHistory(this.selected.id, contact.resource_name);
      if (request === this.previewRequest) this.contactHistory = history;
    } catch (e) {
      if (request === this.previewRequest) this.contactHistory = [];
    } finally {
      if (request === this.previewRequest) this.loadingHistory = false;
    }
    if (this.capture) {
      try {
        const loadedMedia = await api.media(
          this.selected.id,
          this.capture.sequence,
          contact.resource_name,
        );
        this.mediaCache.set(contact.resource_name, loadedMedia);
        if (
          request === this.previewRequest &&
          this.detail?.resource_name === contact.resource_name
        ) {
          this.media = loadedMedia;
        }
      } catch (e) {
        // non-blocking
      }
    }
  }
}

export function selectLabelFilter(
  this: Pick<
    AppModel,
    | 'detail'
    | 'offset'
    | 'recordNavigation'
    | 'selectedGroups'
    | 'sidebarCollapsed'
    | 'updateDisplayedContacts'
  >,
  groupResourceName: string | null,
): void {
  if (groupResourceName === null) {
    this.selectedGroups = [];
  } else {
    this.selectedGroups = [groupResourceName];
  }
  if (window.innerWidth < 1000) this.sidebarCollapsed = true;
  this.offset = 0;
  this.detail = undefined;
  this.updateDisplayedContacts();
  this.recordNavigation();
}

export function toggleLabelFilter(
  this: Pick<
    AppModel,
    | 'detail'
    | 'offset'
    | 'recordNavigation'
    | 'selectedGroups'
    | 'sidebarCollapsed'
    | 'updateDisplayedContacts'
  >,
  groupResourceName: string,
): void {
  if (this.selectedGroups.includes(groupResourceName)) {
    this.selectedGroups = this.selectedGroups.filter((g) => g !== groupResourceName);
  } else {
    this.selectedGroups = [...this.selectedGroups, groupResourceName];
  }
  if (window.innerWidth < 1000) this.sidebarCollapsed = true;
  this.offset = 0;
  this.detail = undefined;
  this.updateDisplayedContacts();
  this.recordNavigation();
}

export function isolateLabelFilter(
  this: Pick<
    AppModel,
    | 'detail'
    | 'offset'
    | 'recordNavigation'
    | 'selectedGroups'
    | 'sidebarCollapsed'
    | 'updateDisplayedContacts'
  >,
  groupResourceName: string,
): void {
  this.selectedGroups = [groupResourceName];
  if (window.innerWidth < 1000) this.sidebarCollapsed = true;
  this.offset = 0;
  this.detail = undefined;
  this.updateDisplayedContacts();
  this.recordNavigation();
}

export function clearLabelFilter(
  this: Pick<
    AppModel,
    | 'detail'
    | 'offset'
    | 'recordNavigation'
    | 'selectedGroups'
    | 'sidebarCollapsed'
    | 'updateDisplayedContacts'
  >,
): void {
  this.selectedGroups = [];
  if (window.innerWidth < 1000) this.sidebarCollapsed = true;
  this.offset = 0;
  this.detail = undefined;
  this.updateDisplayedContacts();
  this.recordNavigation();
}

export async function changeCapture(
  this: Pick<
    AppModel,
    | 'capture'
    | 'captures'
    | 'offset'
    | 'recordNavigation'
    | 'refreshChanges'
    | 'refreshContacts'
    | 'refreshGroups'
    | 'selectedGroups'
    | 'showSnapshotDropdown'
  >,
  sequence: number,
): Promise<void> {
  this.capture = this.captures.find((c) => c.sequence === sequence);
  this.offset = 0;
  this.selectedGroups = [];
  this.showSnapshotDropdown = false;
  await this.refreshGroups();
  await this.refreshContacts();
  await this.refreshChanges();
  this.recordNavigation();
}

export async function previewContactRevision(
  this: Pick<
    AppModel,
    | 'detail'
    | 'detailViewEl'
    | 'media'
    | 'originalDetail'
    | 'pageView'
    | 'previewBusy'
    | 'previewRequest'
    | 'previewSequence'
    | 'selected'
    | 'selectedPhotoUrl'
    | 'toastMessage'
  >,
  entry: ContactHistoryEntry,
): Promise<void> {
  if (!this.selected || !this.originalDetail || !entry.after || this.previewBusy) return;
  const request = ++this.previewRequest;
  const resourceName = this.originalDetail.resource_name;
  this.previewBusy = true;
  try {
    const contact = await api.contactAtSnapshot(this.selected.id, entry.sequence, resourceName);
    if (request !== this.previewRequest || !contact) return;
    const previewMedia = await api
      .media(this.selected.id, entry.sequence, resourceName)
      .catch(() => []);
    if (request !== this.previewRequest) return;
    if (this.detail?.resource_name !== resourceName || this.pageView !== 'contacts') return;
    this.detail = contact;
    this.media = previewMedia;
    this.previewSequence = entry.sequence;
    this.selectedPhotoUrl = null;
    this.detailViewEl?.scrollTo({ top: 0 });
  } catch (e) {
    if (request === this.previewRequest)
      this.toastMessage = `Could not preview revision: ${String(e)}`;
  } finally {
    if (request === this.previewRequest) this.previewBusy = false;
  }
}

export function restoreContactRevision(
  this: Pick<
    AppModel,
    | 'detail'
    | 'media'
    | 'mediaCache'
    | 'originalDetail'
    | 'previewBusy'
    | 'previewRequest'
    | 'previewSequence'
    | 'selectedPhotoUrl'
  >,
): void {
  if (!this.originalDetail) return;
  this.previewRequest++;
  this.detail = this.originalDetail;
  this.previewSequence = null;
  this.previewBusy = false;
  this.selectedPhotoUrl = null;
  this.media = this.mediaCache.get(this.originalDetail.resource_name) || [];
}
