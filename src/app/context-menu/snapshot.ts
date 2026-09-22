import { openContextMenu, type ContextMenuItem } from '../../lib/context-menu.svelte';
import type { AppModel } from '../model.svelte';
export function snapshotMenu(
  this: AppModel,
  e: MouseEvent,
  target: HTMLElement,
  selectedText: string,
): boolean {
  const items: ContextMenuItem[] = [];
  let header: string | undefined;
  let subHeader: string | undefined;
  // 6. Snapshot Item Context (inside snapshot dropdown)
  const snapshotEl = target.closest('[data-snapshot-seq]') as HTMLElement | null;
  if (snapshotEl) {
    const seqStr = snapshotEl.dataset.snapshotSeq;
    const seq = seqStr ? parseInt(seqStr, 10) : 0;
    if (seq > 0) {
      header = `Snapshot #${seq}`;
      subHeader = 'Archive Snapshot';
      items.push({
        id: 'snapshot-switch',
        label: `Switch to Snapshot #${seq}`,
        icon: 'history',
        disabled: this.capture?.sequence === seq,
        action: () => {
          this.changeCapture(seq);
          this.showSnapshotDropdown = false;
        },
      });
      items.push({
        id: 'snapshot-compare-prev',
        label: 'Compare with Prior Snapshot',
        icon: 'compare_arrows',
        action: () => {
          this.compareSnapshotWithPrior(seq);
          this.navigate('changes');
          this.showSnapshotDropdown = false;
        },
      });
      items.push({
        id: 'snapshot-delete',
        label: `Delete Snapshot #${seq}`,
        icon: 'delete',
        disabled: this.busy || this.archiveActionBusy,
        action: () => {
          this.error = '';
          this.deleteSnapshotTarget = this.captures.find((item) => item.sequence === seq) ?? null;
          this.showSnapshotDropdown = false;
        },
      });
      openContextMenu({ x: e.clientX, y: e.clientY, items, header, subHeader });
      return true;
    }
  }

  return false;
}
