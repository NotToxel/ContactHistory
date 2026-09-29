import type { AppModel } from '../model.svelte';
export function handleGlobalKeyDown(
  this: Pick<
    AppModel,
    | 'clearContactSelection'
    | 'clearSearch'
    | 'detail'
    | 'goBack'
    | 'goForward'
    | 'hasData'
    | 'openPrintDialog'
    | 'pageView'
    | 'recordNavigation'
    | 'refreshContactSelectionPreview'
    | 'search'
    | 'searchDropdownOpen'
    | 'searchInputEl'
    | 'selectAllVisible'
    | 'selectNextContact'
    | 'selectPreviousContact'
    | 'selectedContactKeys'
    | 'showDownloadMenu'
    | 'showSelectionMenu'
    | 'showSettingsModal'
    | 'showSnapshotDropdown'
  >,
  event: KeyboardEvent,
): void {
  if (event.key === 'Shift') this.refreshContactSelectionPreview(true);

  const activeEl = document.activeElement as HTMLElement | null;
  const isInputActive =
    activeEl && (['INPUT', 'TEXTAREA'].includes(activeEl.tagName) || activeEl.isContentEditable);

  // Alt + Arrow Left/Right: Browser-style History Navigation
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

  // Ctrl+F or Ctrl+K: Focus search
  if (
    (event.ctrlKey || event.metaKey) &&
    (event.key.toLowerCase() === 'k' || event.key.toLowerCase() === 'f')
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

  // Ctrl+A: Select all contacts in contacts list
  if (
    (event.ctrlKey || event.metaKey) &&
    event.key.toLowerCase() === 'a' &&
    !isInputActive &&
    this.pageView === 'contacts' &&
    !this.detail
  ) {
    event.preventDefault();
    this.selectAllVisible();
    return;
  }

  // Ctrl+P: Print dialog
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') {
    if (this.hasData && this.pageView !== 'onboarding') {
      event.preventDefault();
      this.openPrintDialog(this.detail);
      return;
    }
  }

  // Ctrl+,: Open Settings
  if ((event.ctrlKey || event.metaKey) && event.key === ',') {
    event.preventDefault();
    this.showSettingsModal = true;
    return;
  }

  // '/' to focus search when not in an input
  if (event.key === '/' && !isInputActive) {
    if (!this.hasData || this.pageView === 'onboarding') return;
    event.preventDefault();
    this.searchInputEl?.focus();
    this.searchInputEl?.select();
    if (this.search.trim().length > 0) {
      this.searchDropdownOpen = true;
    }
    return;
  }

  // Contact detail view navigation (Left/Right arrow or J/K, Esc/Backspace to exit)
  if (this.detail && !isInputActive) {
    if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'j') {
      event.preventDefault();
      this.selectPreviousContact();
      return;
    }
    if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.selectNextContact();
      return;
    }
    if (event.key === 'Backspace') {
      event.preventDefault();
      this.detail = undefined;
      this.recordNavigation();
      return;
    }
  }

  if (event.key === 'Escape') {
    this.showSnapshotDropdown = false;
    this.showSelectionMenu = false;
    this.showDownloadMenu = false;
    if (this.searchDropdownOpen) {
      this.searchDropdownOpen = false;
      return;
    }
    if (this.detail && !isInputActive) {
      this.detail = undefined;
      this.recordNavigation();
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
