import { openContextMenu, type ContextMenuItem } from '../../lib/context-menu.svelte';
import type { AppModel } from '../model.svelte';
export function inputMenu(
  this: AppModel,
  e: MouseEvent,
  target: HTMLElement,
  selectedText: string,
): boolean {
  const items: ContextMenuItem[] = [];
  let header: string | undefined;
  let subHeader: string | undefined;
  // 2. Input or Textarea Context
  const isInput = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
  if (isInput) {
    const inputEl = target as HTMLInputElement | HTMLTextAreaElement;
    const selStart = inputEl.selectionStart ?? 0;
    const selEnd = inputEl.selectionEnd ?? 0;
    const hasSelection = selStart !== selEnd;
    const isReadonly = inputEl.readOnly || inputEl.disabled;
    const hasValue = Boolean(inputEl.value && inputEl.value.length > 0);
    header =
      inputEl.placeholder ||
      (inputEl instanceof HTMLInputElement && inputEl.type === 'search' ? 'Search' : 'Text Input');
    items.push({
      id: 'input-cut',
      label: 'Cut',
      icon: 'content_cut',
      shortcut: 'Ctrl+X',
      disabled: !hasSelection || isReadonly,
      action: async () => {
        const text = inputEl.value.substring(selStart, selEnd);
        await navigator.clipboard.writeText(text);
        inputEl.setRangeText('', selStart, selEnd, 'end');
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      },
    });
    items.push({
      id: 'input-copy',
      label: 'Copy',
      icon: 'content_copy',
      shortcut: 'Ctrl+C',
      disabled: !hasSelection,
      action: async () => {
        const text = inputEl.value.substring(selStart, selEnd);
        await navigator.clipboard.writeText(text);
      },
    });
    items.push({
      id: 'input-paste',
      label: 'Paste',
      icon: 'content_paste',
      shortcut: 'Ctrl+V',
      disabled: isReadonly,
      action: async () => {
        try {
          const text = await navigator.clipboard.readText();
          inputEl.setRangeText(text, selStart, selEnd, 'end');
          inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        } catch (_) {}
      },
    });
    items.push({
      id: 'input-select-all',
      label: 'Select All',
      icon: 'select_all',
      shortcut: 'Ctrl+A',
      disabled: !hasValue,
      action: () => {
        inputEl.select();
      },
    });
    if (inputEl === this.searchInputEl || inputEl.classList.contains('topbar-search-input')) {
      items.push({
        id: 'input-clear-search',
        label: 'Clear Search',
        icon: 'backspace',
        divider: true,
        disabled: !hasValue,
        action: () => {
          this.clearSearch();
        },
      });
    } else {
      items.push({
        id: 'input-clear',
        label: 'Clear',
        icon: 'backspace',
        divider: true,
        disabled: !hasValue || isReadonly,
        action: () => {
          inputEl.value = '';
          inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        },
      });
    }
    openContextMenu({ x: e.clientX, y: e.clientY, items, header, subHeader });
    return true;
  }

  return false;
}
