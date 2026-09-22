import type { Contact } from './ipc';

export const missingFieldOptions = [
  { key: 'photo', label: 'Profile picture' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone number' },
  { key: 'birthday', label: 'Birthday' },
  { key: 'labels', label: 'Labels' },
  { key: 'name', label: 'Name' },
  { key: 'organization', label: 'Organization' },
  { key: 'title', label: 'Job title' },
  { key: 'address', label: 'Address' },
  { key: 'notes', label: 'Notes' },
  { key: 'website', label: 'Website' },
  { key: 'nickname', label: 'Nickname' },
] as const;
export type MissingField = typeof missingFieldOptions[number]['key'];
type Row = Record<string, unknown>;
const text = (value: unknown) => typeof value === 'string' && value.trim().length > 0;
const rows = (value: unknown): Row[] => Array.isArray(value)
  ? value.filter((item): item is Row => !!item && typeof item === 'object') : [];
const has = (value: unknown, keys: string[]) => rows(value).some(row => keys.some(key => text(row[key])));
const systemGroups = new Set(['mycontacts', 'starred', 'all', 'blocked', 'chatbuddies', 'coworkers', 'family', 'friends']);

export function isMissingField(contact: Contact, field: MissingField): boolean {
  const p = contact.payload;
  switch (field) {
    case 'photo': return !rows(p.photos).some(photo => text(photo.url) && !photo.default);
    case 'email': return !has(p.emailAddresses, ['value']);
    case 'phone': return !has(p.phoneNumbers, ['value', 'canonicalForm']);
    case 'birthday': return !rows(p.birthdays).some(birthday => {
      const date = birthday.date as Row | undefined;
      return text(birthday.text) || (!!date && ['year', 'month', 'day'].some(key => typeof date[key] === 'number' && (date[key] as number) > 0));
    });
    case 'labels': return !rows(p.memberships).some(membership => {
      const group = membership.contactGroupMembership as Row | undefined;
      const resource = group?.contactGroupResourceName;
      return text(resource) && !systemGroups.has((resource as string).trim().split('/').pop()!.toLowerCase());
    });
    case 'name': return !has(p.names, ['displayName', 'givenName', 'familyName', 'middleName', 'unstructuredName']);
    case 'organization': return !has(p.organizations, ['name']);
    case 'title': return !has(p.organizations, ['title']);
    case 'address': return !has(p.addresses, ['formattedValue', 'streetAddress', 'poBox', 'extendedAddress', 'city', 'region', 'postalCode', 'country', 'countryCode']);
    case 'notes': return !has(p.biographies, ['value']);
    case 'website': return !has(p.urls, ['value']);
    case 'nickname': return !has(p.nicknames, ['value']);
  }
}

export function matchesMissingFields(contact: Contact, fields: MissingField[], mode: 'any' | 'all'): boolean {
  if (!fields.length) return true;
  return mode === 'all' ? fields.every(field => isMissingField(contact, field))
    : fields.some(field => isMissingField(contact, field));
}
