import { open } from '@tauri-apps/plugin-dialog';
import { openContextMenu, type ContextMenuItem } from '../../lib/context-menu.svelte';
import { api, type Contact } from '../../lib/ipc';
import type { AppModel } from '../model.svelte';
export function detailMenu(
  this: AppModel,
  e: MouseEvent,
  target: HTMLElement,
  selectedText: string,
): boolean {
  const items: ContextMenuItem[] = [];
  let header: string | undefined;
  let subHeader: string | undefined;
  // 5. Contact Detail View Context
  if (this.detail && target.closest('.detail-view')) {
    const displayName = this.getDisplayName(this.detail);
    const emailTarget = target.closest('[data-context="email"]') as HTMLElement | null;
    const phoneTarget = target.closest('[data-context="phone"]') as HTMLElement | null;
    const addressTarget = target.closest(
      '[data-context="address"], .field-address-link',
    ) as HTMLElement | null;
    const avatarTarget = target.closest('.hero-avatar') as HTMLElement | null;
    const notesTarget = target.closest('[data-context="notes"]') as HTMLElement | null;
    if (emailTarget) {
      const emailVal = emailTarget.dataset.emailValue || this.getPrimaryEmail(this.detail.payload);
      header = emailVal;
      subHeader = 'Email Address';
      items.push({
        id: 'detail-send-email',
        label: 'Send Email',
        icon: 'mail',
        action: () => {
          window.open('mailto:' + emailVal, '_blank');
        },
      });
      items.push({
        id: 'detail-copy-email',
        label: 'Copy Email Address',
        icon: 'content_copy',
        action: async () => {
          await this.copyFieldValue('email', emailVal);
        },
      });
      items.push({
        id: 'detail-copy-contact',
        label: 'Copy All Contact Details',
        icon: 'badge',
        divider: true,
        action: async () => {
          await this.copyFieldValue('all', this.formatContactSummary(this.detail!));
        },
      });
      openContextMenu({ x: e.clientX, y: e.clientY, items, header, subHeader });
      return true;
    }
    if (phoneTarget) {
      const phoneVal = phoneTarget.dataset.phoneValue || this.getPrimaryPhone(this.detail.payload);
      header = phoneVal;
      subHeader = 'Phone Number';
      items.push({
        id: 'detail-call-phone',
        label: 'Call Number',
        icon: 'call',
        action: () => {
          window.open('tel:' + phoneVal, '_blank');
        },
      });
      items.push({
        id: 'detail-copy-phone',
        label: 'Copy Phone Number',
        icon: 'content_copy',
        action: async () => {
          await this.copyFieldValue('phone', phoneVal);
        },
      });
      items.push({
        id: 'detail-copy-contact',
        label: 'Copy All Contact Details',
        icon: 'badge',
        divider: true,
        action: async () => {
          await this.copyFieldValue('all', this.formatContactSummary(this.detail!));
        },
      });
      openContextMenu({ x: e.clientX, y: e.clientY, items, header, subHeader });
      return true;
    }
    if (addressTarget) {
      const addrVal =
        addressTarget.dataset.addressValue || this.getPrimaryAddress(this.detail.payload);
      header = addrVal;
      subHeader = 'Address';
      items.push({
        id: 'detail-maps-open',
        label: 'Open in Google Maps',
        icon: 'map',
        action: () => {
          window.open(
            `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addrVal)}`,
            '_blank',
          );
        },
      });
      items.push({
        id: 'detail-copy-address',
        label: 'Copy Address',
        icon: 'content_copy',
        action: async () => {
          await this.copyFieldValue('address', addrVal);
        },
      });
      openContextMenu({ x: e.clientX, y: e.clientY, items, header, subHeader });
      return true;
    }
    if (avatarTarget) {
      header = displayName;
      subHeader = 'Profile Photos';
      items.push({
        id: 'detail-view-photos',
        label: 'View Photos Gallery',
        icon: 'photo_library',
        action: () => {
          this.showPhotosModal = true;
        },
      });
      const avatarSrc = this.getAvatarSource(this.detail, this.media);
      if (avatarSrc && avatarSrc.startsWith('http')) {
        items.push({
          id: 'detail-copy-photo-url',
          label: 'Copy Photo URL',
          icon: 'link',
          action: async () => {
            await navigator.clipboard.writeText(avatarSrc);
          },
        });
      }
      openContextMenu({ x: e.clientX, y: e.clientY, items, header, subHeader });
      return true;
    }
    if (notesTarget) {
      const notesVal = notesTarget.dataset.notesValue || this.getNotes(this.detail.payload);
      header = 'Notes';
      subHeader = displayName;
      items.push({
        id: 'detail-copy-notes',
        label: 'Copy Notes',
        icon: 'content_copy',
        action: async () => {
          await this.copyFieldValue('notes', notesVal);
        },
      });
      openContextMenu({ x: e.clientX, y: e.clientY, items, header, subHeader });
      return true;
    }
    // General Detail View Context
    header = displayName;
    subHeader = `v${this.detail.version} • ${this.getPrimaryEmail(this.detail.payload) || ''}`;
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
      id: 'detail-copy-name',
      label: 'Copy Name',
      icon: 'badge',
      action: async () => {
        await this.copyFieldValue('name', displayName);
      },
    });
    items.push({
      id: 'detail-copy-all',
      label: 'Copy All Details',
      icon: 'content_copy',
      action: async () => {
        await this.copyFieldValue('all', this.formatContactSummary(this.detail!));
      },
    });
    items.push({
      id: 'detail-view-payload',
      label: 'View Raw Payload',
      icon: 'data_object',
      divider: true,
      action: () => {
        this.showRawDataModal = true;
      },
    });
    items.push({
      id: 'detail-export-csv',
      label: 'Export Google CSV',
      icon: 'table_chart',
      action: () => {
        this.downloadContactCsv(this.detail!);
      },
    });
    items.push({
      id: 'detail-export-vcf',
      label: 'Export vCard',
      icon: 'contact_page',
      action: () => {
        this.downloadContactVcf(this.detail!);
      },
    });
    items.push({
      id: 'detail-export-json',
      label: 'Export JSON',
      icon: 'download',
      action: () => {
        this.downloadContactJson(this.detail!);
      },
    });
    items.push({
      id: 'detail-print',
      label: 'Print Contact',
      icon: 'print',
      divider: true,
      action: () => {
        this.openPrintDialog(this.detail);
      },
    });
    items.push({
      id: 'detail-back',
      label: 'Back to Contacts List',
      icon: 'arrow_back',
      action: () => {
        this.detail = undefined;
      },
    });
    openContextMenu({ x: e.clientX, y: e.clientY, items, header, subHeader });
    return true;
  }

  return false;
}
