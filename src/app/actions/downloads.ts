import { contactToVCard } from '../../lib/export-csv';
import { save, open } from '@tauri-apps/plugin-dialog';
import {
  generateContactCsv,
  generateMultipleContactsCsv,
  generateMultipleContactsVcf,
} from '../../lib/export-csv';
import { api, type Contact } from '../../lib/ipc';
import type { AppModel } from '../model.svelte';
export async function copyFieldValue(
  this: Pick<AppModel, 'copiedFieldKey' | 'copiedTimeout'>,
  key: string,
  text: string,
): Promise<void> {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    this.copiedFieldKey = key;
    if (this.copiedTimeout) clearTimeout(this.copiedTimeout);
    this.copiedTimeout = setTimeout(() => {
      this.copiedFieldKey = null;
    }, 2000);
  } catch (_) {}
}

export function downloadContactJson(
  this: Pick<AppModel, 'getDisplayName' | 'showToast' | 'triggerFileDownload'>,
  c: Contact,
): void {
  const name = this.getDisplayName(c);
  this.triggerFileDownload(
    JSON.stringify(c.payload, null, 2),
    contactFilename(name, 'json'),
    'application/json',
  );
  this.showToast(`Downloaded contact data for ${name}.`);
}

export function downloadContactVcf(
  this: Pick<AppModel, 'getDisplayName' | 'showToast' | 'triggerFileDownload'>,
  c: Contact,
): void {
  const name = this.getDisplayName(c);
  this.triggerFileDownload(contactToVCard(c), contactFilename(name, 'vcf'), 'text/vcard');
  this.showToast(`Downloaded vCard for ${name}.`);
}

export function downloadContactCsv(
  this: Pick<AppModel, 'getDisplayName' | 'groupMap' | 'showToast' | 'triggerFileDownload'>,
  c: Contact,
): void {
  const name = this.getDisplayName(c);
  this.triggerFileDownload(
    generateContactCsv(c, this.groupMap),
    contactFilename(name, 'csv'),
    'text/csv;charset=utf-8;',
  );
  this.showToast(`Downloaded Google CSV for ${name}.`);
}

export async function exportSelected(
  this: Pick<AppModel, 'capture' | 'error' | 'selected'>,
  format: 'csv' | 'vcf',
): Promise<void> {
  if (!this.selected || !this.capture || this.capture.contact_count === 0) return;
  try {
    const destination = await save({
      defaultPath: `contacts-capture-${this.capture.sequence}.${format}`,
      filters: [{ name: format === 'csv' ? 'Google CSV' : 'vCard', extensions: [format] }],
    });
    if (destination) {
      await api.exportCapture(this.selected.id, this.capture.sequence, format, destination);
    }
  } catch (e) {
    this.error = String(e);
  }
}

export function toggleContactSelection(
  this: Pick<
    AppModel,
    'favouriteContacts' | 'otherContacts' | 'selectionAnchorKey' | 'selectedContactKeys'
  >,
  resName: string,
  event?: MouseEvent | KeyboardEvent,
): void {
  if (event) {
    event.stopPropagation();
  }

  if (event?.shiftKey) {
    const rangeKeys = contactSelectionRange.call(this, resName);
    if (rangeKeys.length > 0) {
      const selected = new Set(this.selectedContactKeys);
      const shouldDeselect = selected.has(resName);
      for (const key of rangeKeys) {
        if (shouldDeselect) selected.delete(key);
        else selected.add(key);
      }
      this.selectedContactKeys = [...selected];
      return;
    }
  }

  if (this.selectedContactKeys.includes(resName)) {
    this.selectedContactKeys = this.selectedContactKeys.filter((k) => k !== resName);
  } else {
    this.selectedContactKeys = [...this.selectedContactKeys, resName];
  }
  this.selectionAnchorKey = resName;
}

export function contactSelectionRange(
  this: Pick<
    AppModel,
    'favouriteContacts' | 'otherContacts' | 'selectionAnchorKey' | 'selectedContactKeys'
  >,
  resName: string,
): string[] {
  if (!this.selectionAnchorKey || this.selectedContactKeys.length === 0) return [];

  const visibleKeys = [...this.favouriteContacts, ...this.otherContacts].map(
    (contact) => contact.resource_name,
  );
  const anchorIndex = visibleKeys.indexOf(this.selectionAnchorKey);
  const targetIndex = visibleKeys.indexOf(resName);
  if (anchorIndex === -1 || targetIndex === -1) return [];

  const start = Math.min(anchorIndex, targetIndex);
  const end = Math.max(anchorIndex, targetIndex);
  return visibleKeys.slice(start, end + 1);
}

export function previewContactSelection(
  this: Pick<
    AppModel,
    | 'contactSelectionRange'
    | 'hoveredSelectionContactKey'
    | 'selectionPreviewMode'
    | 'selectionPreviewKeys'
    | 'selectionPreviewCount'
    | 'selectedContactKeys'
  >,
  resName: string,
  shiftKey: boolean,
): void {
  this.hoveredSelectionContactKey = resName;
  updateSelectionPreview(this, shiftKey);
}

export function endContactSelectionPreview(
  this: Pick<
    AppModel,
    | 'hoveredSelectionContactKey'
    | 'selectionPreviewKeys'
    | 'selectionPreviewMode'
    | 'selectionPreviewCount'
  >,
  resName: string,
): void {
  if (this.hoveredSelectionContactKey !== resName) return;
  this.hoveredSelectionContactKey = null;
  this.selectionPreviewKeys = [];
  this.selectionPreviewMode = null;
  this.selectionPreviewCount = 0;
}

export function refreshContactSelectionPreview(
  this: Pick<
    AppModel,
    | 'contactSelectionRange'
    | 'hoveredSelectionContactKey'
    | 'selectionPreviewKeys'
    | 'selectionPreviewMode'
    | 'selectionPreviewCount'
    | 'selectedContactKeys'
  >,
  shiftKey: boolean,
): void {
  updateSelectionPreview(this, shiftKey);
}

function updateSelectionPreview(
  app: Pick<
    AppModel,
    | 'contactSelectionRange'
    | 'hoveredSelectionContactKey'
    | 'selectionPreviewKeys'
    | 'selectionPreviewMode'
    | 'selectionPreviewCount'
    | 'selectedContactKeys'
  >,
  shiftKey: boolean,
): void {
  const target = app.hoveredSelectionContactKey;
  const range = shiftKey && target ? app.contactSelectionRange(target) : [];
  const selected = new Set(app.selectedContactKeys);
  const mode = range.length === 0 ? null : target && selected.has(target) ? 'deselect' : 'select';
  const affected =
    mode === 'deselect'
      ? range.filter((key) => selected.has(key))
      : mode === 'select'
        ? range.filter((key) => !selected.has(key))
        : [];
  app.selectionPreviewKeys = affected;
  app.selectionPreviewMode = affected.length > 0 ? mode : null;
  app.selectionPreviewCount = affected.length;
}

export function clearContactSelectionPreview(
  this: Pick<
    AppModel,
    | 'hoveredSelectionContactKey'
    | 'selectionPreviewKeys'
    | 'selectionPreviewMode'
    | 'selectionPreviewCount'
  >,
): void {
  this.hoveredSelectionContactKey = null;
  this.selectionPreviewKeys = [];
  this.selectionPreviewMode = null;
  this.selectionPreviewCount = 0;
}

export function selectAllVisible(
  this: Pick<
    AppModel,
    'clearContactSelectionPreview' | 'contacts' | 'selectionAnchorKey' | 'selectedContactKeys'
  >,
): void {
  this.selectedContactKeys = this.contacts.map((c) => c.resource_name);
  this.selectionAnchorKey = null;
  this.clearContactSelectionPreview();
}

export function clearContactSelection(
  this: Pick<
    AppModel,
    | 'clearContactSelectionPreview'
    | 'selectionAnchorKey'
    | 'selectedContactKeys'
  >,
): void {
  this.selectedContactKeys = [];
  this.selectionAnchorKey = null;
  this.clearContactSelectionPreview();
}

export function toggleSelectAll(
  this: Pick<AppModel, 'clearContactSelection' | 'selectAllVisible' | 'selectedContactKeys'>,
): void {
  if (this.selectedContactKeys.length > 0) {
    this.clearContactSelection();
  } else {
    this.selectAllVisible();
  }
}

export function triggerFileDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function saveSelectedExport(
  app: Pick<AppModel, 'showToast'>,
  content: string,
  filename: string,
  format: 'csv' | 'vcf' | 'json',
  count: number,
): Promise<void> {
  try {
    const destination = await save({
      defaultPath: filename,
      filters: [{ name: { csv: 'Google CSV', vcf: 'vCard', json: 'JSON' }[format], extensions: [format] }],
    });
    if (!destination) return;
    await api.saveContactExport(destination, content);
    app.showToast(`Exported ${count} contact${count === 1 ? '' : 's'} to ${destination}.`);
  } catch (error) {
    app.showToast(`Export failed: ${String(error)}`, 7000);
  }
}

export async function downloadSelectedCsv(
  this: Pick<AppModel, 'groups' | 'selectedContactsList' | 'showToast'>,
): Promise<void> {
  if (this.selectedContactsList.length === 0) return;
  const groupMap = new Map<string, string>();
  for (const g of this.groups) {
    groupMap.set(g.resource_name, g.name);
  }
  const csvContent = generateMultipleContactsCsv(this.selectedContactsList, groupMap);
  const filename = `google-contacts-selected-${this.selectedContactsList.length}.csv`;
  await saveSelectedExport(this, csvContent, filename, 'csv', this.selectedContactsList.length);
}

export async function downloadSelectedVcf(
  this: Pick<AppModel, 'selectedContactsList' | 'showToast'>,
): Promise<void> {
  if (this.selectedContactsList.length === 0) return;
  const vcfContent = generateMultipleContactsVcf(this.selectedContactsList);
  const filename = `contacts-selected-${this.selectedContactsList.length}.vcf`;
  await saveSelectedExport(this, vcfContent, filename, 'vcf', this.selectedContactsList.length);
}

export async function downloadSelectedJson(
  this: Pick<AppModel, 'selectedContactsList' | 'showToast'>,
): Promise<void> {
  if (this.selectedContactsList.length === 0) return;
  const jsonContent = JSON.stringify(
    this.selectedContactsList.map((c) => ({
      resource_name: c.resource_name,
      display_name: c.display_name,
      version: c.version,
      payload: c.payload,
    })),
    null,
    2,
  );
  const filename = `contacts-selected-${this.selectedContactsList.length}.json`;
  await saveSelectedExport(this, jsonContent, filename, 'json', this.selectedContactsList.length);
}

export function sendEmailToSelected(
  this: Pick<AppModel, 'selectedContactsList' | 'toastMessage'>,
): void {
  if (this.selectedContactsList.length === 0) return;
  const emailSet = new Set<string>();
  for (const c of this.selectedContactsList) {
    const p = (c.payload || {}) as Record<string, any>;
    const ems = (p.emailAddresses as Array<any>) || (p.emails as Array<any>) || [];
    for (const em of ems) {
      const val = typeof em === 'string' ? em : em?.value;
      if (val && typeof val === 'string' && val.includes('@')) {
        emailSet.add(val.trim());
      }
    }
  }
  const emailList = Array.from(emailSet);
  if (emailList.length === 0) {
    this.toastMessage = 'Selected contacts do not have any email addresses';
    setTimeout(() => {
      if (this.toastMessage === 'Selected contacts do not have any email addresses') {
        this.toastMessage = '';
      }
    }, 3000);
    return;
  }
  const mailtoUrl = `mailto:${encodeURIComponent(emailList.join(','))}`;
  window.open(mailtoUrl, '_blank');
}

function contactFilename(name: string, extension: string): string {
  return `contact-${name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase()}.${extension}`;
}
