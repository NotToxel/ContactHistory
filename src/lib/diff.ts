import { formatPhone } from './phone';
import { formatBirthdayDate, type BirthdayFormat } from './preferences';

export type DiffType = 'added' | 'removed' | 'modified';

export interface DiffItem {
  type: DiffType;
  label?: string; // e.g. 'Mobile', 'Work', 'Home'
  before?: string;
  after?: string;
  text?: string;
}

export interface FieldDiffGroup {
  key: string;
  title: string;
  icon: string;
  items: DiffItem[];
}

export interface SummaryBadge {
  label: string;
  type: DiffType;
  icon: string;
}

export interface ContactDiffResult {
  displayName: string;
  kind: 'added' | 'removed' | 'changed';
  badges: SummaryBadge[];
  groups: FieldDiffGroup[];
  hasChanges: boolean;
  cleanBefore: Record<string, unknown> | null;
  cleanAfter: Record<string, unknown> | null;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function cleanPayload(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(cleanPayload);
  }
  if (obj && typeof obj === 'object') {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (['metadata', 'etag', 'resourceName'].includes(key)) continue;
      cleaned[key] = cleanPayload(value);
    }
    return cleaned;
  }
  return obj;
}

export function extractDisplayName(payload: Record<string, unknown> | null | undefined): string {
  if (!payload) return 'Unknown';
  const names = (payload.names as Array<any>) || [];
  if (names[0]?.displayName?.trim()) return names[0].displayName.trim();
  const given = names[0]?.givenName?.trim() || '';
  const family = names[0]?.familyName?.trim() || '';
  if (given || family) return [given, family].filter(Boolean).join(' ');
  const emails = (payload.emailAddresses as Array<any>) || (payload.emails as Array<any>) || [];
  if (emails[0]?.value?.trim()) return emails[0].value.trim();
  const phones = (payload.phoneNumbers as Array<any>) || [];
  if (phones[0]?.value?.trim()) return phones[0].value.trim();
  return 'Unknown';
}

function formatBirthday(bday: any, format: BirthdayFormat = 'day-month-year'): string {
  if (!bday) return '';
  return formatBirthdayDate(bday.date, bday.text, format);
}

function formatAddress(addr: any): string {
  if (!addr) return '';
  if (addr.formattedValue?.trim()) {
    return addr.formattedValue.trim().replace(/\r?\n/g, ', ');
  }
  const parts: string[] = [
    addr.streetAddress,
    addr.extendedAddress,
    addr.city,
    addr.region,
    addr.postalCode,
    addr.country || addr.countryCode,
  ].filter(Boolean);
  return parts.join(', ');
}

export function computeContactDiff(
  beforeRaw: Record<string, unknown> | null,
  afterRaw: Record<string, unknown> | null,
  labels: Map<string, string> = new Map(),
  birthdayFormat: BirthdayFormat = 'day-month-year'
): ContactDiffResult {
  const cleanBefore = beforeRaw ? cleanPayload(beforeRaw) : null;
  const cleanAfter = afterRaw ? cleanPayload(afterRaw) : null;

  const displayName = extractDisplayName(afterRaw) !== 'Unknown'
    ? extractDisplayName(afterRaw)
    : extractDisplayName(beforeRaw);

  if (!beforeRaw && afterRaw) {
    // Contact Added
    const groups = extractAllFieldsAsGroups(cleanAfter, labels, 'added', birthdayFormat);
    const badges: SummaryBadge[] = [{ label: 'New Contact', type: 'added', icon: 'person_add' }];
    return {
      displayName,
      kind: 'added',
      badges,
      groups,
      hasChanges: true,
      cleanBefore: null,
      cleanAfter,
    };
  }

  if (beforeRaw && !afterRaw) {
    // Contact Removed
    const groups = extractAllFieldsAsGroups(cleanBefore, labels, 'removed', birthdayFormat);
    const badges: SummaryBadge[] = [{ label: 'Deleted Contact', type: 'removed', icon: 'person_remove' }];
    return {
      displayName,
      kind: 'removed',
      badges,
      groups,
      hasChanges: true,
      cleanBefore,
      cleanAfter: null,
    };
  }

  // Contact Changed - Calculate exact field diffs
  const groups: FieldDiffGroup[] = [];
  const badges: SummaryBadge[] = [];

  const b = cleanBefore || {};
  const a = cleanAfter || {};

  // 1. Names
  const beforeNames = (b.names as Array<any>) || [];
  const afterNames = (a.names as Array<any>) || [];
  const beforeNameStr = beforeNames[0]?.displayName || [beforeNames[0]?.givenName, beforeNames[0]?.familyName].filter(Boolean).join(' ');
  const afterNameStr = afterNames[0]?.displayName || [afterNames[0]?.givenName, afterNames[0]?.familyName].filter(Boolean).join(' ');
  if (beforeNameStr !== afterNameStr && (beforeNameStr || afterNameStr)) {
    groups.push({
      key: 'names',
      title: 'Name',
      icon: 'badge',
      items: [{
        type: 'modified',
        before: beforeNameStr || '(not set)',
        after: afterNameStr || '(removed)',
        text: `Name changed to "${afterNameStr}"`,
      }],
    });
    badges.push({ label: 'Name changed', type: 'modified', icon: 'badge' });
  }

  // 2. Phone Numbers
  const beforePhones = (b.phoneNumbers as Array<any>) || [];
  const afterPhones = (a.phoneNumbers as Array<any>) || [];
  const phoneItems: DiffItem[] = [];

  const beforePhoneMap = new Map<string, any>();
  for (const p of beforePhones) {
    const key = (p.canonicalForm || p.value || '').replace(/\D/g, '') || p.value;
    if (key) beforePhoneMap.set(key, p);
  }
  const afterPhoneMap = new Map<string, any>();
  for (const p of afterPhones) {
    const key = (p.canonicalForm || p.value || '').replace(/\D/g, '') || p.value;
    if (key) afterPhoneMap.set(key, p);
  }

  for (const [key, p] of afterPhoneMap) {
    const formatted = formatPhone(p.value || '', p.canonicalForm).value;
    const typeLabel = p.formattedType || p.type || 'Phone';
    if (!beforePhoneMap.has(key)) {
      phoneItems.push({
        type: 'added',
        label: typeLabel,
        text: formatted,
      });
    } else {
      const oldP = beforePhoneMap.get(key);
      const oldType = oldP.formattedType || oldP.type || 'Phone';
      if (oldType !== typeLabel) {
        phoneItems.push({
          type: 'modified',
          label: `${typeLabel} (was ${oldType})`,
          text: formatted,
        });
      }
    }
  }
  for (const [key, p] of beforePhoneMap) {
    if (!afterPhoneMap.has(key)) {
      const formatted = formatPhone(p.value || '', p.canonicalForm).value;
      phoneItems.push({
        type: 'removed',
        label: p.formattedType || p.type || 'Phone',
        text: formatted,
      });
    }
  }
  if (phoneItems.length > 0) {
    groups.push({
      key: 'phones',
      title: 'Phone Numbers',
      icon: 'call',
      items: phoneItems,
    });
    const added = phoneItems.filter((i) => i.type === 'added').length;
    const removed = phoneItems.filter((i) => i.type === 'removed').length;
    const modified = phoneItems.filter((i) => i.type === 'modified').length;
    if (added && !removed && !modified) badges.push({ label: `+${added} Phone`, type: 'added', icon: 'call' });
    else if (removed && !added && !modified) badges.push({ label: `-${removed} Phone`, type: 'removed', icon: 'call' });
    else badges.push({ label: 'Phones updated', type: 'modified', icon: 'call' });
  }

  // 3. Email Addresses
  const beforeEmails = (b.emailAddresses as Array<any>) || [];
  const afterEmails = (a.emailAddresses as Array<any>) || [];
  const emailItems: DiffItem[] = [];

  const beforeEmailMap = new Map<string, any>();
  for (const e of beforeEmails) {
    if (e.value) beforeEmailMap.set(e.value.toLowerCase(), e);
  }
  const afterEmailMap = new Map<string, any>();
  for (const e of afterEmails) {
    if (e.value) afterEmailMap.set(e.value.toLowerCase(), e);
  }

  for (const [key, e] of afterEmailMap) {
    const typeLabel = e.formattedType || e.type || 'Email';
    if (!beforeEmailMap.has(key)) {
      emailItems.push({
        type: 'added',
        label: typeLabel,
        text: e.value,
      });
    } else {
      const oldE = beforeEmailMap.get(key);
      const oldType = oldE.formattedType || oldE.type || 'Email';
      if (oldType !== typeLabel) {
        emailItems.push({
          type: 'modified',
          label: `${typeLabel} (was ${oldType})`,
          text: e.value,
        });
      }
    }
  }
  for (const [key, e] of beforeEmailMap) {
    if (!afterEmailMap.has(key)) {
      emailItems.push({
        type: 'removed',
        label: e.formattedType || e.type || 'Email',
        text: e.value,
      });
    }
  }
  if (emailItems.length > 0) {
    groups.push({
      key: 'emails',
      title: 'Email Addresses',
      icon: 'mail',
      items: emailItems,
    });
    const added = emailItems.filter((i) => i.type === 'added').length;
    const removed = emailItems.filter((i) => i.type === 'removed').length;
    if (added && !removed) badges.push({ label: `+${added} Email`, type: 'added', icon: 'mail' });
    else if (removed && !added) badges.push({ label: `-${removed} Email`, type: 'removed', icon: 'mail' });
    else badges.push({ label: 'Emails updated', type: 'modified', icon: 'mail' });
  }

  // 4. Addresses
  const beforeAddrs = (b.addresses as Array<any>) || [];
  const afterAddrs = (a.addresses as Array<any>) || [];
  const addrItems: DiffItem[] = [];

  const beforeAddrList = beforeAddrs.map((ad) => ({ str: formatAddress(ad), raw: ad }));
  const afterAddrList = afterAddrs.map((ad) => ({ str: formatAddress(ad), raw: ad }));

  for (const item of afterAddrList) {
    const match = beforeAddrList.find((x) => x.str === item.str);
    if (!match) {
      addrItems.push({
        type: 'added',
        label: item.raw.formattedType || item.raw.type || 'Address',
        text: item.str,
      });
    }
  }
  for (const item of beforeAddrList) {
    const match = afterAddrList.find((x) => x.str === item.str);
    if (!match) {
      addrItems.push({
        type: 'removed',
        label: item.raw.formattedType || item.raw.type || 'Address',
        text: item.str,
      });
    }
  }
  if (addrItems.length > 0) {
    groups.push({
      key: 'addresses',
      title: 'Addresses',
      icon: 'home_pin',
      items: addrItems,
    });
    const added = addrItems.filter((i) => i.type === 'added').length;
    const removed = addrItems.filter((i) => i.type === 'removed').length;
    if (added && !removed) badges.push({ label: `+${added} Address`, type: 'added', icon: 'home_pin' });
    else if (removed && !added) badges.push({ label: `Address removed`, type: 'removed', icon: 'home_pin' });
    else badges.push({ label: 'Addresses updated', type: 'modified', icon: 'home_pin' });
  }

  // 5. Work & Organizations
  const beforeOrgs = (b.organizations as Array<any>) || [];
  const afterOrgs = (a.organizations as Array<any>) || [];
  const beforeOrgStr = [beforeOrgs[0]?.name, beforeOrgs[0]?.title, beforeOrgs[0]?.department].filter(Boolean).join(' · ');
  const afterOrgStr = [afterOrgs[0]?.name, afterOrgs[0]?.title, afterOrgs[0]?.department].filter(Boolean).join(' · ');
  if (beforeOrgStr !== afterOrgStr && (beforeOrgStr || afterOrgStr)) {
    groups.push({
      key: 'organizations',
      title: 'Work & Company',
      icon: 'business',
      items: [{
        type: !beforeOrgStr ? 'added' : !afterOrgStr ? 'removed' : 'modified',
        before: beforeOrgStr || '(none)',
        after: afterOrgStr || '(removed)',
        text: afterOrgStr || 'Work info removed',
      }],
    });
    badges.push({ label: 'Job / Work changed', type: 'modified', icon: 'business' });
  }

  // 6. Birthday
  const beforeBday = formatBirthday(((b.birthdays as Array<any>) || [])[0], birthdayFormat);
  const afterBday = formatBirthday(((a.birthdays as Array<any>) || [])[0], birthdayFormat);
  if (beforeBday !== afterBday && (beforeBday || afterBday)) {
    groups.push({
      key: 'birthdays',
      title: 'Birthday',
      icon: 'cake',
      items: [{
        type: !beforeBday ? 'added' : !afterBday ? 'removed' : 'modified',
        before: beforeBday || '(not set)',
        after: afterBday || '(removed)',
        text: afterBday || 'Birthday removed',
      }],
    });
    badges.push({ label: 'Birthday updated', type: 'modified', icon: 'cake' });
  }

  // 7. Labels & Memberships
  const getLabelNames = (payload: any): string[] => {
    const mems = (payload.memberships as Array<any>) || [];
    const list: string[] = [];
    for (const m of mems) {
      const res = m?.contactGroupMembership?.contactGroupResourceName;
      if (res) {
        if (res.includes('starred')) {
          list.push('Starred');
        } else if (!res.endsWith('/myContacts') && !res.endsWith('/all')) {
          const friendly = labels.get(res) || res.replace('contactGroups/', '');
          list.push(friendly);
        }
      }
    }
    return [...new Set(list)];
  };

  const beforeLabelList = getLabelNames(b);
  const afterLabelList = getLabelNames(a);
  const labelItems: DiffItem[] = [];

  for (const lbl of afterLabelList) {
    if (!beforeLabelList.includes(lbl)) {
      labelItems.push({
        type: 'added',
        label: 'Added label',
        text: lbl,
      });
    }
  }
  for (const lbl of beforeLabelList) {
    if (!afterLabelList.includes(lbl)) {
      labelItems.push({
        type: 'removed',
        label: 'Removed label',
        text: lbl,
      });
    }
  }
  if (labelItems.length > 0) {
    groups.push({
      key: 'labels',
      title: 'Labels',
      icon: 'label',
      items: labelItems,
    });
    badges.push({ label: 'Labels modified', type: 'modified', icon: 'label' });
  }

  // 8. Notes / Biographies
  const beforeBio = ((b.biographies as Array<any>) || [])[0]?.value || '';
  const afterBio = ((a.biographies as Array<any>) || [])[0]?.value || '';
  if (beforeBio !== afterBio && (beforeBio || afterBio)) {
    groups.push({
      key: 'biographies',
      title: 'Notes',
      icon: 'description',
      items: [{
        type: !beforeBio ? 'added' : !afterBio ? 'removed' : 'modified',
        before: beforeBio || '(empty)',
        after: afterBio || '(cleared)',
        text: afterBio || 'Note cleared',
      }],
    });
    badges.push({ label: 'Notes updated', type: 'modified', icon: 'description' });
  }

  // 9. Photos
  const beforePhotos = (b.photos as Array<any>) || [];
  const afterPhotos = (a.photos as Array<any>) || [];
  const beforePhotoUrl = beforePhotos[0]?.url || '';
  const afterPhotoUrl = afterPhotos[0]?.url || '';
  if (beforePhotoUrl !== afterPhotoUrl && (beforePhotoUrl || afterPhotoUrl)) {
    groups.push({
      key: 'photos',
      title: 'Photo',
      icon: 'image',
      items: [{
        type: !beforePhotoUrl ? 'added' : !afterPhotoUrl ? 'removed' : 'modified',
        text: !afterPhotoUrl ? 'Profile picture removed' : 'Profile picture updated',
      }],
    });
    badges.push({ label: 'Photo updated', type: 'modified', icon: 'image' });
  }

  // 10. Nicknames
  const beforeNick = ((b.nicknames as Array<any>) || [])[0]?.value || '';
  const afterNick = ((a.nicknames as Array<any>) || [])[0]?.value || '';
  if (beforeNick !== afterNick && (beforeNick || afterNick)) {
    groups.push({
      key: 'nicknames',
      title: 'Nickname',
      icon: 'alternate_email',
      items: [{
        type: !beforeNick ? 'added' : !afterNick ? 'removed' : 'modified',
        before: beforeNick,
        after: afterNick,
        text: afterNick || 'Nickname removed',
      }],
    });
  }

  // 11. Websites / URLs
  const beforeUrls = (b.urls as Array<any>) || [];
  const afterUrls = (a.urls as Array<any>) || [];
  const urlItems: DiffItem[] = [];
  for (const u of afterUrls) {
    if (!beforeUrls.some((bu) => bu.value === u.value)) {
      urlItems.push({ type: 'added', label: u.type || 'Website', text: u.value });
    }
  }
  for (const u of beforeUrls) {
    if (!afterUrls.some((au) => au.value === u.value)) {
      urlItems.push({ type: 'removed', label: u.type || 'Website', text: u.value });
    }
  }
  if (urlItems.length > 0) {
    groups.push({
      key: 'urls',
      title: 'Websites',
      icon: 'language',
      items: urlItems,
    });
  }

  // 12. User Defined / Custom Fields
  const beforeCustom = (b.userDefined as Array<any>) || [];
  const afterCustom = (a.userDefined as Array<any>) || [];
  const customItems: DiffItem[] = [];
  const unmatchedBefore = [...beforeCustom];
  const unmatchedAfter: any[] = [];
  // Treat repeated keys as separate entries. Consume exact key/value matches first,
  // so a change in array order cannot appear as a changed field.
  for (const c of afterCustom) {
    const index = unmatchedBefore.findIndex((bc) => bc.key === c.key && bc.value === c.value);
    if (index >= 0) unmatchedBefore.splice(index, 1);
    else unmatchedAfter.push(c);
  }
  for (const c of unmatchedAfter) {
    const index = unmatchedBefore.findIndex((bc) => bc.key === c.key);
    if (index >= 0) {
      const old = unmatchedBefore.splice(index, 1)[0];
      customItems.push({ type: 'modified', label: c.key, before: old.value, after: c.value, text: c.value });
    } else {
      customItems.push({ type: 'added', label: c.key, text: c.value });
    }
  }
  for (const c of unmatchedBefore) {
    customItems.push({ type: 'removed', label: c.key, text: c.value });
  }
  if (customItems.length > 0) {
    groups.push({
      key: 'userDefined',
      title: 'Custom Fields',
      icon: 'tune',
      items: customItems,
    });
    badges.push({ label: 'Custom fields modified', type: 'modified', icon: 'tune' });
  }

  // 13. Catch-all for other fields not explicitly covered
  const handledKeys = new Set([
    'names', 'phoneNumbers', 'emailAddresses', 'addresses', 'organizations',
    'birthdays', 'memberships', 'biographies', 'photos', 'nicknames', 'urls', 'userDefined',
    'metadata', 'etag', 'resourceName',
  ]);
  const allKeys = new Set([...Object.keys(b), ...Object.keys(a)]);
  for (const key of allKeys) {
    if (handledKeys.has(key)) continue;
    const valB = JSON.stringify(b[key]);
    const valA = JSON.stringify(a[key]);
    if (valB !== valA) {
      groups.push({
        key,
        title: key.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase()),
        icon: 'extension',
        items: [{
          type: !b[key] ? 'added' : !a[key] ? 'removed' : 'modified',
          before: b[key] ? (typeof b[key] === 'object' ? JSON.stringify(b[key]) : String(b[key])) : undefined,
          after: a[key] ? (typeof a[key] === 'object' ? JSON.stringify(a[key]) : String(a[key])) : undefined,
          text: a[key] ? (typeof a[key] === 'object' ? JSON.stringify(a[key]) : String(a[key])) : '(removed)',
        }],
      });
    }
  }

  // Fallback badge if no specific badge was created but groups exist
  if (badges.length === 0 && groups.length > 0) {
    badges.push({ label: 'Details updated', type: 'modified', icon: 'edit' });
  }

  return {
    displayName,
    kind: 'changed',
    badges,
    groups,
    hasChanges: groups.length > 0,
    cleanBefore,
    cleanAfter,
  };
}

function extractAllFieldsAsGroups(
  payload: Record<string, unknown> | null,
  labels: Map<string, string>,
  type: 'added' | 'removed',
  birthdayFormat: BirthdayFormat = 'day-month-year'
): FieldDiffGroup[] {
  if (!payload) return [];
  const groups: FieldDiffGroup[] = [];

  // Names
  const names = (payload.names as Array<any>) || [];
  const nameStr = names[0]?.displayName || [names[0]?.givenName, names[0]?.familyName].filter(Boolean).join(' ');
  if (nameStr) {
    groups.push({
      key: 'names',
      title: 'Name',
      icon: 'badge',
      items: [{ type, text: nameStr }],
    });
  }

  // Phones
  const phones = (payload.phoneNumbers as Array<any>) || [];
  if (phones.length) {
    groups.push({
      key: 'phones',
      title: 'Phone Numbers',
      icon: 'call',
      items: phones.map((p) => ({
        type,
        label: p.formattedType || p.type || 'Phone',
        text: formatPhone(p.value || '', p.canonicalForm).value,
      })),
    });
  }

  // Emails
  const emails = (payload.emailAddresses as Array<any>) || [];
  if (emails.length) {
    groups.push({
      key: 'emails',
      title: 'Email Addresses',
      icon: 'mail',
      items: emails.map((e) => ({
        type,
        label: e.formattedType || e.type || 'Email',
        text: e.value,
      })),
    });
  }

  // Addresses
  const addrs = (payload.addresses as Array<any>) || [];
  if (addrs.length) {
    groups.push({
      key: 'addresses',
      title: 'Addresses',
      icon: 'home_pin',
      items: addrs.map((a) => ({
        type,
        label: a.formattedType || a.type || 'Address',
        text: formatAddress(a),
      })),
    });
  }

  // Work
  const orgs = (payload.organizations as Array<any>) || [];
  const orgStr = [orgs[0]?.name, orgs[0]?.title, orgs[0]?.department].filter(Boolean).join(' · ');
  if (orgStr) {
    groups.push({
      key: 'organizations',
      title: 'Work & Company',
      icon: 'business',
      items: [{ type, text: orgStr }],
    });
  }

  // Birthday
  const bdays = (payload.birthdays as Array<any>) || [];
  const bdayStr = formatBirthday(bdays[0], birthdayFormat);
  if (bdayStr) {
    groups.push({
      key: 'birthdays',
      title: 'Birthday',
      icon: 'cake',
      items: [{ type, text: bdayStr }],
    });
  }

  // Labels
  const mems = (payload.memberships as Array<any>) || [];
  const labelNames: string[] = [];
  for (const m of mems) {
    const res = m?.contactGroupMembership?.contactGroupResourceName;
    if (res && !res.endsWith('/myContacts') && !res.endsWith('/all')) {
      labelNames.push(labels.get(res) || res.replace('contactGroups/', ''));
    }
  }
  if (labelNames.length) {
    groups.push({
      key: 'labels',
      title: 'Labels',
      icon: 'label',
      items: labelNames.map((l) => ({ type, text: l })),
    });
  }

  // Notes
  const bios = (payload.biographies as Array<any>) || [];
  if (bios[0]?.value) {
    groups.push({
      key: 'biographies',
      title: 'Notes',
      icon: 'description',
      items: [{ type, text: bios[0].value }],
    });
  }

  // Custom fields
  const customs = (payload.userDefined as Array<any>) || [];
  if (customs.length) {
    groups.push({
      key: 'userDefined',
      title: 'Custom Fields',
      icon: 'tune',
      items: customs.map((c) => ({ type, label: c.key, text: c.value })),
    });
  }

  return groups;
}
