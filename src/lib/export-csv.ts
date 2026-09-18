import type { Contact } from './ipc';

/**
 * Escapes a cell value according to RFC 4180 CSV specifications.
 * If the value contains commas, double quotes, or newlines, it will be
 * enclosed in double quotes with internal quotes escaped as double double-quotes.
 */
export function escapeCsvField(value: unknown): string {
  if (value == null) return '';
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Formats a Google People API birthday object to standard Google CSV format
 * (e.g. YYYY-MM-DD or --MM-DD).
 */
export function formatGoogleCsvBirthday(birthdayObj: any): string {
  if (!birthdayObj) return '';
  const date = birthdayObj.date || birthdayObj;
  const year = typeof date.year === 'number' ? date.year : null;
  const month = typeof date.month === 'number' ? date.month : null;
  const day = typeof date.day === 'number' ? date.day : null;

  if (year !== null && month !== null && day !== null) {
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  if (month !== null && day !== null) {
    return `--${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  if (typeof birthdayObj.text === 'string' && birthdayObj.text.trim()) {
    return birthdayObj.text.trim();
  }
  return '';
}

/**
 * Resolves labels from contact memberships using an optional group map.
 * Multiple labels are joined by ' ::: ' as defined by Google Contacts CSV import format.
 */
export function resolveGoogleCsvLabels(
  payload: Record<string, unknown>,
  groupMap?: Map<string, string> | Record<string, string>
): string {
  const mems = (payload.memberships as Array<any>) || [];
  const labels: string[] = [];
  const seen = new Set<string>();

  for (const m of mems) {
    const res = m?.contactGroupMembership?.contactGroupResourceName;
    if (typeof res === 'string' && res.trim()) {
      let name = '';
      if (groupMap instanceof Map) {
        name = groupMap.get(res) || '';
      } else if (groupMap && typeof groupMap === 'object') {
        name = groupMap[res] || '';
      }
      const label = name || res;
      if (!seen.has(label)) {
        seen.add(label);
        labels.push(label);
      }
    }
  }

  return labels.join(' ::: ');
}

/**
 * Generates a standard Google Contact CSV string for a single contact.
 */
export function generateContactCsv(
  contact: Contact,
  groupMap?: Map<string, string> | Record<string, string>
): string {
  const payload = (contact.payload || {}) as Record<string, unknown>;
  const names = (payload.names as Array<any>) || [];
  const primaryName = names[0] || {};
  const nicknames = (payload.nicknames as Array<any>) || [];
  const birthdays = (payload.birthdays as Array<any>) || [];
  const biographies = (payload.biographies as Array<any>) || [];
  const orgs = (payload.organizations as Array<any>) || [];
  const primaryOrg = orgs[0] || {};

  // Extract Emails
  let emails = (payload.emailAddresses as Array<any>) || [];
  if (emails.length === 0 && Array.isArray(payload.emails)) {
    emails = payload.emails.map((e: any) =>
      typeof e === 'string' ? { value: e, type: 'Home' } : e
    );
  }

  // Extract Phones
  let phones = (payload.phoneNumbers as Array<any>) || [];
  if (phones.length === 0 && Array.isArray(payload.phones)) {
    phones = payload.phones.map((p: any) =>
      typeof p === 'string' ? { value: p, type: 'Mobile' } : p
    );
  }

  // Extract Addresses
  const addresses = (payload.addresses as Array<any>) || [];

  // Determine repeated column counts (at least 1 of each for valid Google CSV template)
  const maxEmail = Math.max(1, emails.length);
  const maxPhone = Math.max(1, phones.length);
  const maxAddress = Math.max(1, addresses.length);

  // Build Header Row
  const header: string[] = [
    'First Name',
    'Middle Name',
    'Last Name',
    'Name Prefix',
    'Name Suffix',
    'Nickname',
    'Birthday',
    'Notes',
    'Organisation name',
    'Organisation title',
    'Labels',
  ];

  for (let i = 1; i <= maxEmail; i++) {
    header.push(`Email ${i} - Label`, `Email ${i} - Value`);
  }
  for (let i = 1; i <= maxPhone; i++) {
    header.push(`Phone ${i} - Label`, `Phone ${i} - Value`);
  }
  for (let i = 1; i <= maxAddress; i++) {
    for (const part of [
      'Label',
      'Street',
      'Extended address',
      'City',
      'Region',
      'Postcode',
      'Country',
      'PO box',
    ]) {
      header.push(`Address ${i} - ${part}`);
    }
  }

  // Build Record Row
  let givenName = primaryName.givenName || '';
  const middleName = primaryName.middleName || '';
  const familyName = primaryName.familyName || '';
  const prefix = primaryName.honorificPrefix || '';
  const suffix = primaryName.honorificSuffix || '';

  // Fallback to display name if givenName and familyName are both empty
  if (!givenName && !familyName && contact.display_name) {
    givenName = contact.display_name;
  } else if (!givenName && !familyName && primaryName.displayName) {
    givenName = primaryName.displayName;
  }

  const nickname = nicknames[0]?.value || '';
  const birthday = formatGoogleCsvBirthday(birthdays[0]);
  const notes = biographies
    .map((b: any) => b?.value || '')
    .filter(Boolean)
    .join('\n');
  const orgName = primaryOrg.name || '';
  const orgTitle = primaryOrg.title || '';
  const labels = resolveGoogleCsvLabels(payload, groupMap);

  const record: string[] = [
    givenName,
    middleName,
    familyName,
    prefix,
    suffix,
    nickname,
    birthday,
    notes,
    orgName,
    orgTitle,
    labels,
  ];

  // Emails
  for (let i = 0; i < maxEmail; i++) {
    const em = emails[i];
    const emLabel = em ? (em.formattedType || em.type || 'Home') : '';
    const emVal = em ? (em.value || '') : '';
    record.push(emLabel, emVal);
  }

  // Phones
  for (let i = 0; i < maxPhone; i++) {
    const ph = phones[i];
    const phLabel = ph ? (ph.formattedType || ph.type || 'Mobile') : '';
    const phVal = ph ? (ph.value || '') : '';
    record.push(phLabel, phVal);
  }

  // Addresses
  for (let i = 0; i < maxAddress; i++) {
    const ad = addresses[i];
    const adLabel = ad ? (ad.formattedType || ad.type || 'Home') : '';
    const street = ad ? (ad.streetAddress || '') : '';
    const ext = ad ? (ad.extendedAddress || '') : '';
    const city = ad ? (ad.city || '') : '';
    const region = ad ? (ad.region || '') : '';
    const postcode = ad ? (ad.postalCode || '') : '';
    const country = ad ? (ad.country || '') : '';
    const poBox = ad ? (ad.poBox || '') : '';
    record.push(adLabel, street, ext, city, region, postcode, country, poBox);
  }

  const csvHeaderLine = header.map(escapeCsvField).join(',');
  const csvRecordLine = record.map(escapeCsvField).join(',');

  return `${csvHeaderLine}\r\n${csvRecordLine}\r\n`;
}
