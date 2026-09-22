import { openContextMenu, type ContextMenuItem } from '../../lib/context-menu.svelte';
import { type Contact, type Change } from '../../lib/ipc';
import type { AppModel } from '../model.svelte';
export function changeMenu(
  this: AppModel,
  e: MouseEvent,
  target: HTMLElement,
  selectedText: string,
): boolean {
  const items: ContextMenuItem[] = [];
  let header: string | undefined;
  let subHeader: string | undefined;
  // 7. Change Card Context (inside Changes or Changelog tab)
  const changeCardEl = target.closest('[data-change-card]') as HTMLElement | null;
  if (changeCardEl) {
    const changeRes = changeCardEl.dataset.changeRes;
    const changeName = changeCardEl.dataset.changeName || 'Contact Change';
    header = changeName;
    subHeader = 'Snapshot Change Record';
    const matchedContact = changeRes
      ? this.allSnapshotContacts.find((c) => c.resource_name === changeRes)
      : undefined;
    if (matchedContact) {
      items.push({
        id: 'change-view-contact',
        label: 'View Current Contact Details',
        icon: 'person',
        action: () => {
          this.selectContact(matchedContact);
          this.navigate('contacts');
        },
      });
    }
    items.push({
      id: 'change-copy-name',
      label: 'Copy Name',
      icon: 'badge',
      action: async () => {
        await navigator.clipboard.writeText(changeName);
      },
    });
    items.push({
      id: 'change-copy-res',
      label: 'Copy Resource ID',
      icon: 'tag',
      action: async () => {
        if (changeRes) await navigator.clipboard.writeText(changeRes);
      },
    });
    openContextMenu({ x: e.clientX, y: e.clientY, items, header, subHeader });
    return true;
  }

  return false;
}
