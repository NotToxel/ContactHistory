import { type Contact } from '../../lib/ipc';
import type { AppModel } from '../model.svelte';
export function onSearchInput(
  this: Pick<AppModel, 'search' | 'searchActiveIndex' | 'searchDropdownOpen'>,
): void {
  this.searchDropdownOpen = this.search.trim().length > 0;
  this.searchActiveIndex = 0;
}

export function onSearchFocus(
  this: Pick<AppModel, 'search' | 'searchActiveIndex' | 'searchDropdownOpen'>,
): void {
  if (this.search.trim().length > 0) {
    this.searchDropdownOpen = true;
    this.searchActiveIndex = 0;
  }
}

export function clearSearch(
  this: Pick<AppModel, 'search' | 'searchActiveIndex' | 'searchDropdownOpen' | 'searchInputEl'>,
): void {
  this.search = '';
  this.searchDropdownOpen = false;
  this.searchActiveIndex = 0;
  this.searchInputEl?.focus();
}

export function selectSearchResult(
  this: Pick<AppModel, 'navigate' | 'pageView' | 'searchDropdownOpen' | 'selectContact'>,
  contact: Contact,
): void {
  this.searchDropdownOpen = false;
  this.selectContact(contact);
  if (this.pageView !== 'contacts') {
    this.navigate('contacts');
  }
}

export function scrollActiveSearchResultIntoView(this: Pick<AppModel, 'searchDropdownEl'>): void {
  if (!this.searchDropdownEl) return;
  const activeEl = this.searchDropdownEl.querySelector(
    '.search-result-item.active',
  ) as HTMLElement | null;
  if (activeEl) {
    activeEl.scrollIntoView({ block: 'nearest' });
  }
}

export function onSearchKeyDown(
  this: Pick<
    AppModel,
    | 'clearSearch'
    | 'scrollActiveSearchResultIntoView'
    | 'search'
    | 'searchActiveIndex'
    | 'searchDropdownOpen'
    | 'searchResults'
    | 'selectSearchResult'
  >,
  event: KeyboardEvent,
): void {
  if (
    !this.searchDropdownOpen &&
    this.search.trim().length > 0 &&
    (event.key === 'ArrowDown' || event.key === 'ArrowUp')
  ) {
    this.searchDropdownOpen = true;
    this.searchActiveIndex = 0;
    event.preventDefault();
    return;
  }
  if (!this.searchDropdownOpen || this.searchResults.length === 0) {
    if (event.key === 'Escape') {
      this.clearSearch();
    }
    return;
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    this.searchActiveIndex = (this.searchActiveIndex + 1) % this.searchResults.length;
    setTimeout(this.scrollActiveSearchResultIntoView, 0);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    this.searchActiveIndex =
      (this.searchActiveIndex - 1 + this.searchResults.length) % this.searchResults.length;
    setTimeout(this.scrollActiveSearchResultIntoView, 0);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    if (this.searchActiveIndex >= 0 && this.searchActiveIndex < this.searchResults.length) {
      this.selectSearchResult(this.searchResults[this.searchActiveIndex]);
    }
  } else if (event.key === 'Escape') {
    event.preventDefault();
    this.searchDropdownOpen = false;
  }
}

export function handleWindowClick(
  this: Pick<
    AppModel,
    | 'searchDropdownOpen'
    | 'showAccountMenu'
    | 'showDetailMenu'
    | 'showDownloadMenu'
    | 'showPhotoQualityMenu'
    | 'showSelectionMenu'
  >,
  e: MouseEvent,
): void {
  const target = e.target as HTMLElement | null;
  if (!target) return;
  if (!target.closest('.topbar-search-container')) {
    this.searchDropdownOpen = false;
  }
  if (!target.closest('.account-avatar-btn') && !target.closest('.account-menu')) {
    this.showAccountMenu = false;
  }
  if (!target.closest('.detail-menu-container')) {
    this.showDetailMenu = false;
    this.showPhotoQualityMenu = false;
  }
  if (!target.closest('.selection-box-wrapper')) {
    this.showSelectionMenu = false;
  }
  if (!target.closest('.selection-download-wrapper')) {
    this.showDownloadMenu = false;
  }
}
