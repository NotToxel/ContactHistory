import type { AppModel } from '../model.svelte';
export function handleGlobalKeyDown(
  this: Pick<
    AppModel,
    | 'clearContactSelection'
    | 'clearSearch'
    | 'goBack'
    | 'goForward'
    | 'hasData'
    | 'pageView'
    | 'search'
    | 'searchDropdownOpen'
    | 'searchInputEl'
    | 'selectedContactKeys'
    | 'refreshContactSelectionPreview'
    | 'showDownloadMenu'
    | 'showSelectionMenu'
    | 'showSnapshotDropdown'
  >,
  event: KeyboardEvent,
): void {
  if (event.key === 'Shift') this.refreshContactSelectionPreview(true);
  if (
    event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
  ) {
    event.preventDefault();
    if (event.key === 'ArrowLeft') this.goBack();
    else this.goForward();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    if (!this.hasData || this.pageView === 'onboarding') return;
    event.preventDefault();
    this.searchInputEl?.focus();
    this.searchInputEl?.select();
    if (this.search.trim().length > 0) {
      this.searchDropdownOpen = true;
    }
    return;
  }
  if (
    event.key === '/' &&
    !['INPUT', 'TEXTAREA'].includes((document.activeElement as HTMLElement)?.tagName)
  ) {
    if (!this.hasData || this.pageView === 'onboarding') return;
    event.preventDefault();
    this.searchInputEl?.focus();
    this.searchInputEl?.select();
    if (this.search.trim().length > 0) {
      this.searchDropdownOpen = true;
    }
    return;
  }
  if (event.key === 'Escape') {
    this.showSnapshotDropdown = false;
    this.showSelectionMenu = false;
    this.showDownloadMenu = false;
    if (this.searchDropdownOpen) {
      this.searchDropdownOpen = false;
      return;
    }
    if (this.selectedContactKeys.length > 0) {
      this.clearContactSelection();
      return;
    }
    if (document.activeElement === this.searchInputEl || this.search) {
      this.clearSearch();
    }
  }
}

export function handleGlobalKeyUp(
  this: Pick<AppModel, 'refreshContactSelectionPreview'>,
  event: KeyboardEvent,
): void {
  if (event.key === 'Shift') this.refreshContactSelectionPreview(false);
}
