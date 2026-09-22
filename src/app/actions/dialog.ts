import { open } from '@tauri-apps/plugin-dialog';
// Keep keyboard focus inside open dialogs and restore it to their trigger.
export function focusDialog(node: HTMLElement): { destroy(): void } {
  const previous = document.activeElement as HTMLElement | null;
  const focusable = () =>
    [
      ...node.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]',
      ),
    ].filter((el) => el.getClientRects().length);
  queueMicrotask(() => focusable()[0]?.focus());
  const trap = (event: KeyboardEvent) => {
    if (event.key !== 'Tab') return;
    const items = focusable();
    const first = items[0],
      last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };
  node.addEventListener('keydown', trap);
  return {
    destroy() {
      node.removeEventListener('keydown', trap);
      previous?.focus();
    },
  };
}
