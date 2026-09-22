import type { AppModel } from '../model.svelte';
export function showToast(
  this: Pick<AppModel, 'toastMessage' | 'toastTimeout'>,
  message: string,
  duration = 4000,
): void {
  if (this.toastTimeout !== undefined) clearTimeout(this.toastTimeout);
  this.toastMessage = message;
  this.toastTimeout = setTimeout(() => {
    this.toastMessage = '';
    this.toastTimeout = undefined;
  }, duration);
}
