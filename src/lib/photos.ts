import type { Contact, MediaView } from './ipc';

export interface ContactPhotoItem {
  url: string;
  displayUrl: string;
  type: 'contact' | 'profile' | 'other';
  label: string;
  sourceEmail?: string;
  isPrimary?: boolean;
}

export function getProfilePhotoSourceEmail(
  payload: Record<string, unknown>,
  photoObj?: any
): string {
  if (!payload) return '';
  const emailAddresses = (payload.emailAddresses as Array<any>) || [];
  const photoSourceId = photoObj?.metadata?.source?.id || photoObj?.source?.id;

  // 1. Match by source.id
  if (photoSourceId) {
    const match = emailAddresses.find((e) => {
      const emailSourceId = e?.metadata?.source?.id || e?.source?.id;
      return emailSourceId && emailSourceId === photoSourceId;
    });
    if (match?.value) return match.value;
  }

  // 2. Match by source.type === 'PROFILE' | 'DOMAIN_PROFILE'
  const profileEmail = emailAddresses.find((e) => {
    const sType = e?.metadata?.source?.type || e?.source?.type;
    return sType === 'PROFILE' || sType === 'DOMAIN_PROFILE';
  });
  if (profileEmail?.value) return profileEmail.value;

  // 3. Fall back to primary email or first available
  const primary = emailAddresses.find((e) => e?.metadata?.primary || e?.primary);
  if (primary?.value) return primary.value;
  if (emailAddresses[0]?.value) return emailAddresses[0].value;

  const emails = (payload.emails as Array<any>) || [];
  for (const e of emails) {
    if (typeof e === 'string' && e.trim()) return e.trim();
    if (e?.value) return e.value;
    if (e?.address) return e.address;
  }

  return '';
}

export function getContactPhotos(
  c: Contact,
  mediaList: MediaView[] = [],
  avatarMap: Record<string, string> = {}
): ContactPhotoItem[] {
  if (!c || !c.payload) return [];
  const payload = c.payload;
  const rawPhotos = (payload.photos as Array<any>) || [];
  const seenUrls = new Set<string>();
  const items: ContactPhotoItem[] = [];

  function resolveUrl(url: string): string {
    const match = mediaList.find((m) => m.source_url === url && m.data_url);
    if (match?.data_url) return match.data_url;
    if (avatarMap[url]) return avatarMap[url];
    return url;
  }

  // 1. Process explicit photos from payload
  for (const p of rawPhotos) {
    if (!p || !p.url || p.default) continue;
    if (seenUrls.has(p.url)) continue;
    seenUrls.add(p.url);

    const sourceType = p.metadata?.source?.type || p.source?.type;
    const isContact = sourceType === 'CONTACT' || p.url.includes('/contacts/');
    const isProfile =
      sourceType === 'PROFILE' ||
      sourceType === 'DOMAIN_PROFILE' ||
      p.url.includes('/a/') ||
      p.url.includes('/a-/');

    let type: 'contact' | 'profile' | 'other' = 'other';
    let label = 'Photo';
    let sourceEmail: string | undefined = undefined;

    if (isContact) {
      type = 'contact';
      label = 'Contact photo';
    } else if (isProfile) {
      type = 'profile';
      label = 'Google profile photo';
      sourceEmail = getProfilePhotoSourceEmail(payload, p);
    } else {
      type = 'other';
      label = 'Photo';
    }

    items.push({
      url: p.url,
      displayUrl: resolveUrl(p.url),
      type,
      label,
      sourceEmail,
      isPrimary: Boolean(p.metadata?.primary || p.primary),
    });
  }

  // 2. Check mediaList for any additional archived items
  for (const m of mediaList) {
    if (
      !m.source_url ||
      seenUrls.has(m.source_url) ||
      m.status === 'failed' ||
      m.status === 'generated'
    )
      continue;
    seenUrls.add(m.source_url);
    const isContact = m.source_url.includes('/contacts/');
    const isProfile = m.source_url.includes('/a/') || m.source_url.includes('/a-/');
    items.push({
      url: m.source_url,
      displayUrl: m.data_url || m.source_url,
      type: isContact ? 'contact' : isProfile ? 'profile' : 'other',
      label: isContact ? 'Contact photo' : isProfile ? 'Google profile photo' : 'Photo',
      sourceEmail: isProfile ? getProfilePhotoSourceEmail(payload) : undefined,
    });
  }

  // 3. Fallback from avatarMap if no photos found yet
  if (items.length === 0 && avatarMap[c.resource_name]) {
    items.push({
      url: avatarMap[c.resource_name],
      displayUrl: avatarMap[c.resource_name],
      type: 'contact',
      label: 'Contact photo',
    });
  }

  // Sort: 'contact' first, then 'profile', then 'other'
  items.sort((a, b) => {
    const order = { contact: 0, profile: 1, other: 2 };
    return order[a.type] - order[b.type];
  });

  if (items.length === 1 && items[0].type === 'other') {
    items[0].label = 'Contact photo';
  }

  return items;
}
