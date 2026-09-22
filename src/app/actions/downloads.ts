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
  this: Pick<AppModel, 'selectedContactKeys'>,
  resName: string,
  event?: MouseEvent,
): void {
  if (event) {
    event.stopPropagation();
  }
  if (this.selectedContactKeys.includes(resName)) {
    this.selectedContactKeys = this.selectedContactKeys.filter((k) => k !== resName);
  } else {
    this.selectedContactKeys = [...this.selectedContactKeys, resName];
  }
}

export function selectAllVisible(this: Pick<AppModel, 'contacts' | 'selectedContactKeys'>): void {
  this.selectedContactKeys = this.contacts.map((c) => c.resource_name);
}

export function clearContactSelection(this: Pick<AppModel, 'selectedContactKeys'>): void {
  this.selectedContactKeys = [];
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
