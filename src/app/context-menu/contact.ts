import { open } from '@tauri-apps/plugin-dialog';
import { openContextMenu, type ContextMenuItem } from '../../lib/context-menu.svelte';
import { type Contact } from '../../lib/ipc';
import type { AppModel } from '../model.svelte';
export function contactMenu(
  this: AppModel,
  e: MouseEvent,
  target: HTMLElement,
  selectedText: string,
): boolean {
  const items: ContextMenuItem[] = [];
  let header: string | undefined;
  let subHeader: string | undefined;
  // 4. Contact Item Context (Contacts Table Row or Search Result Item)
  const contactRowEl = target.closest('[data-contact-res]') as HTMLElement | null;
  const contactRes = contactRowEl?.dataset.contactRes;
  const contact = contactRes
    ? this.allSnapshotContacts.find((c) => c.resource_name === contactRes)
    : undefined;
  if (contact) {
    const displayName = this.getDisplayName(contact);
    const email = this.getPrimaryEmail(contact.payload);
    const phone = this.getPrimaryPhone(contact.payload);
    header = displayName;
    subHeader = email || phone || `v${contact.version}`;
    if (selectedText) {
      items.push({
        id: 'copy-selection',
        label: `Copy "${selectedText.length > 20 ? selectedText.slice(0, 18) + '…' : selectedText}"`,
        icon: 'content_copy',
        shortcut: 'Ctrl+C',
        action: async () => {
          await navigator.clipboard.writeText(selectedText);
        },
      });
    }
    items.push({
      id: 'contact-view',
      label: 'View Contact Details',
      icon: 'person',
      action: () => {
        this.selectContact(contact);
        if (this.pageView !== 'contacts') this.navigate('contacts');
      },
    });
    items.push({
      id: 'contact-copy-name',
      label: 'Copy Name',
      icon: 'badge',
      divider: true,
      action: async () => {
        await this.copyFieldValue('name', displayName);
      },
    });
    if (email) {
      items.push({
        id: 'contact-copy-email',
        label: 'Copy Email Address',
        icon: 'mail',
        action: async () => {
          await this.copyFieldValue('email', email);
        },
      });
      items.push({
        id: 'contact-send-email',
        label: 'Send Email',
        icon: 'send',
        action: () => {
          window.open('mailto:' + email, '_blank');
        },
      });
    }
    if (phone) {
      items.push({
        id: 'contact-copy-phone',
        label: 'Copy Phone Number',
        icon: 'call',
        action: async () => {
          await this.copyFieldValue('phone', phone);
        },
      });
    }
    items.push({
      id: 'contact-copy-all',
      label: 'Copy All Details',
      icon: 'content_copy',
      action: async () => {
        const text = this.formatContactSummary(contact);
        await this.copyFieldValue('all', text);
      },
    });
    items.push({
      id: 'contact-export-csv',
      label: 'Export as Google CSV',
      icon: 'table_chart',
      divider: true,
      action: () => {
        this.downloadContactCsv(contact);
      },
    });
    items.push({
      id: 'contact-export-vcf',
      label: 'Export as vCard (.vcf)',
      icon: 'contact_page',
      action: () => {
        this.downloadContactVcf(contact);
      },
    });
    items.push({
      id: 'contact-export-json',
      label: 'Export as JSON',
      icon: 'download',
      action: () => {
        this.downloadContactJson(contact);
      },
    });
    items.push({
      id: 'contact-view-raw',
      label: 'View Raw JSON Payload',
      icon: 'data_object',
      divider: true,
      action: () => {
        this.detail = contact;
        this.showRawDataModal = true;
      },
    });
    openContextMenu({ x: e.clientX, y: e.clientY, items, header, subHeader });
    return true;
  }

  return false;
}
