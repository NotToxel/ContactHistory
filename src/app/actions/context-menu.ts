import { inputMenu } from '../context-menu/input';
import type { AppModel } from '../model.svelte';
import { contactMenu } from '../context-menu/contact';
import { detailMenu } from '../context-menu/detail';
import { snapshotMenu } from '../context-menu/snapshot';
import { changeMenu } from '../context-menu/change';
import { labelMenu } from '../context-menu/label';
import { fallbackMenu } from '../context-menu/fallback';
/** Most-specific context wins. Each builder owns its own labels and actions. */
export function handleGlobalContextMenu(this: AppModel, event: MouseEvent): void {
  event.preventDefault();
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const selectedText = window.getSelection()?.toString().trim() ?? '';
  for (const buildMenu of [
    inputMenu,
    contactMenu,
    detailMenu,
    snapshotMenu,
    changeMenu,
    labelMenu,
    fallbackMenu,
  ]) {
    if (buildMenu.call(this, event, target, selectedText)) return;
  }
}
