import { extractDisplayName } from '../lib/diff';
import { type Contact, type GroupRow, type Change, type ChangelogEntry } from '../lib/ipc';
import type { ColumnDef, SnapshotChangelogGroup } from './types';
import type { AppModel } from './model.svelte';
export function groupMap(this: Pick<AppModel, 'groups'>): Map<string, string> {
  const map = new Map<string, string>();
  for (const g of this.groups) {
    map.set(g.resource_name, g.name);
  }
  return map;
}

export function activeGroups(this: Pick<AppModel, 'groups' | 'selectedGroups'>): GroupRow[] {
  return this.groups.filter((g) => this.selectedGroups.includes(g.resource_name));
}

export function activeGroup(this: Pick<AppModel, 'activeGroups'>): GroupRow | null {
  return this.activeGroups[0] ?? null;
}

export function hiddenCols(this: Pick<AppModel, 'ALL_COLUMNS' | 'activeColKeys'>): ColumnDef[] {
  return this.ALL_COLUMNS.filter((c) => !this.activeColKeys.includes(c.key));
}

export function searchResults(
  this: Pick<
    AppModel,
    | 'allSnapshotContacts'
    | 'getDisplayName'
    | 'getNickname'
    | 'getPrimaryEmail'
    | 'isFavourite'
    | 'matchesContact'
    | 'normalizeSearchText'
    | 'search'
  >,
): Contact[] {
  const query = this.search.trim();
  if (!query) return [];
  const normQuery = this.normalizeSearchText(query);
  const queryTokens = normQuery.split(/\s+/).filter(Boolean);
  const digitTokens = queryTokens.map((t) => t.replace(/\D/g, ''));
  const matches: Array<{
    contact: Contact;
    score: number;
  }> = [];
  for (const contact of this.allSnapshotContacts) {
    if (!this.matchesContact(contact, queryTokens, digitTokens)) continue;
    const name = this.normalizeSearchText(this.getDisplayName(contact));
    const email = this.normalizeSearchText(this.getPrimaryEmail(contact.payload));
    const nick = this.normalizeSearchText(this.getNickname(contact.payload));
    let score = 0;
    // 1. Name starts with full query
    if (name.startsWith(normQuery)) {
      score += 1000;
    }
    // 2. Email starts with query
    if (email.startsWith(normQuery)) {
      score += 800;
    }
    // 3. Word in name starts with query
    const nameWords = name.split(/[\s@._\-/,+]+/).filter(Boolean);
    if (nameWords.some((w) => w.startsWith(normQuery))) {
      score += 600;
    }
    // 4. Nickname starts with query
    if (nick && nick.startsWith(normQuery)) {
      score += 500;
    }
    // 5. Name contains query
    if (name.includes(normQuery)) {
      score += 300;
    }
    // 6. Email contains query
    if (email.includes(normQuery)) {
      score += 200;
    }
    // 7. Starred bonus
    if (this.isFavourite(contact)) {
      score += 50;
    }
    matches.push({ contact, score });
  }
  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return this.getDisplayName(a.contact).localeCompare(this.getDisplayName(b.contact));
  });
  return matches.slice(0, 10).map((m) => m.contact);
}

export function sortedContacts(
  this: Pick<AppModel, 'contacts' | 'getContactSortKey' | 'nameSortDirection' | 'nameSortField'>,
): Contact[] {
  return [...this.contacts].sort((a, b) => {
    const keyA = this.getContactSortKey(a, this.nameSortField);
    const keyB = this.getContactSortKey(b, this.nameSortField);
    const cmp = keyA.localeCompare(keyB, undefined, { numeric: true, sensitivity: 'base' });
    return this.nameSortDirection === 'asc' ? cmp : -cmp;
  });
}

export function favouriteContacts(
  this: Pick<AppModel, 'isFavourite' | 'selectedGroups' | 'sortedContacts'>,
): Contact[] {
  if (this.selectedGroups.length > 0) return [];
  return this.sortedContacts.filter(this.isFavourite);
}

export function otherContacts(
  this: Pick<AppModel, 'favouriteContacts' | 'selectedGroups' | 'sortedContacts'>,
): Contact[] {
  if (this.selectedGroups.length > 0) return this.sortedContacts;
  const favIds = new Set(this.favouriteContacts.map((c) => c.resource_name));
  return this.sortedContacts.filter((c) => !favIds.has(c.resource_name));
}

export function filteredComparisonChanges(
  this: Pick<AppModel, 'changes' | 'comparisonKindFilter' | 'comparisonSearch'>,
): Change[] {
  let list = this.changes;
  if (this.comparisonKindFilter !== 'all') {
    list = list.filter((c) => c.kind === this.comparisonKindFilter);
  }
  const q = this.comparisonSearch.trim().toLowerCase();
  if (q) {
    list = list.filter((c) => {
      const nameA = extractDisplayName(c.after).toLowerCase();
      const nameB = extractDisplayName(c.before).toLowerCase();
      const res = c.resource_name.toLowerCase();
      if (nameA.includes(q) || nameB.includes(q) || res.includes(q)) return true;
      const textA = JSON.stringify(c.after || '').toLowerCase();
      const textB = JSON.stringify(c.before || '').toLowerCase();
      return textA.includes(q) || textB.includes(q);
    });
  }
  return list;
}

export function comparisonStats(
  this: Pick<AppModel, 'changes'>,
): Record<'total' | 'added' | 'changed' | 'removed', number> {
  return {
    total: this.changes.length,
    added: this.changes.filter((c) => c.kind === 'added').length,
    changed: this.changes.filter((c) => c.kind === 'changed').length,
    removed: this.changes.filter((c) => c.kind === 'removed').length,
  };
}

export function filteredChangelog(
  this: Pick<AppModel, 'changelogKindFilter' | 'changelogList' | 'changelogSearch'>,
): ChangelogEntry[] {
  let list = this.changelogList;
  if (this.changelogKindFilter !== 'all') {
    list = list.filter((c) => c.kind === this.changelogKindFilter);
  }
  const q = this.changelogSearch.trim().toLowerCase();
  if (q) {
    list = list.filter((c) => {
      const nameA = extractDisplayName(c.after).toLowerCase();
      const nameB = extractDisplayName(c.before).toLowerCase();
      const res = c.resource_name.toLowerCase();
      if (nameA.includes(q) || nameB.includes(q) || res.includes(q)) return true;
      const textA = JSON.stringify(c.after || '').toLowerCase();
      const textB = JSON.stringify(c.before || '').toLowerCase();
      return textA.includes(q) || textB.includes(q);
    });
  }
  return list;
}

export function changelogStats(
  this: Pick<AppModel, 'captures' | 'changelogList'>,
): Record<'totalSnapshots' | 'totalEvents' | 'added' | 'changed' | 'removed', number> {
  return {
    totalSnapshots: this.captures.length,
    totalEvents: this.changelogList.length,
    added: this.changelogList.filter((c) => c.kind === 'added').length,
    changed: this.changelogList.filter((c) => c.kind === 'changed').length,
    removed: this.changelogList.filter((c) => c.kind === 'removed').length,
  };
}

export function changelogSnapshotGroups(
  this: Pick<AppModel, 'captures' | 'filteredChangelog'>,
): SnapshotChangelogGroup[] {
  const map = new Map<number, SnapshotChangelogGroup>();
  for (const item of this.filteredChangelog) {
    if (!map.has(item.capture_sequence)) {
      const cap = this.captures.find((c) => c.sequence === item.capture_sequence);
      map.set(item.capture_sequence, {
        sequence: item.capture_sequence,
        committed_at: item.committed_at,
        capture: cap,
        changes: [],
      });
    }
    map.get(item.capture_sequence)!.changes.push(item);
  }
  return [...map.values()].sort((a, b) => b.sequence - a.sequence);
}
