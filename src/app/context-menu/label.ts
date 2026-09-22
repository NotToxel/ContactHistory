import { openContextMenu, type ContextMenuItem } from '../../lib/context-menu.svelte';
import { type Contact } from '../../lib/ipc';
import type { AppModel } from '../model.svelte';
export function labelMenu(
  this: AppModel,
  e: MouseEvent,
  target: HTMLElement,
  selectedText: string,
): boolean {
  const items: ContextMenuItem[] = [];
  let header: string | undefined;
  let subHeader: string | undefined;
  // 8. Label Item Context
  const labelItemEl = target.closest('[data-label-res]') as HTMLElement | null;
  if (labelItemEl) {
    const labelRes = labelItemEl.dataset.labelRes!;
    const labelName = labelItemEl.dataset.labelName || 'Label';
    header = labelName;
    subHeader = 'Contact Label';
    const isFiltered = this.selectedGroups.includes(labelRes);
    items.push({
      id: 'label-toggle',
      label: isFiltered
        ? `Remove from filter: "${labelName}"`
        : `Filter contacts by "${labelName}"`,
      icon: 'label',
      action: () => {
        this.toggleLabelFilter(labelRes);
        this.navigate('contacts');
      },
    });
    items.push({
      id: 'label-isolate',
      label: `Filter only "${labelName}"`,
      icon: 'filter_alt',
      action: () => {
        this.isolateLabelFilter(labelRes);
        this.navigate('contacts');
      },
    });
    items.push({
      id: 'label-copy-name',
      label: 'Copy Label Name',
      icon: 'content_copy',
      divider: true,
      action: async () => {
        await navigator.clipboard.writeText(labelName);
      },
    });
    if (this.selectedGroups.length > 0) {
      items.push({
        id: 'label-clear',
        label: 'Clear All Label Filters',
        icon: 'label_off',
        action: () => {
          this.clearLabelFilter();
        },
      });
    }
    openContextMenu({ x: e.clientX, y: e.clientY, items, header, subHeader });
    return true;
  }

  return false;
}
