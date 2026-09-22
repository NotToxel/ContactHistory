import type { Contact, GroupRow } from './ipc';

type Entry = Record<string, any>;
export type PrintRow = { label: string; values: { text: string; type: string }[] };
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const entries = (value: unknown): Entry[] => Array.isArray(value) ? value.filter(Boolean).map(v => typeof v === 'string' ? { value: v } : v) : [];

export function printName(contact: Contact): string {
  const name = text(contact.display_name) || text(entries(contact.payload.names)[0]?.displayName) || 'Unnamed contact';
  const nickname = text(entries(contact.payload.nicknames)[0]?.value);
  return nickname && nickname !== name ? `${name} (${nickname})` : name;
}

export function printDate(entry: Entry): string {
  const date = entry.date;
  if (!date?.month || !date?.day) return text(entry.text) || (date?.year ? String(date.year) : '');
  const formatted = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', ...(date.year ? { year: 'numeric' } as const : {}), timeZone: 'UTC' });
  return formatted.format(new Date(Date.UTC(date.year || 2000, date.month - 1, date.day)));
}

export function printOrganizations(contact: Contact): string[] {
  return entries(contact.payload.organizations)
    .map(e => [e.name, e.title, e.department, e.jobDescription].map(text).filter(Boolean).join(' · '))
    .filter(Boolean);
}

export function printRows(contact: Contact): PrintRow[] {
  const p = contact.payload;
  const rows: PrintRow[] = [];
  const add = (label: string, source: unknown, value: (e: Entry) => string = e => text(e.value)) => {
    const values = entries(source).map(e => ({ text: value(e), type: text(e.formattedType) || text(e.type) })).filter(e => e.text);
    if (values.length) rows.push({ label, values });
  };
  add('Email', entries(p.emailAddresses).length ? p.emailAddresses : p.emails);
  add('Phone', entries(p.phoneNumbers).length ? p.phoneNumbers : p.phones);
  add('Address', p.addresses, e => text(e.formattedValue) || [e.poBox, e.streetAddress, e.extendedAddress, e.city, e.region, e.postalCode, e.country || e.countryCode].map(text).filter(Boolean).join('\n'));
  add('Birthday', p.birthdays, printDate);
  add('Events', p.events, printDate);
  add('Relation', p.relations, e => text(e.person));
  add('Website', p.urls);
  add('Chat', p.imClients, e => [text(e.username), text(e.formattedProtocol) || text(e.protocol)].filter(Boolean).join(' · '));
  add('Custom', entries(p.userDefined).map(e => ({ value: e.value, type: e.key })));
  add('Custom', entries(p.clientData).map(e => ({ value: e.value, type: e.key })));
  add('Notes', p.biographies);
  return rows;
}

export function contactsInPrintGroup(contacts: Contact[], groups: GroupRow[], resource: string): Contact[] {
  const name = groups.find(g => g.resource_name === resource)?.name.trim().toLocaleLowerCase();
  const aliases = new Set(groups.filter(g => name && g.name.trim().toLocaleLowerCase() === name).map(g => g.resource_name));
  aliases.add(resource);
  return contacts.filter(c => entries(c.payload.memberships).some(m => aliases.has(m.contactGroupMembership?.contactGroupResourceName)));
}
