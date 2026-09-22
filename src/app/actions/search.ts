import { matchesMissingFields } from '../../lib/missing-fields';
import { type Contact } from '../../lib/ipc';
import type { AppModel } from '../model.svelte';
// Blazing Fast Typo-Tolerant Search Engine
export function normalizeSearchText(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 2) return 99;
  if (la === 0) return lb;
  if (lb === 0) return la;
  const v0 = new Int32Array(lb + 1);
  const v1 = new Int32Array(lb + 1);
  for (let i = 0; i <= lb; i++) v0[i] = i;
  for (let i = 0; i < la; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < lb; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= lb; j++) v0[j] = v1[j];
  }
  return v1[lb];
}

export function matchesToken(
  this: Pick<AppModel, 'levenshtein'>,
  token: string,
  searchWords: string[],
  fullSearchText: string,
  digitQuery: string,
  fullDigits: string,
): boolean {
  if (fullSearchText.includes(token)) return true;
  if (digitQuery && digitQuery.length >= 2 && fullDigits.includes(digitQuery)) return true;
  if (searchWords.some((w) => w.startsWith(token))) return true;
  if (token.length >= 3) {
    if (
      searchWords.some(
        (w) => Math.abs(w.length - token.length) <= 1 && this.levenshtein(token, w) <= 1,
      )
    ) {
      return true;
    }
  }
  if (token.length >= 6) {
    if (
      searchWords.some(
        (w) => Math.abs(w.length - token.length) <= 2 && this.levenshtein(token, w) <= 2,
      )
    ) {
      return true;
    }
  }
  return false;
}

export function matchesContact(
  this: Pick<
    AppModel,
    | 'getAllEmails'
    | 'getAllPhones'
    | 'getContactLabels'
    | 'getDisplayName'
    | 'getNickname'
    | 'getNotes'
    | 'getOrganization'
    | 'getPrimaryAddress'
    | 'matchesToken'
    | 'normalizeSearchText'
  >,
  c: Contact,
  queryTokens: string[],
  digitTokens: string[],
): boolean {
  if (!queryTokens.length) return true;
  const name = this.getDisplayName(c);
  const nick = this.getNickname(c.payload);
  const emails = this.getAllEmails(c.payload)
    .map((e) => e.value)
    .join(' ');
  const phones = this.getAllPhones(c.payload)
    .map((p) => p.value)
    .join(' ');
  const org = this.getOrganization(c.payload);
  const addr = this.getPrimaryAddress(c.payload);
  const notes = this.getNotes(c.payload);
  const labels = this.getContactLabels(c.payload).join(' ');
  const rawCombined = `${name} ${nick} ${emails} ${phones} ${org.org} ${org.title} ${addr} ${notes} ${labels}`;
  const normalized = this.normalizeSearchText(rawCombined);
  const words = normalized.split(/[\s@._\-/,+]+/).filter(Boolean);
  const fullDigits = phones.replace(/\D/g, '');
  for (let i = 0; i < queryTokens.length; i++) {
    const token = queryTokens[i];
    const digitToken = digitTokens[i];
    if (!this.matchesToken(token, words, normalized, digitToken, fullDigits)) {
      return false;
    }
  }
  return true;
}

export function updateDisplayedContacts(
  this: Pick<
    AppModel,
    | 'allSnapshotContacts'
    | 'contacts'
    | 'groupMap'
    | 'groups'
    | 'labelMatchMode'
    | 'missingFieldMode'
    | 'missingFields'
    | 'selectedGroups'
  >,
): void {
  let filtered = this.allSnapshotContacts;
  // Multi-select label filter
  if (this.selectedGroups.length > 0) {
    const groupAliasSets: Set<string>[] = [];
    for (const res of this.selectedGroups) {
      const chosenName =
        this.groups
          .find((group) => group.resource_name === res)
          ?.name?.trim()
          .toLocaleLowerCase() || this.groupMap.get(res)?.trim().toLocaleLowerCase();
      const aliasSet = new Set<string>();
      aliasSet.add(res);
      if (chosenName) {
        for (const group of this.groups) {
          if (group.name?.trim().toLocaleLowerCase() === chosenName) {
            aliasSet.add(group.resource_name);
          }
        }
      }
      groupAliasSets.push(aliasSet);
    }
    if (this.labelMatchMode === 'all') {
      filtered = filtered.filter((contact) => {
        const contactMemberships = (contact.payload.memberships as Array<any>) || [];
        const contactGroupResources = new Set(
          contactMemberships
            .map((m) => m?.contactGroupMembership?.contactGroupResourceName)
            .filter(Boolean),
        );
        return groupAliasSets.every((aliasSet) => {
          for (const r of aliasSet) {
            if (contactGroupResources.has(r)) return true;
          }
          return false;
        });
      });
    } else {
      // 'any' mode (OR logic)
      const combinedAliases = new Set<string>();
      for (const set of groupAliasSets) {
        for (const r of set) {
          combinedAliases.add(r);
        }
      }
      filtered = filtered.filter((contact) => {
        const contactMemberships = (contact.payload.memberships as Array<any>) || [];
        return contactMemberships.some((m) =>
          combinedAliases.has(m?.contactGroupMembership?.contactGroupResourceName),
        );
      });
    }
  }
  this.contacts = filtered.filter((contact) =>
    matchesMissingFields(contact, this.missingFields, this.missingFieldMode),
  );
}
