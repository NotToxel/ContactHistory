import type { AppModel } from '../model.svelte';
export function toggleHistoryVersionExpanded(
  this: Pick<AppModel, 'expandedHistoryVersions'>,
  version: number,
): void {
  const next = new Set(this.expandedHistoryVersions);
  if (next.has(version)) {
    next.delete(version);
  } else {
    next.add(version);
  }
  this.expandedHistoryVersions = next;
}

export function updateStickyState(
  this: Pick<
    AppModel,
    'detailViewEl' | 'heroAvatarEl' | 'isScrolled' | 'showStickyName' | 'topNavEl'
  >,
): void {
  if (!this.detailViewEl || !this.topNavEl) {
    this.isScrolled = false;
    this.showStickyName = false;
    return;
  }
  this.isScrolled = this.detailViewEl.scrollTop > 16;
  if (!this.heroAvatarEl) {
    this.showStickyName = this.isScrolled;
    return;
  }
  const avatarRect = this.heroAvatarEl.getBoundingClientRect();
  const navRect = this.topNavEl.getBoundingClientRect();
  // Profile picture is no longer visible once its bottom edge has scrolled
  // above or level with the bottom edge of the sticky top nav bar.
  this.showStickyName = avatarRect.bottom <= navRect.bottom;
}
