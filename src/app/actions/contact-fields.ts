import { formatBirthdayDate } from '../../lib/preferences';
import { formatPhone } from '../../lib/phone';
import { type Contact, type ContactHistoryEntry } from '../../lib/ipc';
import type { AppModel } from '../model.svelte';
import type { ContactLabelItem } from '../types';
export function getPrimaryEmail(payload: Record<string, unknown>): string {
  if (!payload) return '';
  const emailAddresses = (payload.emailAddresses as Array<any>) || [];
  for (const e of emailAddresses) {
    if (e?.value) return e.value;
  }
  const emails = (payload.emails as Array<any>) || [];
  for (const e of emails) {
    if (typeof e === 'string' && e.trim()) return e.trim();
    if (e?.value) return e.value;
    if (e?.address) return e.address;
  }
  if (typeof payload.email === 'string' && payload.email.trim()) return payload.email.trim();
  if (typeof (payload as any).emailAddress === 'string' && (payload as any).emailAddress.trim()) {
    return (payload as any).emailAddress.trim();
  }
  return '';
}

export function getAllEmails(payload: Record<string, unknown>): Array<{
  value: string;
  type: string;
}> {
  if (!payload) return [];
  const list: Array<{
    value: string;
    type: string;
  }> = [];
  const emailAddresses = (payload.emailAddresses as Array<any>) || [];
  for (const e of emailAddresses) {
    if (e?.value) {
      list.push({
        value: e.value,
        type: e.formattedType || e.type || 'Other',
      });
    }
  }
  const emails = (payload.emails as Array<any>) || [];
  for (const e of emails) {
    const val = typeof e === 'string' ? e : e?.value || e?.address;
    if (val && !list.some((item) => item.value === val)) {
      list.push({
        value: val,
        type: (typeof e === 'object' && (e?.formattedType || e?.type)) || 'Other',
      });
    }
  }
  if (
    typeof payload.email === 'string' &&
    payload.email.trim() &&
    !list.some((item) => item.value === payload.email)
  ) {
    list.push({ value: payload.email.trim(), type: 'Other' });
  }
  return list;
}

export function isFavourite(contact: Contact): boolean {
  const payload = contact.payload || {};
  const mems = (payload.memberships as Array<any>) || [];
  for (const m of mems) {
    const res = m?.contactGroupMembership?.contactGroupResourceName || '';
    const id = m?.contactGroupMembership?.contactGroupId || '';
    if (
      res === 'contactGroups/starred' ||
      res === 'systemContactGroups/starred' ||
      id === 'starred'
    ) {
      return true;
    }
  }
  if ((payload as any).starred === true) return true;
  if ((payload as any).userDefined?.some?.((u: any) => u.key === 'starred' && u.value === 'true'))
    return true;
  return false;
}

export function getContactSortKey(
  this: Pick<AppModel, 'getDisplayName'>,
  c: Contact,
  field: 'first' | 'last',
): string {
  const payload = c.payload || {};
  const names = (payload.names as Array<any>) || [];
  const nameObj = names[0];
  if (nameObj) {
    const first = (nameObj.givenName || '').trim();
    const last = (nameObj.familyName || '').trim();
    if (field === 'last') {
      if (last && first) return `${last}, ${first}`.toLowerCase();
      if (last) return last.toLowerCase();
      if (nameObj.displayNameLastFirst) return nameObj.displayNameLastFirst.toLowerCase();
      if (first) return first.toLowerCase();
    } else {
      if (first && last) return `${first} ${last}`.toLowerCase();
      if (first) return first.toLowerCase();
      if (last) return last.toLowerCase();
    }
    if (nameObj.displayName) return nameObj.displayName.trim().toLowerCase();
  }
  return this.getDisplayName(c).toLowerCase();
}

export function getPrimaryPhone(
  this: Pick<AppModel, 'effectiveCountry'>,
  payload: Record<string, unknown>,
): string {
  const phones = (payload.phoneNumbers as Array<any>) || [];
  const raw = phones[0]?.value || '';
  if (!raw) return '';
  return formatPhone(raw, phones[0]?.canonicalForm, this.effectiveCountry).value;
}

export function getAllPhones(
  this: Pick<AppModel, 'effectiveCountry'>,
  payload: Record<string, unknown>,
): Array<{
  value: string;
  formatted: string;
  type: string;
}> {
  const phones = (payload.phoneNumbers as Array<any>) || [];
  return phones.map((p) => {
    const raw = p?.value || '';
    return {
      value: raw,
      formatted: formatPhone(raw, p?.canonicalForm, this.effectiveCountry).value || raw,
      type: p?.formattedType || p?.type || 'Other',
    };
  });
}

export function getBirthday(
  this: Pick<AppModel, 'preferences'>,
  payload: Record<string, unknown>,
): string {
  const bdays = (payload.birthdays as Array<any>) || [];
  if (!bdays.length) return '';
  return formatBirthdayDate(bdays[0]?.date, bdays[0]?.text, this.preferences.birthdayFormat);
}

export function getContactLabelItems(
  this: Pick<AppModel, 'groupMap'>,
  payload: Record<string, unknown>,
): ContactLabelItem[] {
  const mems = (payload.memberships as Array<any>) || [];
  const items: ContactLabelItem[] = [];
  const seen = new Set<string>();
  for (const m of mems) {
    const res = m?.contactGroupMembership?.contactGroupResourceName;
    if (res) {
      const name = this.groupMap.get(res);
      if (name && !name.startsWith('systemContactGroups/') && !seen.has(name)) {
        seen.add(name);
        items.push({ name, resourceName: res });
      }
    }
  }
  return items;
}

export function getContactLabels(
  this: Pick<AppModel, 'getContactLabelItems'>,
  payload: Record<string, unknown>,
): string[] {
  return this.getContactLabelItems(payload).map((item) => item.name);
}

export function getNickname(payload: Record<string, unknown>): string {
  const nicknames = (payload.nicknames as Array<any>) || [];
  return nicknames[0]?.value || '';
}

export function getOrganization(payload: Record<string, unknown>): {
  org: string;
  title: string;
} {
  const orgs = (payload.organizations as Array<any>) || [];
  return {
    org: orgs[0]?.name || '',
    title: orgs[0]?.title || '',
  };
}

export function getPrimaryAddress(payload: Record<string, unknown>): string {
  const addrs = (payload.addresses as Array<any>) || [];
  return addrs[0]?.formattedValue || addrs[0]?.streetAddress || '';
}

export function getAllAddresses(payload: Record<string, unknown>): Array<{
  lines: string[];
  type: string;
  copyValue: string;
}> {
  const addrs = (payload.addresses as Array<any>) || [];
  return addrs
    .map((a) => {
      // Build multi-line display: prefer formattedValue (split on newlines), else build from parts
      let lines: string[];
      if (a?.formattedValue?.trim()) {
        lines = a.formattedValue.trim().split(/\r?\n/).filter(Boolean);
      } else {
        lines = [
          a.streetAddress,
          a.extendedAddress,
          a.city && a.region
            ? `${a.city}, ${a.region} ${a.postalCode || ''}`.trim()
            : a.city || a.region || '',
          a.postalCode && !a.city && !a.region ? a.postalCode : '',
          a.country || a.countryCode || '',
        ].filter(Boolean);
      }
      const copyValue = lines.join(', ');
      return {
        lines,
        type: a?.formattedType || a?.type || 'Home',
        copyValue,
      };
    })
    .filter((a) => a.lines.length > 0);
}

export function getNotes(payload: Record<string, unknown>): string {
  const bios = (payload.biographies as Array<any>) || [];
  return bios[0]?.value || '';
}

export function getAllRelations(payload: Record<string, unknown>): Array<{
  name: string;
  type: string;
}> {
  const rels = (payload.relations as Array<any>) || [];
  return rels
    .map((r) => ({ name: r?.person || '', type: r?.formattedType || r?.type || 'Related person' }))
    .filter((r) => r.name);
}

export function getAllEvents(
  this: Pick<AppModel, 'preferences'>,
  payload: Record<string, unknown>,
): Array<{
  date: string;
  type: string;
}> {
  const events =
    (payload.events as Array<{
      date?: { day?: number; month?: number; year?: number };
      text?: string;
      formattedType?: string;
      type?: string;
    }>) || [];
  return events
    .map((event) => ({
      date: formatBirthdayDate(event.date, event.text, this.preferences.birthdayFormat),
      type: event.formattedType || event.type || 'Event',
    }))
    .filter((event) => event.date);
}

export function getAllUrls(payload: Record<string, unknown>): Array<{
  url: string;
  type: string;
}> {
  const urls = (payload.urls as Array<any>) || [];
  return urls
    .map((u) => ({ url: u?.value || '', type: u?.formattedType || u?.type || 'Website' }))
    .filter((u) => u.url);
}

export function getAllUserDefined(payload: Record<string, unknown>): Array<{
  key: string;
  value: string;
}> {
  const ud = (payload.userDefined as Array<any>) || [];
  return ud
    .map((u) => ({ key: u?.key || '', value: u?.value || '' }))
    .filter((u) => u.key || u.value);
}

export function getAddressMapsUrl(addr: { lines: string[]; copyValue: string }): string {
  return `https://maps.google.com/?q=${encodeURIComponent(addr.copyValue)}`;
}

export function getMapsUrlFromAddress(address: string): string {
  return `https://maps.google.com/?q=${encodeURIComponent(address)}`;
}

export function formatCaptureTime(timeStr?: string): string {
  if (!timeStr) return '';
  const d = new Date(timeStr);
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRelativeTime(dateStr?: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) return 'recently';
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  const diffMonth = Math.floor(diffDay / 30);
  const diffYear = Math.floor(diffDay / 365);
  if (diffSec < 45) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 30) return `${diffDay}d ago`;
  if (diffMonth < 12) return `${diffMonth}mo ago`;
  return `${diffYear}y ago`;
}

export function getLastEditedInfo(
  this: Pick<AppModel, 'capture' | 'formatCaptureTime' | 'formatRelativeTime'>,
  c: Contact | undefined,
  history: ContactHistoryEntry[],
): {
  date: string;
  relative: string;
} {
  if (!c) return { date: 'Unknown', relative: '' };
  const sources = (c.payload?.metadata as any)?.sources || [];
  const updateTime = sources.find((s: any) => s?.updateTime)?.updateTime;
  let target = updateTime;
  if (!target && history.length > 0) {
    target = history[0].committed_at;
  } else if (!target && this.capture?.committed_at) {
    target = this.capture.committed_at;
  }
  return {
    date: target ? this.formatCaptureTime(target) : 'Not recorded',
    relative: target ? this.formatRelativeTime(target) : '',
  };
}

export function getFirstSeenInfo(
  this: Pick<AppModel, 'capture' | 'formatCaptureTime' | 'formatRelativeTime'>,
  c: Contact | undefined,
  history: ContactHistoryEntry[],
): {
  date: string;
  relative: string;
} {
  if (!c) return { date: 'Unknown', relative: '' };
  let target = '';
  if (history.length > 0) {
    target = history[history.length - 1].committed_at;
  } else if (this.capture?.committed_at) {
    target = this.capture.committed_at;
  }
  return {
    date: target ? this.formatCaptureTime(target) : 'Not recorded',
    relative: target ? this.formatRelativeTime(target) : '',
  };
}

export function formatContactSummary(
  this: Pick<
    AppModel,
    | 'getDisplayName'
    | 'getNotes'
    | 'getOrganization'
    | 'getPrimaryAddress'
    | 'getPrimaryEmail'
    | 'getPrimaryPhone'
  >,
  c: Contact,
): string {
  const payload = c.payload || {};
  const lines: string[] = [this.getDisplayName(c)];
  const org = this.getOrganization(payload);
  if (org.title || org.org) {
    lines.push([org.title, org.org].filter(Boolean).join(' • '));
  }
  const email = this.getPrimaryEmail(payload);
  if (email) lines.push(`Email: ${email}`);
  const phone = this.getPrimaryPhone(payload);
  if (phone) lines.push(`Phone: ${phone}`);
  const address = this.getPrimaryAddress(payload);
  if (address) lines.push(`Address: ${address}`);
  const notes = this.getNotes(payload);
  if (notes) lines.push(`Notes: ${notes}`);
  return lines.join('\n');
}
