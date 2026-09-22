import { type Contact, type MediaView } from '../../lib/ipc';
import type { AppModel } from '../model.svelte';
// Contact Parsing Helpers
export function getDisplayName(
  this: Pick<AppModel, 'getPrimaryEmail' | 'getPrimaryPhone'>,
  c: Contact,
): string {
  if (c.display_name && c.display_name.trim()) return c.display_name.trim();
  const payload = c.payload || {};
  const names = (payload.names as Array<any>) || [];
  if (names[0]?.displayName) return names[0].displayName;
  const email = this.getPrimaryEmail(payload);
  if (email) return email;
  const phone = this.getPrimaryPhone(payload);
  if (phone) return phone;
  return 'Unknown';
}

export function getAvatarColor(this: Pick<AppModel, 'GOOGLE_AVATAR_COLORS'>, name: string): string {
  if (!name) return this.GOOGLE_AVATAR_COLORS[0];
  const char = name.trim().charAt(0).toUpperCase();
  const code = char.charCodeAt(0);
  return this.GOOGLE_AVATAR_COLORS[code % this.GOOGLE_AVATAR_COLORS.length];
}

export function getAvatarInitial(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  return trimmed.charAt(0).toUpperCase();
}

export function getInitials(name: string): string {
  const parts = name
    .trim()
    .split(/[\s@._-]+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

export function getPhotoUrl(payload: Record<string, unknown>): string {
  if (!payload) return '';
  const photos = (payload.photos as Array<any>) || [];
  if (!photos.length) return '';
  // Priority 1: User explicitly set contact photo (source.type === 'CONTACT' or url has /contacts/)
  const contactPhoto = photos.find((p) => {
    if (!p || p.default || !p.url) return false;
    const sourceType = p.metadata?.source?.type || p.source?.type;
    return sourceType === 'CONTACT' || p.url.includes('/contacts/');
  });
  if (contactPhoto?.url) return contactPhoto.url;
  // Priority 2: Primary non-profile photo
  const primaryNonProfile = photos.find((p) => {
    if (!p || p.default || !p.url) return false;
    const sourceType = p.metadata?.source?.type || p.source?.type;
    return (
      (p.metadata?.primary || p.primary) &&
      sourceType !== 'PROFILE' &&
      sourceType !== 'DOMAIN_PROFILE' &&
      !p.url.includes('/a/') &&
      !p.url.includes('/a-/')
    );
  });
  if (primaryNonProfile?.url) return primaryNonProfile.url;
  // Priority 3: Any non-default photo that is not an account profile picture
  const nonProfile = photos.find((p) => {
    if (!p || p.default || !p.url) return false;
    const sourceType = p.metadata?.source?.type || p.source?.type;
    return (
      sourceType !== 'PROFILE' &&
      sourceType !== 'DOMAIN_PROFILE' &&
      !p.url.includes('/a/') &&
      !p.url.includes('/a-/')
    );
  });
  if (nonProfile?.url) return nonProfile.url;
  // Priority 4: Fall back to Google profile photo
  const anyNonDefault = photos.find((p) => p && !p.default && p.url);
  if (anyNonDefault?.url) return anyNonDefault.url;
  return photos[0]?.url || '';
}

export function getAvatarSource(
  this: Pick<AppModel, 'avatarMap' | 'detail' | 'getPhotoUrl' | 'selectedPhotoUrl'>,
  c: Contact,
  mediaList: MediaView[] = [],
): string {
  if (this.selectedPhotoUrl && this.detail?.resource_name === c.resource_name) {
    const match = mediaList.find((m) => m.source_url === this.selectedPhotoUrl && m.data_url);
    if (match?.data_url) return match.data_url;
    if (this.avatarMap[this.selectedPhotoUrl]) return this.avatarMap[this.selectedPhotoUrl];
    return this.selectedPhotoUrl;
  }
  const preferredUrl = this.getPhotoUrl(c.payload);
  if (preferredUrl) {
    if (this.avatarMap[preferredUrl]) return this.avatarMap[preferredUrl];
    const match = mediaList.find((m) => m.source_url === preferredUrl && m.data_url);
    if (match?.data_url) return match.data_url;
    return preferredUrl;
  }
  const localAvatar = this.avatarMap[c.resource_name];
  if (localAvatar) return localAvatar;
  const firstMedia = mediaList.find((m) => m.data_url);
  if (firstMedia?.data_url) return firstMedia.data_url;
  return '';
}
