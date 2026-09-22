import { version as appVersion } from '../../../package.json';
import { applyPreferences, type Preferences } from '../../lib/preferences';
import { openContextMenu, type ContextMenuItem } from '../../lib/context-menu.svelte';
import { type Contact } from '../../lib/ipc';
import type { AppModel } from '../model.svelte';
export function fallbackMenu(
  this: AppModel,
  e: MouseEvent,
  target: HTMLElement,
  selectedText: string,
): boolean {
  const items: ContextMenuItem[] = [];
  let header: string | undefined;
  let subHeader: string | undefined;
  // 9. General Text Selection without an element context
  if (selectedText) {
    header = 'Text Selection';
    subHeader = `${selectedText.length} characters`;
    items.push({
      id: 'sel-copy',
      label: `Copy "${selectedText.length > 24 ? selectedText.slice(0, 22) + '…' : selectedText}"`,
      icon: 'content_copy',
      shortcut: 'Ctrl+C',
      action: async () => {
        await navigator.clipboard.writeText(selectedText);
      },
    });
    items.push({
      id: 'sel-search',
      label: `Search in Contacts for "${selectedText.length > 20 ? selectedText.slice(0, 18) + '…' : selectedText}"`,
      icon: 'search',
      action: () => {
        this.search = selectedText;
        this.navigate('contacts');
        this.onSearchInput();
      },
    });
    items.push({
      id: 'sel-divider',
      divider: true,
      label: '',
    });
  }
  // 10. Global / Fallback Default Context
  header = header || 'Contact History';
  subHeader =
    subHeader ||
    `v${appVersion} • ${this.accountProfile?.name || this.selected?.email || 'Local Archive'}`;
  items.push({
    id: 'global-capture',
    label: 'Take Snapshot Now',
    icon: 'sync',
    shortcut: 'Ctrl+R',
    disabled: this.busy || !this.selected,
    action: () => {
      this.captureNow();
    },
  });
  items.push({
    id: 'global-import',
    label: 'Import Contacts (CSV)...',
    icon: 'upload',
    disabled: this.busy || !this.selected,
    action: () => {
      this.importCsv();
    },
  });
  items.push({
    id: 'global-export-snapshot',
    label: 'Export Current Snapshot (CSV)...',
    icon: 'table_chart',
    disabled: !this.capture || this.capture.contact_count === 0,
    action: () => {
      this.exportSelected('csv');
    },
  });
  items.push({
    id: 'global-nav-contacts',
    label: 'Go to Contacts',
    icon: 'person',
    divider: true,
    action: () => {
      this.detail = undefined;
      this.navigate('contacts');
    },
  });
  items.push({
    id: 'global-nav-changes',
    label: 'Go to Changes',
    icon: 'history',
    action: () => {
      this.navigate('changes');
    },
  });
  items.push({
    id: 'global-settings',
    label: 'Settings & Preferences',
    icon: 'settings',
    shortcut: 'Ctrl+,',
    action: () => {
      this.showSettingsModal = true;
    },
  });
  items.push({
    id: 'global-theme',
    label: this.preferences.theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode',
    icon: this.preferences.theme === 'dark' ? 'light_mode' : 'dark_mode',
    divider: true,
    action: () => {
      const nextTheme = this.preferences.theme === 'dark' ? 'light' : 'dark';
      this.updatePreferences({ theme: nextTheme });
      applyPreferences(this.preferences);
    },
  });
  items.push({
    id: 'global-refresh',
    label: 'Refresh Data',
    icon: 'refresh',
    action: () => {
      this.refreshContacts();
      this.refreshGroups();
      this.refreshChanges();
    },
  });
  openContextMenu({ x: e.clientX, y: e.clientY, items, header, subHeader });

  return true;
}
