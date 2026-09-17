<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import brandLogo from './assets/contact-history.png';
  import { version as appVersion } from '../package.json';
  import { readPreferences, savePreferences, applyPreferences, type Preferences } from './lib/preferences';
  let preferences = $state(readPreferences());
  let preferenceNotice = $state('Changes save automatically');
  let settingsTab = $state<'preferences' | 'about'>('preferences');
  let scheduleBusy = $state(false);
  let scheduleReady = $state(false);
  let settingsError = $state('');
  const colorScheme = matchMedia('(prefers-color-scheme: dark)');
  function syncSystemTheme() { applyPreferences(preferences); }
  function updatePreferences(patch: Partial<Preferences>) {
    preferences = { ...preferences, ...patch };
    preferenceNotice = savePreferences(preferences) ? 'Changes saved' : 'Applied for this session; storage is unavailable';
  }
  // Keep keyboard focus inside open dialogs and restore it to their trigger.
  function focusDialog(node: HTMLElement) {
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () => [...node.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]')].filter(el => el.getClientRects().length);
    queueMicrotask(() => focusable()[0]?.focus());
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = focusable();
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    node.addEventListener('keydown', trap);
    return { destroy() { node.removeEventListener('keydown', trap); previous?.focus(); } };
  }
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import type { UnlistenFn } from '@tauri-apps/api/event';
  import { save, open } from '@tauri-apps/plugin-dialog';
  import {
    api,
    listenCaptureProgress,
    type Account,
    type Capture,
    type Contact,
    type GroupRow,
    type MediaView,
    type DueStatus,
    type Change,
    type CaptureProgress,
  } from './lib/ipc';

  const appWindow = getCurrentWindow();

  type Page = 'contacts' | 'changes' | 'settings' | 'onboarding';
  type ColumnKey = 'name' | 'email' | 'phone' | 'birthday' | 'labels' | 'org' | 'title' | 'address' | 'notes';

  interface ColumnDef {
    key: ColumnKey;
    label: string;
    defaultWidth: number;
  }

  const ALL_COLUMNS: ColumnDef[] = [
    { key: 'name', label: 'Name', defaultWidth: 260 },
    { key: 'email', label: 'Email', defaultWidth: 230 },
    { key: 'phone', label: 'Phone number', defaultWidth: 180 },
    { key: 'birthday', label: 'Birthday', defaultWidth: 160 },
    { key: 'labels', label: 'Labels', defaultWidth: 240 },
    { key: 'org', label: 'Organization', defaultWidth: 180 },
    { key: 'title', label: 'Job title', defaultWidth: 160 },
    { key: 'address', label: 'Address', defaultWidth: 220 },
    { key: 'notes', label: 'Notes', defaultWidth: 200 },
  ];

  // App State
  let accounts: Account[] = $state([]);
  let selected: Account | undefined = $state();
  let accountProfile = $state<{ email: string; name?: string | null; picture?: string | null } | null>(null);
  let sidebarCollapsed = $state(false);
  let captures: Capture[] = $state([]);
  let capture: Capture | undefined = $state();
  let groups: GroupRow[] = $state([]);
  let selectedGroup: string | null = $state(null);
  let allSnapshotContacts: Contact[] = $state([]);
  let avatarMap: Record<string, string> = $state({});
  let mediaCache = new Map<string, MediaView[]>();
  let searchInputEl: HTMLInputElement | null = $state(null);
  let searchDropdownEl: HTMLDivElement | null = $state(null);
  let searchDropdownOpen = $state(false);
  let searchActiveIndex = $state(0);
  let contacts: Contact[] = $state([]);
  let detail: Contact | undefined = $state();
  let media: MediaView[] = $state([]);
  let due: DueStatus | undefined = $state();
  let scheduled = $state(false);
  let connected = $state(false);
  let changes: Change[] = $state([]);
  let chosenChange: Change | undefined = $state();
  let pageView: Page = $state('onboarding');
  let dateInput = $state('');
  let search = $state('');
  let clientId = $state('');
  let clientSecret = $state('');
  let busy = $state(false);
  let error = $state('');
  let offset = $state(0);
  let contactsRequest = 0;
  let isMaximized = $state(false);
  let showColCustomizer = $state(false);
  let showSnapshotDropdown = $state(false);
  let showAccountMenu = $state(false);
  let showSettingsModal = $state(false);
  let showRawDataModal = $state(false);
  let compareBaseSeq: number | null = $state(null);
  let compareTargetSeq: number | null = $state(null);
  let copiedFieldKey = $state<string | null>(null);
  let copiedTimeout: any = null;
  let captureProgress = $state<CaptureProgress | null>(null);
  let toastMessage = $state('');

  // Column Configuration & Resizing State
  let activeColKeys = $state<ColumnKey[]>(['name', 'email', 'phone', 'birthday', 'labels']);
  let colWidths = $state<Record<ColumnKey, number>>({
    name: 260,
    email: 230,
    phone: 180,
    birthday: 160,
    labels: 240,
    org: 180,
    title: 160,
    address: 220,
    notes: 200,
  });

  // Group Map derived for quick label name lookup
  const groupMap = $derived.by(() => {
    const map = new Map<string, string>();
    for (const g of groups) {
      map.set(g.resource_name, g.name);
    }
    return map;
  });

  const activeGroup = $derived.by(() => {
    if (!selectedGroup) return null;
    return groups.find((g) => g.resource_name === selectedGroup) ?? null;
  });

  const hiddenCols = $derived.by(() => {
    return ALL_COLUMNS.filter((c) => !activeColKeys.includes(c.key));
  });

  // Contact Parsing Helpers
  function getDisplayName(c: Contact): string {
    if (c.display_name && c.display_name.trim()) return c.display_name.trim();
    const payload = c.payload || {};
    const names = (payload.names as Array<any>) || [];
    if (names[0]?.displayName) return names[0].displayName;
    const email = getPrimaryEmail(payload);
    if (email) return email;
    const phone = getPrimaryPhone(payload);
    if (phone) return phone;
    return 'Unknown';
  }

  const GOOGLE_AVATAR_COLORS = [
    '#1a73e8', // Blue
    '#d93025', // Red
    '#e37400', // Orange
    '#0f9d58', // Green
    '#9334e6', // Purple
    '#0097a7', // Teal
    '#0f9d58', // Green (matching NX Cash Back N)
    '#e91e63', // Pink
    '#5c6bc0', // Indigo
    '#00897b', // Dark Teal
    '#689f38', // Light Green
    '#8e24aa', // Deep Purple
  ];

  function getAvatarColor(name: string): string {
    if (!name) return GOOGLE_AVATAR_COLORS[0];
    const char = name.trim().charAt(0).toUpperCase();
    const code = char.charCodeAt(0);
    return GOOGLE_AVATAR_COLORS[code % GOOGLE_AVATAR_COLORS.length];
  }

  function getAvatarInitial(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) return '?';
    return trimmed.charAt(0).toUpperCase();
  }

  function getInitials(name: string): string {
    const parts = name.trim().split(/[\s@._-]+/).filter(Boolean);
    if (!parts.length) return '?';
    return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
  }

  function getPhotoUrl(payload: Record<string, unknown>): string {
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

  function getAvatarSource(c: Contact, mediaList: MediaView[] = []): string {
    const preferredUrl = getPhotoUrl(c.payload);
    if (preferredUrl) {
      if (avatarMap[preferredUrl]) return avatarMap[preferredUrl];
      const match = mediaList.find((m) => m.source_url === preferredUrl && m.data_url);
      if (match?.data_url) return match.data_url;
      return preferredUrl;
    }

    const localAvatar = avatarMap[c.resource_name];
    if (localAvatar) return localAvatar;

    const firstMedia = mediaList.find((m) => m.data_url);
    if (firstMedia?.data_url) return firstMedia.data_url;
    return '';
  }

  // Blazing Fast Typo-Tolerant Search Engine
  function normalizeSearchText(str: string): string {
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  function levenshtein(a: string, b: string): number {
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

  function matchesToken(
    token: string,
    searchWords: string[],
    fullSearchText: string,
    digitQuery: string,
    fullDigits: string
  ): boolean {
    if (fullSearchText.includes(token)) return true;
    if (digitQuery && digitQuery.length >= 2 && fullDigits.includes(digitQuery)) return true;
    if (searchWords.some((w) => w.startsWith(token))) return true;
    if (token.length >= 3) {
      if (searchWords.some((w) => Math.abs(w.length - token.length) <= 1 && levenshtein(token, w) <= 1)) {
        return true;
      }
    }
    if (token.length >= 6) {
      if (searchWords.some((w) => Math.abs(w.length - token.length) <= 2 && levenshtein(token, w) <= 2)) {
        return true;
      }
    }
    return false;
  }

  function matchesContact(c: Contact, queryTokens: string[], digitTokens: string[]): boolean {
    if (!queryTokens.length) return true;
    const name = getDisplayName(c);
    const nick = getNickname(c.payload);
    const emails = getAllEmails(c.payload).map((e) => e.value).join(' ');
    const phones = getAllPhones(c.payload).map((p) => p.value).join(' ');
    const org = getOrganization(c.payload);
    const addr = getPrimaryAddress(c.payload);
    const notes = getNotes(c.payload);
    const labels = getContactLabels(c.payload).join(' ');

    const rawCombined = `${name} ${nick} ${emails} ${phones} ${org.org} ${org.title} ${addr} ${notes} ${labels}`;
    const normalized = normalizeSearchText(rawCombined);
    const words = normalized.split(/[\s@._\-/,+]+/).filter(Boolean);
    const fullDigits = phones.replace(/\D/g, '');

    for (let i = 0; i < queryTokens.length; i++) {
      const token = queryTokens[i];
      const digitToken = digitTokens[i];
      if (!matchesToken(token, words, normalized, digitToken, fullDigits)) {
        return false;
      }
    }
    return true;
  }

  const searchResults = $derived.by(() => {
    const query = search.trim();
    if (!query) return [];

    const normQuery = normalizeSearchText(query);
    const queryTokens = normQuery.split(/\s+/).filter(Boolean);
    const digitTokens = queryTokens.map((t) => t.replace(/\D/g, ''));

    const matches: Array<{ contact: Contact; score: number }> = [];

    for (const contact of allSnapshotContacts) {
      if (!matchesContact(contact, queryTokens, digitTokens)) continue;

      const name = normalizeSearchText(getDisplayName(contact));
      const email = normalizeSearchText(getPrimaryEmail(contact.payload));
      const nick = normalizeSearchText(getNickname(contact.payload));

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
      if (isFavourite(contact)) {
        score += 50;
      }

      matches.push({ contact, score });
    }

    matches.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return getDisplayName(a.contact).localeCompare(getDisplayName(b.contact));
    });

    return matches.slice(0, 10).map((m) => m.contact);
  });

  function updateDisplayedContacts() {
    let filtered = allSnapshotContacts;

    // Label filter only: search does not filter existing list while typing
    if (selectedGroup) {
      const chosenName = groups.find((group) => group.resource_name === selectedGroup)?.name.trim().toLocaleLowerCase();
      const matchingGroups = new Set(groups.filter((group) => group.name.trim().toLocaleLowerCase() === chosenName).map((group) => group.resource_name));
      filtered = filtered.filter((contact) => ((contact.payload.memberships as Array<any>) || []).some((membership) =>
        matchingGroups.has(membership?.contactGroupMembership?.contactGroupResourceName)));
    }

    contacts = filtered;
  }

  async function copyFieldValue(key: string, text: string) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      copiedFieldKey = key;
      if (copiedTimeout) clearTimeout(copiedTimeout);
      copiedTimeout = setTimeout(() => {
        copiedFieldKey = null;
      }, 2000);
    } catch (_) {}
  }

  function downloadContactJson(c: Contact) {
    const jsonStr = JSON.stringify(c.payload, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = getDisplayName(c).replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    a.download = `contact-${safeName}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toastMessage = `Downloaded contact data for ${getDisplayName(c)}.`;
    setTimeout(() => { toastMessage = ''; }, 4000);
  }

  function downloadContactVcf(c: Contact) {
    const name = getDisplayName(c);
    const email = getPrimaryEmail(c.payload);
    const phone = getPrimaryPhone(c.payload);
    const addr = getPrimaryAddress(c.payload);
    const org = getOrganization(c.payload).org;
    const title = getOrganization(c.payload).title;
    const lines = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${name}`,
    ];
    if (org) lines.push(`ORG:${org}`);
    if (title) lines.push(`TITLE:${title}`);
    if (email) lines.push(`EMAIL;TYPE=INTERNET:${email}`);
    if (phone) lines.push(`TEL;TYPE=VOICE:${phone}`);
    if (addr) lines.push(`ADR;TYPE=HOME:;;${addr};;;;`);
    lines.push('END:VCARD');
    const vcfStr = lines.join('\r\n');
    const blob = new Blob([vcfStr], { type: 'text/vcard' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    a.download = `contact-${safeName}.vcf`;
    a.click();
    URL.revokeObjectURL(url);
    toastMessage = `Downloaded vCard for ${name}.`;
    setTimeout(() => { toastMessage = ''; }, 4000);
  }

  function getPrimaryEmail(payload: Record<string, unknown>): string {
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

  function getAllEmails(payload: Record<string, unknown>): Array<{ value: string; type: string }> {
    if (!payload) return [];
    const list: Array<{ value: string; type: string }> = [];
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
    if (typeof payload.email === 'string' && payload.email.trim() && !list.some((item) => item.value === payload.email)) {
      list.push({ value: payload.email.trim(), type: 'Other' });
    }
    return list;
  }

  function isFavourite(contact: Contact): boolean {
    const payload = contact.payload || {};
    const mems = (payload.memberships as Array<any>) || [];
    for (const m of mems) {
      const res = m?.contactGroupMembership?.contactGroupResourceName || '';
      const id = m?.contactGroupMembership?.contactGroupId || '';
      if (res === 'contactGroups/starred' || id === 'starred' || res.includes('starred')) {
        return true;
      }
    }
    if ((payload as any).starred === true) return true;
    if ((payload as any).userDefined?.some?.((u: any) => u.key === 'starred' && u.value === 'true')) return true;
    return false;
  }

  // Sorted contacts: alphabetical by display name by default
  const sortedContacts = $derived.by(() => {
    return [...contacts].sort((a, b) => {
      const nameA = getDisplayName(a).toLowerCase();
      const nameB = getDisplayName(b).toLowerCase();
      return nameA.localeCompare(nameB);
    });
  });

  // Favourites starred at top
  const favouriteContacts = $derived.by(() => {
    if (selectedGroup) return [];
    return sortedContacts.filter(isFavourite);
  });

  // Remaining contacts
  const otherContacts = $derived.by(() => {
    if (selectedGroup) return sortedContacts;
    const favIds = new Set(favouriteContacts.map((c) => c.resource_name));
    return sortedContacts.filter((c) => !favIds.has(c.resource_name));
  });

  function getPrimaryPhone(payload: Record<string, unknown>): string {
    const phones = (payload.phoneNumbers as Array<any>) || [];
    return phones[0]?.value || '';
  }

  function getAllPhones(payload: Record<string, unknown>): Array<{ value: string; type: string }> {
    const phones = (payload.phoneNumbers as Array<any>) || [];
    return phones.map((p) => ({
      value: p?.value || '',
      type: p?.formattedType || p?.type || 'Other',
    }));
  }

  function getBirthday(payload: Record<string, unknown>): string {
    const bdays = (payload.birthdays as Array<any>) || [];
    if (!bdays.length) return '';
    const date = bdays[0]?.date;
    if (!date) return bdays[0]?.text || '';
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    const m = date.month ? months[date.month - 1] : '';
    const d = date.day || '';
    const y = date.year || '';
    return [d, m, y].filter(Boolean).join(' ');
  }

  function getContactLabels(payload: Record<string, unknown>): string[] {
    const mems = (payload.memberships as Array<any>) || [];
    const labels: string[] = [];
    for (const m of mems) {
      const res = m?.contactGroupMembership?.contactGroupResourceName;
      if (res) {
        const name = groupMap.get(res);
        if (name && !name.startsWith('systemContactGroups/')) {
          labels.push(name);
        }
      }
    }
    return labels;
  }

  function getNickname(payload: Record<string, unknown>): string {
    const nicknames = (payload.nicknames as Array<any>) || [];
    return nicknames[0]?.value || '';
  }

  function getOrganization(payload: Record<string, unknown>): { org: string; title: string } {
    const orgs = (payload.organizations as Array<any>) || [];
    return {
      org: orgs[0]?.name || '',
      title: orgs[0]?.title || '',
    };
  }

  function getPrimaryAddress(payload: Record<string, unknown>): string {
    const addrs = (payload.addresses as Array<any>) || [];
    return addrs[0]?.formattedValue || addrs[0]?.streetAddress || '';
  }

  function getNotes(payload: Record<string, unknown>): string {
    const bios = (payload.biographies as Array<any>) || [];
    return bios[0]?.value || '';
  }

  function formatCaptureTime(timeStr?: string): string {
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

  // Window Controls
  async function winMinimize() {
    try {
      await api.winMinimize();
    } catch (_) {
      await appWindow.minimize();
    }
  }

  async function winToggleMaximize() {
    try {
      isMaximized = await api.winToggleMaximize();
    } catch (_) {
      await appWindow.toggleMaximize();
      isMaximized = await appWindow.isMaximized();
    }
  }

  async function winClose() {
    try {
      await api.winClose();
    } catch (_) {
      await appWindow.close();
    }
  }

  async function onTopbarMouseDown(e: MouseEvent) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, input, a, select, textarea, [data-no-drag]')) return;
    if (e.detail === 2) {
      await winToggleMaximize();
    } else {
      try {
        await appWindow.startDragging();
      } catch (_) {}
    }
  }

  // Navigation & Data Refresh
  function navigate(to: Page) {
    pageView = to;
    error = '';
  }

  async function refreshAccounts() {
    try {
      accounts = await api.accounts();
      if (!selected && accounts.length) {
        await selectAccount(accounts[0]);
      } else if (!accounts.length) {
        pageView = 'onboarding';
      }
    } catch (e) {
      error = String(e);
    }
  }

  async function selectAccount(account: Account) {
    selected = account;
    detail = undefined;
    chosenChange = undefined;
    search = '';
    offset = 0;
    selectedGroup = null;
    try {
      accountProfile = await api.profile(account.id);
    } catch (_) {
      accountProfile = null;
    }
    try {
      captures = await api.captures(account.id);
      capture = captures[0];
      due = await api.due(account.id);
      connected = (await api.health(account.id)).connected;
      await refreshGroups();
      await refreshContacts();
      await refreshChanges();
      navigate('contacts');
    } catch (e) {
      error = String(e);
    }
  }

  function isSystemGroup(resName: string, name: string): boolean {
    const res = (resName || '').toLowerCase();
    if (
      res.endsWith('/mycontacts') ||
      res.endsWith('/starred') ||
      res.endsWith('/all') ||
      res.endsWith('/blocked') ||
      res.endsWith('/chatbuddies') ||
      res.endsWith('/coworkers') ||
      res.endsWith('/family') ||
      res.endsWith('/friends')
    ) {
      return true;
    }
    const norm = (name || '').trim().toLowerCase().replace(/[-_\s]/g, '');
    const sysNames = new Set([
      'mycontacts',
      'starred',
      'all',
      'allcontacts',
      'blocked',
      'chatbuddies',
      'chatcontacts',
      'coworkers',
      'family',
      'familyandfriends',
      'friends',
    ]);
    return sysNames.has(norm);
  }

  async function refreshGroups() {
    if (!selected || !capture) {
      groups = [];
      return;
    }
    try {
      const fetched = await api.groups(selected.id, capture.sequence);
      groups = fetched.filter((g) => !isSystemGroup(g.resource_name, g.name));
    } catch (e) {
      groups = [];
    }
  }

  async function refreshContacts() {
    const request = ++contactsRequest;
    if (!selected || !capture) {
      allSnapshotContacts = [];
      avatarMap = {};
      contacts = [];
      return;
    }
    try {
      const [nextContacts, nextAvatars] = await Promise.all([
        api.contacts(selected.id, capture.sequence, '', null, 0),
        api.avatars(selected.id, capture.sequence).catch(() => ({} as Record<string, string>)),
      ]);
      if (request !== contactsRequest) return;
      allSnapshotContacts = nextContacts;
      avatarMap = nextAvatars;
      updateDisplayedContacts();
    } catch (e) {
      if (request !== contactsRequest) return;
      error = String(e);
      allSnapshotContacts = [];
      contacts = [];
    }
    detail = undefined;
    media = [];
  }

  function onSearchInput() {
    searchDropdownOpen = search.trim().length > 0;
    searchActiveIndex = 0;
  }

  function onSearchFocus() {
    if (search.trim().length > 0) {
      searchDropdownOpen = true;
      searchActiveIndex = 0;
    }
  }

  function clearSearch() {
    search = '';
    searchDropdownOpen = false;
    searchActiveIndex = 0;
    searchInputEl?.focus();
  }

  function selectSearchResult(contact: Contact) {
    searchDropdownOpen = false;
    selectContact(contact);
    if (pageView !== 'contacts') {
      navigate('contacts');
    }
  }

  function scrollActiveSearchResultIntoView() {
    if (!searchDropdownEl) return;
    const activeEl = searchDropdownEl.querySelector('.search-result-item.active') as HTMLElement | null;
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }

  function onSearchKeyDown(event: KeyboardEvent) {
    if (!searchDropdownOpen && search.trim().length > 0 && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      searchDropdownOpen = true;
      searchActiveIndex = 0;
      event.preventDefault();
      return;
    }

    if (!searchDropdownOpen || searchResults.length === 0) {
      if (event.key === 'Escape') {
        clearSearch();
      }
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      searchActiveIndex = (searchActiveIndex + 1) % searchResults.length;
      setTimeout(scrollActiveSearchResultIntoView, 0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      searchActiveIndex = (searchActiveIndex - 1 + searchResults.length) % searchResults.length;
      setTimeout(scrollActiveSearchResultIntoView, 0);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (searchActiveIndex >= 0 && searchActiveIndex < searchResults.length) {
        selectSearchResult(searchResults[searchActiveIndex]);
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      searchDropdownOpen = false;
    }
  }

  function handleWindowClick(e: MouseEvent) {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    if (!target.closest('.topbar-search-container')) {
      searchDropdownOpen = false;
    }
    if (!target.closest('.account-avatar-btn') && !target.closest('.account-menu')) {
      showAccountMenu = false;
    }
  }

  async function refreshChanges() {
    if (!selected || !capture) {
      changes = [];
      return;
    }
    compareTargetSeq = capture.sequence;
    const prior = captures.find((c) => c.sequence < capture!.sequence);
    compareBaseSeq = prior ? prior.sequence : Math.max(1, capture.sequence - 1);

    try {
      if (compareBaseSeq === compareTargetSeq) {
        changes = await api.changes(selected.id, capture.sequence, 0);
      } else {
        changes = await api.compareSnapshots(selected.id, compareBaseSeq, compareTargetSeq);
      }
    } catch (e) {
      changes = [];
    }
    chosenChange = undefined;
  }

  async function refreshChangesComparison() {
    if (!selected || compareBaseSeq === null || compareTargetSeq === null) {
      changes = [];
      return;
    }
    busy = true;
    try {
      if (compareBaseSeq === compareTargetSeq) {
        changes = await api.changes(selected.id, compareTargetSeq, 0);
      } else {
        changes = await api.compareSnapshots(selected.id, compareBaseSeq, compareTargetSeq);
      }
    } catch (e) {
      changes = [];
      error = String(e);
    } finally {
      busy = false;
    }
    chosenChange = undefined;
  }

  async function selectContact(contact: Contact) {
    detail = contact;
    media = mediaCache.get(contact.resource_name) || [];
    if (selected && capture) {
      try {
        const loadedMedia = await api.media(selected.id, capture.sequence, contact.resource_name);
        mediaCache.set(contact.resource_name, loadedMedia);
        if (detail?.resource_name === contact.resource_name) {
          media = loadedMedia;
        }
      } catch (e) {
        // non-blocking
      }
    }
  }

  function selectLabelFilter(groupResourceName: string | null) {
    selectedGroup = groupResourceName;
    if (window.innerWidth < 1000) sidebarCollapsed = true;
    offset = 0;
    detail = undefined;
    updateDisplayedContacts();
  }

  async function changeCapture(sequence: number) {
    capture = captures.find((c) => c.sequence === sequence);
    offset = 0;
    selectedGroup = null;
    showSnapshotDropdown = false;
    await refreshGroups();
    await refreshContacts();
    await refreshChanges();
  }

  // Capture & Cancel Action
  async function captureNow() {
    if (!selected) return;
    busy = true;
    error = '';
    captureProgress = {
      account_id: selected.id,
      stage: 'contacts',
      message: 'Connecting to Google People API...',
      percent: 5,
    };
    try {
      const outcome = await api.capture(selected.id);
      await selectAccount(selected);
      if (!outcome.is_new) {
        toastMessage = `No changes detected. Snapshot #${outcome.capture.sequence} is up to date.`;
      } else {
        toastMessage = `Snapshot #${outcome.capture.sequence} captured (${outcome.change_count} changes).`;
      }
      setTimeout(() => { toastMessage = ''; }, 5000);
    } catch (e) {
      error = String(e);
    } finally {
      busy = false;
      captureProgress = null;
    }
  }

  async function importCsv() {
    if (!selected) return;
    try {
      const selectedPath = await open({
        multiple: false,
        filters: [{ name: 'Google Contacts CSV', extensions: ['csv'] }],
      });
      if (typeof selectedPath === 'string') {
        busy = true;
        error = '';
        captureProgress = {
          account_id: selected.id,
          stage: 'contacts',
          message: 'Importing contacts from CSV...',
          percent: 30,
        };
        const outcome = await api.importCsv(selected.id, selectedPath);
        await selectAccount(selected);
        if (!outcome.is_new) {
          toastMessage = `No changes detected in CSV. Snapshot #${outcome.capture.sequence} is up to date.`;
        } else {
          toastMessage = `Imported CSV. Snapshot #${outcome.capture.sequence} created (${outcome.change_count} changes).`;
        }
        setTimeout(() => { toastMessage = ''; }, 5000);
      }
    } catch (e) {
      error = String(e);
    } finally {
      busy = false;
      captureProgress = null;
    }
  }

  async function cancelCapture() {
    if (!selected) return;
    try {
      await api.cancelCapture(selected.id);
      captureProgress = {
        account_id: selected.id,
        stage: 'contacts',
        message: 'Cancelling capture...',
        percent: 0,
      };
    } catch (e) {
      error = String(e);
    }
  }

  // Column Drag Resizing
  let resizingCol = $state<ColumnKey | null>(null);
  let startX = 0;
  let startWidth = 0;

  function onResizeStart(col: ColumnKey, e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    resizingCol = col;
    startX = e.clientX;
    startWidth = colWidths[col];

    function onMouseMove(moveEvent: MouseEvent) {
      if (!resizingCol) return;
      const diff = moveEvent.clientX - startX;
      const newWidth = Math.max(80, startWidth + diff);
      colWidths[resizingCol] = newWidth;
    }

    function onMouseUp() {
      resizingCol = null;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      try {
        localStorage.setItem('contacts_col_widths', JSON.stringify(colWidths));
      } catch (_) {}
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  function toggleColumn(key: ColumnKey) {
    if (key === 'name') return; // Name is always required
    if (activeColKeys.includes(key)) {
      activeColKeys = activeColKeys.filter((k) => k !== key);
    } else {
      activeColKeys = [...activeColKeys, key];
    }
    try {
      localStorage.setItem('contacts_active_cols', JSON.stringify(activeColKeys));
    } catch (_) {}
  }

  function moveColumn(key: ColumnKey, direction: -1 | 1) {
    const index = activeColKeys.indexOf(key);
    if (index === -1) return;
    const targetIndex = index + direction;
    // Name is always first (index 0)
    if (targetIndex < 1 || targetIndex >= activeColKeys.length) return;
    const newCols = [...activeColKeys];
    const temp = newCols[index];
    newCols[index] = newCols[targetIndex];
    newCols[targetIndex] = temp;
    activeColKeys = newCols;
    try {
      localStorage.setItem('contacts_active_cols', JSON.stringify(activeColKeys));
    } catch (_) {}
  }

  function resetColumns() {
    activeColKeys = ['name', 'email', 'phone', 'birthday', 'labels'];
    colWidths = {
      name: 260,
      email: 230,
      phone: 180,
      birthday: 160,
      labels: 240,
      org: 180,
      title: 160,
      address: 220,
      notes: 200,
    };
    try {
      localStorage.removeItem('contacts_active_cols');
      localStorage.removeItem('contacts_col_widths');
    } catch (_) {}
  }

  // Settings Actions
  async function toggleSchedule() {
    if (scheduleBusy || !scheduleReady) return;
    scheduleBusy = true;
    settingsError = '';
    try {
      if (scheduled) await api.disableSchedule();
      else await api.enableSchedule();
      scheduled = await api.scheduleState();
    } catch (e) {
      settingsError = String(e);
    } finally { scheduleBusy = false; }
  }

  async function exportSelected(format: 'csv' | 'vcf') {
    if (!selected || !capture) return;
    try {
      const destination = await save({
        defaultPath: `contacts-capture-${capture.sequence}.${format}`,
        filters: [{ name: format === 'csv' ? 'Google CSV' : 'vCard', extensions: [format] }],
      });
      if (destination) {
        await api.exportCapture(selected.id, capture.sequence, format, destination);
      }
    } catch (e) {
      error = String(e);
    }
  }

  async function backupSelected() {
    if (!selected) return;
    try {
      const destination = await save({
        defaultPath: `contact-history-${selected.email}.contacthistory`,
      });
      if (destination) {
        await api.backupAccount(selected.id, destination);
      }
    } catch (e) {
      error = String(e);
    }
  }

  async function restoreLocal() {
    try {
      const source = await open({ directory: true, multiple: false });
      if (typeof source === 'string') {
        const account = await api.restoreArchive(source);
        await refreshAccounts();
        await selectAccount(account);
      }
    } catch (e) {
      error = String(e);
    }
  }

  async function disconnectSelected() {
    if (!selected) return;
    settingsError = '';
    try {
      await api.disconnect(selected.id);
      await refreshAccounts();
    } catch (e) {
      error = String(e);
      settingsError = String(e);
    }
  }

  async function connectNewAccount() {
    busy = true;
    error = '';
    try {
      const account = await api.connect(clientId.trim(), clientSecret.trim());
      await refreshAccounts();
      await selectAccount(account);
      clientSecret = '';
    } catch (e) {
      error = String(e);
    } finally {
      busy = false;
    }
  }

  let unlistenProgress: UnlistenFn | undefined;

  function handleGlobalKeyDown(event: KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      searchInputEl?.focus();
      searchInputEl?.select();
      if (search.trim().length > 0) {
        searchDropdownOpen = true;
      }
      return;
    }
    if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes((document.activeElement as HTMLElement)?.tagName)) {
      event.preventDefault();
      searchInputEl?.focus();
      searchInputEl?.select();
      if (search.trim().length > 0) {
        searchDropdownOpen = true;
      }
      return;
    }
    if (event.key === 'Escape') {
      showSnapshotDropdown = false;
      if (searchDropdownOpen) {
        searchDropdownOpen = false;
        return;
      }
      if (document.activeElement === searchInputEl || search) {
        clearSearch();
      }
    }
  }

  onMount(async () => {
    window.addEventListener('keydown', handleGlobalKeyDown);
    window.addEventListener('click', handleWindowClick);
    colorScheme.addEventListener('change', syncSystemTheme);
    api.scheduleState().then(value => { scheduled = value; scheduleReady = true; }).catch(e => { settingsError = 'Could not load the capture schedule: ' + String(e); });
    // Load persisted column settings
    try {
      const savedCols = localStorage.getItem('contacts_active_cols');
      if (savedCols) activeColKeys = JSON.parse(savedCols);
      const savedWidths = localStorage.getItem('contacts_col_widths');
      if (savedWidths) colWidths = { ...colWidths, ...JSON.parse(savedWidths) };
    } catch (_) {}

    // Window maximized state check
    try {
      isMaximized = await api.winIsMaximized();
    } catch (_) {
      try {
        isMaximized = await appWindow.isMaximized();
      } catch (_) {}
    }

    await refreshAccounts();

    // Listen for real-time capture progress
    unlistenProgress = await listenCaptureProgress((progress) => {
      captureProgress = progress;
    });
  });

  onDestroy(() => {
    unlistenProgress?.();
    window.removeEventListener('keydown', handleGlobalKeyDown);
    window.removeEventListener('click', handleWindowClick);
    colorScheme.removeEventListener('change', syncSystemTheme);
  });
</script>

<div class="app-container">
  <!-- Native Custom Frameless Topbar -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <header class="topbar" onmousedown={onTopbarMouseDown}>
    <div class="topbar-left" data-tauri-drag-region>
      <button
        class="icon-btn"
        title="Main menu"
        aria-label="Main menu"
        onclick={() => sidebarCollapsed = !sidebarCollapsed}
      >
        <span class="material-symbols-outlined">menu</span>
      </button>
      <button
        class="app-brand"
        aria-label="Contact History home"
        style="background: none; border: none; padding: 0; text-align: left;"
        onclick={() => { selectLabelFilter(null); navigate('contacts'); }}
      >
        <img class="brand-logo" src={brandLogo} alt="" />
        <span class="app-title">Contact History</span>
      </button>
    </div>

    <!-- Draggable area around search -->
    <div class="topbar-drag-area" data-tauri-drag-region>
      <div class="topbar-search-container {searchDropdownOpen && search.trim() ? 'has-dropdown' : ''}" data-tauri-drag-region="false">
        <div class="topbar-search {searchDropdownOpen && search.trim() ? 'dropdown-open' : ''}">
          <span class="material-symbols-outlined search-icon">search</span>
          <input
            type="text"
            class="search-input"
            placeholder="Search contacts (Ctrl+K)"
            aria-label="Search contacts"
            bind:this={searchInputEl}
            bind:value={search}
            oninput={onSearchInput}
            onfocus={onSearchFocus}
            onclick={onSearchFocus}
            onkeydown={onSearchKeyDown}
          />
          {#if !search}
            <span class="search-shortcut-badge" title="Press Ctrl+K to search">Ctrl K</span>
          {:else}
            <button class="search-clear-btn" aria-label="Clear search" onclick={clearSearch}>
              <span class="material-symbols-outlined">close</span>
            </button>
          {/if}
        </div>

        {#if searchDropdownOpen && search.trim()}
          <div class="search-dropdown-menu" bind:this={searchDropdownEl} role="listbox" data-tauri-drag-region="false">
            {#if searchResults.length > 0}
              {#each searchResults as contact, idx (contact.resource_name)}
                <button
                  type="button"
                  class="search-result-item {idx === searchActiveIndex ? 'active' : ''}"
                  role="option"
                  aria-selected={idx === searchActiveIndex}
                  onclick={() => selectSearchResult(contact)}
                  onmouseenter={() => searchActiveIndex = idx}
                  data-tauri-drag-region="false"
                >
                  <div class="search-avatar-circle" style="background-color: {getAvatarColor(getDisplayName(contact))};">
                    {#if getAvatarSource(contact)}
                      <img
                        src={getAvatarSource(contact)}
                        alt={getDisplayName(contact)}
                        class="search-avatar-img"
                        loading="lazy"
                        referrerpolicy="no-referrer"
                        onerror={(e) => { (e.currentTarget as HTMLElement).classList.add('avatar-img-failed'); }}
                      />
                    {/if}
                    <span class="search-avatar-text">{getAvatarInitial(getDisplayName(contact))}</span>
                  </div>
                  <div class="search-result-info">
                    <span class="search-result-name">{getDisplayName(contact)}</span>
                    {#if getPrimaryEmail(contact.payload)}
                      <span class="search-result-sep">&mdash;</span>
                      <span class="search-result-email">{getPrimaryEmail(contact.payload)}</span>
                    {:else if getPrimaryPhone(contact.payload)}
                      <span class="search-result-sep">&mdash;</span>
                      <span class="search-result-phone">{getPrimaryPhone(contact.payload)}</span>
                    {/if}
                  </div>
                </button>
              {/each}
            {:else}
              <div class="search-empty-state">
                <span class="material-symbols-outlined search-empty-icon">search_off</span>
                <span>No contacts matching "{search.trim()}"</span>
              </div>
            {/if}
            <div class="search-dropdown-footer">
              <span>Use <kbd>&uarr;</kbd> <kbd>&darr;</kbd> to navigate, <kbd>&crarr;</kbd> to select, <kbd>Esc</kbd> to dismiss</span>
            </div>
          </div>
        {/if}
      </div>
    </div>

    <!-- Topbar Actions & Window Controls -->
    <div class="topbar-right">
      {#if captures.length > 0 && capture}
        <button class="snapshot-chip" onclick={() => showSnapshotDropdown = !showSnapshotDropdown} title="Snapshot Timeline">
          <span class="material-symbols-outlined">history</span>
          <span>Snapshot #{capture.sequence}</span>
          <span class="material-symbols-outlined" style="font-size: 16px;">arrow_drop_down</span>
        </button>
      {/if}

      <button class="icon-btn" onclick={() => showSettingsModal = true} title="Settings">
        <span class="material-symbols-outlined">settings</span>
      </button>

      {#if selected}
        <button
          class="account-avatar-btn"
          aria-expanded={showAccountMenu}
          aria-haspopup="true"
          title={accountProfile?.name ? `${accountProfile.name} (${selected.email})` : selected.email}
          onclick={() => { showAccountMenu = !showAccountMenu; showSnapshotDropdown = false; }}
        >
          {#if accountProfile?.picture}
            <img
              src={accountProfile.picture}
              alt={accountProfile.name || selected.email}
              class="topbar-avatar-img"
              referrerpolicy="no-referrer"
              onerror={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
            />
          {/if}
          <span>{getInitials(accountProfile?.name || selected.email)}</span>
        </button>
      {/if}

      <!-- Windows Controls -->
      <div class="window-controls">
        <button class="win-btn" onclick={winMinimize} title="Minimize">
          <span class="material-symbols-outlined">minimize</span>
        </button>
        <button class="win-btn" onclick={winToggleMaximize} title={isMaximized ? 'Restore' : 'Maximize'}>
          <span class="material-symbols-outlined">{isMaximized ? 'filter_none' : 'crop_square'}</span>
        </button>
        <button class="win-btn win-close" onclick={winClose} title="Close">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
    </div>
  </header>

  <!-- Account Popover Menu -->
  {#if showAccountMenu}
    <div
      class="menu-scrim"
      style="position: fixed; inset: 0; z-index: 101; background: transparent;"
      onclick={() => showAccountMenu = false}
      onkeydown={(e) => { if (e.key === 'Escape') showAccountMenu = false; }}
      role="presentation"
      tabindex="-1"
    ></div>
    <div
      class="popover account-menu"
      role="menu"
      aria-label="Google accounts"
      tabindex="-1"
      onkeydown={(e) => { if (e.key === 'Escape') showAccountMenu = false; }}
    >
      <div class="account-menu-heading">Google accounts</div>
      {#each accounts as acc}
        <button
          type="button"
          class="account-menu-item"
          class:selected={selected?.id === acc.id}
          role="menuitem"
          onclick={() => { selectAccount(acc); showAccountMenu = false; }}
          title={acc.email}
        >
          <div class="account-menu-avatar">
            {#if selected?.id === acc.id && accountProfile?.picture}
              <img
                src={accountProfile.picture}
                alt=""
                referrerpolicy="no-referrer"
                onerror={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
              />
            {:else}
              <span>{getInitials(acc.email)}</span>
            {/if}
          </div>
          <div class="account-menu-copy">
            <strong>{selected?.id === acc.id && accountProfile?.name ? accountProfile.name : acc.email}</strong>
            <small>{acc.email}</small>
          </div>
          {#if selected?.id === acc.id}
            <span class="material-symbols-outlined account-check" aria-label="Active account">check</span>
          {/if}
        </button>
      {/each}
      <div class="menu-divider"></div>
      <button
        type="button"
        class="account-menu-action"
        role="menuitem"
        onclick={() => { showAccountMenu = false; navigate('onboarding'); }}
      >
        <span class="material-symbols-outlined">person_add</span>
        <span>Add another Google account</span>
      </button>
      <button
        type="button"
        class="account-menu-action"
        role="menuitem"
        onclick={() => { showAccountMenu = false; showSettingsModal = true; }}
      >
        <span class="material-symbols-outlined">settings</span>
        <span>Settings & preferences</span>
      </button>
    </div>
  {/if}

  <!-- Capture in Progress Banner with Cancel -->
  {#if captureProgress}
    <div class="capture-banner">
      <div class="banner-content">
        <span class="material-symbols-outlined" style="font-size: 18px;">sync</span>
        <span>{captureProgress.message}</span>
        {#if captureProgress.percent !== undefined && captureProgress.percent !== null}
          <div class="banner-progress-bar">
            <div class="banner-progress-fill" style="width: {captureProgress.percent}%"></div>
          </div>
          <span>{captureProgress.percent}%</span>
        {/if}
      </div>
      <button class="banner-cancel-btn" onclick={cancelCapture}>Cancel</button>
    </div>
  {/if}

  <!-- Toast Notification Banner -->
  {#if toastMessage}
    <div class="toast-banner">
      <div class="toast-content">
        <span class="material-symbols-outlined toast-icon">info</span>
        <span>{toastMessage}</span>
      </div>
      <button class="toast-close-btn" onclick={() => { toastMessage = ''; }} aria-label="Dismiss notification">
        <span class="material-symbols-outlined" style="font-size: 18px;">close</span>
      </button>
    </div>
  {/if}

  <!-- Body Content -->
  <div class="content-body">
    <!-- Google Contacts Sidebar -->
    <aside class="sidebar" class:collapsed={sidebarCollapsed}>
      <!-- Create / Capture Button -->
      <div class="create-btn-container">
        <button class="capture-btn" onclick={captureNow} disabled={busy || !selected}>
          <span class="material-symbols-outlined plus-icon">add</span>
          <span>Capture now</span>
        </button>
      </div>

      <!-- Main Navigation Items -->
      <div class="sidebar-section">
        <button
          class="nav-item"
          class:active={pageView === 'contacts' && selectedGroup === null && !detail}
          onclick={() => { selectLabelFilter(null); navigate('contacts'); }}
        >
          <span class="material-symbols-outlined nav-icon icon-filled">person</span>
          <span class="nav-label">Contacts</span>
          {#if capture}
            <span class="nav-count">{capture.contact_count}</span>
          {/if}
        </button>

        <button
          class="nav-item"
          class:active={pageView === 'changes'}
          onclick={() => navigate('changes')}
        >
          <span class="material-symbols-outlined nav-icon">history</span>
          <span class="nav-label">Changes</span>
          {#if changes.length > 0}
            <span class="nav-count">{changes.length}</span>
          {/if}
        </button>
      </div>

      <!-- Fix and Manage / Archive Section -->
      <div class="sidebar-section">
        <div class="sidebar-section-header">Fix and manage</div>
        <button class="nav-item" onclick={importCsv} disabled={busy || !selected}>
          <span class="material-symbols-outlined nav-icon">upload</span>
          <span class="nav-label">Import CSV</span>
        </button>
        <button class="nav-item" onclick={() => exportSelected('csv')}>
          <span class="material-symbols-outlined nav-icon">download</span>
          <span class="nav-label">Export CSV</span>
        </button>
        <button class="nav-item" onclick={backupSelected}>
          <span class="material-symbols-outlined nav-icon">archive</span>
          <span class="nav-label">Backup archive</span>
        </button>
        <button class="nav-item" onclick={restoreLocal}>
          <span class="material-symbols-outlined nav-icon">unarchive</span>
          <span class="nav-label">Restore archive</span>
        </button>
      </div>

      <!-- Labels Section (Per-label view matching Screenshot 3) -->
      <div class="sidebar-section">
        <div class="sidebar-section-header">
          <span>Labels</span>
          <button class="section-add-btn" title="Labels list">
            <span class="material-symbols-outlined" style="font-size: 18px;">label</span>
          </button>
        </div>

        {#each groups as group}
          <button
            class="nav-item"
            class:active={pageView === 'contacts' && selectedGroup === group.resource_name}
            onclick={() => { selectLabelFilter(group.resource_name); navigate('contacts'); }}
            title={group.name}
          >
            <span class="material-symbols-outlined nav-icon" class:icon-filled={selectedGroup === group.resource_name}>
              label
            </span>
            <span class="nav-label">{group.name}</span>
            {#if group.member_count !== null && group.member_count !== undefined}
              <span class="nav-count">{group.member_count}</span>
            {/if}
          </button>
        {/each}

        {#if groups.length === 0 && capture}
          <div style="padding: 6px 16px; font-size: 12px; color: var(--google-text-secondary);">
            No labels in snapshot
          </div>
        {/if}
      </div>

    </aside>

    <!-- Main View Workspace -->
    <main class="main-area">
      {#if pageView === 'contacts'}
        {#if detail}
          <!-- Pixel-Perfect Contact Detail View (Screenshot 2) -->
          <div class="detail-view">
            <!-- Detail Top Navigation -->
            <div class="detail-top-nav">
              <button class="icon-btn" onclick={() => detail = undefined} title="Back to list">
                <span class="material-symbols-outlined">arrow_back</span>
              </button>
              <div class="detail-nav-actions">
                {#if isFavourite(detail)}
                  <span class="star-indicator" title="Starred contact" style="margin-right: 4px;">
                    <span class="material-symbols-outlined icon-filled" style="color: var(--favorite); font-size: 22px;">star</span>
                  </span>
                {/if}
                <button class="edit-btn" title="Snapshot version">
                  <span class="material-symbols-outlined" style="font-size: 16px;">history</span>
                  <span>Version #{detail.version}</span>
                </button>
                <button class="icon-btn" onclick={() => showRawDataModal = true} title="View raw contact data">
                  <span class="material-symbols-outlined">data_object</span>
                </button>
              </div>
            </div>

            <!-- Detail Hero Avatar & Names -->
            <div class="detail-hero">
              <div class="hero-avatar">
                {#if getAvatarSource(detail, media)}
                  <img
                    src={getAvatarSource(detail, media)}
                    alt={getDisplayName(detail)}
                    referrerpolicy="no-referrer"
                    onerror={(e) => { (e.currentTarget as HTMLElement).classList.add('avatar-img-failed'); }}
                    onload={(e) => { (e.currentTarget as HTMLElement).classList.remove('avatar-img-failed'); }}
                  />
                {/if}
                <span>{getInitials(getDisplayName(detail))}</span>
              </div>
              <div class="hero-info">
                <h1 class="hero-name">{getDisplayName(detail)}</h1>
                {#if getNickname(detail.payload)}
                  <span class="hero-nickname">{getNickname(detail.payload)}</span>
                {/if}
              </div>
            </div>

            <!-- Action Circles Row (Communication Actions) -->
            {#if getPrimaryEmail(detail.payload) || getPrimaryPhone(detail.payload) || getPrimaryAddress(detail.payload)}
              <div class="hero-action-buttons">
                {#if getPrimaryEmail(detail.payload)}
                  <div class="action-circle-group">
                    <a
                      href="mailto:{getPrimaryEmail(detail.payload)}"
                      class="action-circle-btn"
                      title="Send email to {getPrimaryEmail(detail.payload)}"
                    >
                      <span class="material-symbols-outlined">mail</span>
                    </a>
                    <span class="action-circle-label">Email</span>
                  </div>
                {/if}
                {#if getPrimaryPhone(detail.payload)}
                  <div class="action-circle-group">
                    <a
                      href="tel:{getPrimaryPhone(detail.payload)}"
                      class="action-circle-btn"
                      title="Call {getPrimaryPhone(detail.payload)}"
                    >
                      <span class="material-symbols-outlined">call</span>
                    </a>
                    <span class="action-circle-label">Call</span>
                  </div>
                {/if}
                {#if getPrimaryAddress(detail.payload)}
                  <div class="action-circle-group">
                    <button
                      class="action-circle-btn"
                      title="Open address in Google Maps"
                      onclick={() => api.openExternalUrl(`https://maps.google.com/?q=${encodeURIComponent(getPrimaryAddress(detail!.payload))}`)}
                    >
                      <span class="material-symbols-outlined">location_on</span>
                    </button>
                    <span class="action-circle-label">Maps</span>
                  </div>
                {/if}
              </div>
            {/if}

            <!-- Label Membership Chips Row -->
            {#if getContactLabels(detail.payload).length > 0}
              <div class="detail-chips-row">
                {#each getContactLabels(detail.payload) as label}
                  <div class="detail-chip">
                    <span class="material-symbols-outlined">label</span>
                    <span>{label}</span>
                  </div>
                {/each}
              </div>
            {/if}

            <!-- Structured Details Cards Grid -->
            <div class="detail-cards-grid">
              <!-- Left Card: Contact Details with In-line Labels and Copy Pop-ups -->
              <div class="detail-card">
                <h2 class="card-title">Contact details</h2>
                <div class="field-list">
                  {#each getAllEmails(detail.payload) as email, idx}
                    <div class="field-item">
                      <span class="material-symbols-outlined field-icon">mail</span>
                      <div class="field-content">
                        <a href="mailto:{email.value}" class="field-value">{email.value}</a>
                        <span class="field-meta">· {email.type}</span>
                      </div>
                      <div class="field-actions">
                        <button
                          class="field-copy-btn"
                          title="Copy email"
                          onclick={() => copyFieldValue(`email-${idx}`, email.value)}
                        >
                          <span class="material-symbols-outlined">content_copy</span>
                        </button>
                        {#if copiedFieldKey === `email-${idx}`}
                          <div class="copy-popup-badge">Copied!</div>
                        {/if}
                      </div>
                    </div>
                  {/each}

                  {#each getAllPhones(detail.payload) as phone, idx}
                    <div class="field-item">
                      <span class="material-symbols-outlined field-icon">call</span>
                      <div class="field-content">
                        <a href="tel:{phone.value}" class="field-value">{phone.value}</a>
                        <span class="field-meta">· {phone.type}</span>
                      </div>
                      <div class="field-actions">
                        <button
                          class="field-copy-btn"
                          title="Copy phone"
                          onclick={() => copyFieldValue(`phone-${idx}`, phone.value)}
                        >
                          <span class="material-symbols-outlined">content_copy</span>
                        </button>
                        {#if copiedFieldKey === `phone-${idx}`}
                          <div class="copy-popup-badge">Copied!</div>
                        {/if}
                      </div>
                    </div>
                  {/each}

                  {#if getBirthday(detail.payload)}
                    <div class="field-item">
                      <span class="material-symbols-outlined field-icon">cake</span>
                      <div class="field-content">
                        <span class="field-value text-plain">{getBirthday(detail.payload)}</span>
                        <span class="field-meta">· Birthday</span>
                      </div>
                      <div class="field-actions">
                        <button
                          class="field-copy-btn"
                          title="Copy birthday"
                          onclick={() => copyFieldValue('birthday', getBirthday(detail!.payload))}
                        >
                          <span class="material-symbols-outlined">content_copy</span>
                        </button>
                        {#if copiedFieldKey === 'birthday'}
                          <div class="copy-popup-badge">Copied!</div>
                        {/if}
                      </div>
                    </div>
                  {/if}

                  {#if getOrganization(detail.payload).org || getOrganization(detail.payload).title}
                    {@const orgInfo = [getOrganization(detail.payload).title, getOrganization(detail.payload).org].filter(Boolean).join(' at ')}
                    <div class="field-item">
                      <span class="material-symbols-outlined field-icon">domain</span>
                      <div class="field-content">
                        <span class="field-value text-plain">{orgInfo}</span>
                        <span class="field-meta">· Job info</span>
                      </div>
                      <div class="field-actions">
                        <button
                          class="field-copy-btn"
                          title="Copy job info"
                          onclick={() => copyFieldValue('org', orgInfo)}
                        >
                          <span class="material-symbols-outlined">content_copy</span>
                        </button>
                        {#if copiedFieldKey === 'org'}
                          <div class="copy-popup-badge">Copied!</div>
                        {/if}
                      </div>
                    </div>
                  {/if}

                  {#if getPrimaryAddress(detail.payload)}
                    {@const addr = getPrimaryAddress(detail.payload)}
                    <div class="field-item">
                      <span class="material-symbols-outlined field-icon">location_on</span>
                      <div class="field-content">
                        <button
                          class="field-value field-link"
                          title="Open address in Google Maps"
                          onclick={() => api.openExternalUrl(`https://maps.google.com/?q=${encodeURIComponent(addr)}`)}
                        >
                          {addr}
                        </button>
                        <span class="field-meta">· Address</span>
                      </div>
                      <div class="field-actions">
                        <button
                          class="field-copy-btn"
                          title="Copy address"
                          onclick={() => copyFieldValue('address', addr)}
                        >
                          <span class="material-symbols-outlined">content_copy</span>
                        </button>
                        {#if copiedFieldKey === 'address'}
                          <div class="copy-popup-badge">Copied!</div>
                        {/if}
                      </div>
                    </div>
                  {/if}

                  {#if getNotes(detail.payload)}
                    {@const notes = getNotes(detail.payload)}
                    <div class="field-item">
                      <span class="material-symbols-outlined field-icon">notes</span>
                      <div class="field-content">
                        <span class="field-value text-plain" style="white-space: pre-wrap;">{notes}</span>
                        <span class="field-meta">· Notes</span>
                      </div>
                      <div class="field-actions">
                        <button
                          class="field-copy-btn"
                          title="Copy notes"
                          onclick={() => copyFieldValue('notes', notes)}
                        >
                          <span class="material-symbols-outlined">content_copy</span>
                        </button>
                        {#if copiedFieldKey === 'notes'}
                          <div class="copy-popup-badge">Copied!</div>
                        {/if}
                      </div>
                    </div>
                  {/if}
                </div>
              </div>

              <!-- Right Card: Capture History / Timeline -->
              <div class="detail-card">
                <h2 class="card-title">Archive History</h2>
                <div class="history-timeline">
                  <div class="history-item">
                    <div class="history-item-left">
                      <span class="material-symbols-outlined" style="color: var(--google-blue); font-size: 18px;">verified</span>
                      <span>Snapshot #{capture?.sequence}</span>
                    </div>
                    <span class="history-date">{formatCaptureTime(capture?.committed_at)}</span>
                  </div>
                  <div style="font-size: 12px; color: var(--google-text-secondary); margin-top: 12px; line-height: 1.5;">
                    Captured resource: <code>{detail.resource_name}</code>
                    <br />
                    Schema revision: #{detail.version}
                  </div>
                </div>
              </div>
            </div>
          </div>
        {:else}
          <!-- Main Contacts Table List View (Screenshots 1 & 3) -->
          <div class="view-header">
            <h1 class="view-title">
              {#if activeGroup}
                {activeGroup.name} ({activeGroup.member_count ?? contacts.length})
              {:else}
                Contacts ({capture ? capture.contact_count : contacts.length})
              {/if}
            </h1>
            <div class="view-header-actions">
              <button class="icon-btn" onclick={() => window.print()} title="Print">
                <span class="material-symbols-outlined">print</span>
              </button>
              <button class="icon-btn" onclick={() => exportSelected('csv')} title="Export">
                <span class="material-symbols-outlined">upload</span>
              </button>
              <button
                class="icon-btn"
                class:active={showColCustomizer}
                onclick={() => showColCustomizer = true}
                title="Change column order and visibility"
              >
                <span class="material-symbols-outlined">more_vert</span>
              </button>
            </div>
          </div>

          <div class="table-scroll-container">
            <table class="contacts-table">
              <thead>
                <tr>
                  {#each activeColKeys as colKey}
                    {@const colDef = ALL_COLUMNS.find((c) => c.key === colKey)!}
                    <th style="width: {colWidths[colKey]}px;">
                      <div class="th-content">
                        <span>{colDef.label}</span>
                        <div
                          class="col-resizer"
                          class:resizing={resizingCol === colKey}
                          onmousedown={(e) => onResizeStart(colKey, e)}
                          role="presentation"
                          aria-hidden="true"
                          title="Drag to resize"
                        ></div>
                      </div>
                    </th>
                  {/each}
                </tr>
              </thead>
              <tbody>
                {#if favouriteContacts.length > 0}
                  <tr class="table-section-row">
                    <td colspan={activeColKeys.length}>
                      <div class="section-title-wrap">
                        <span class="material-symbols-outlined icon-filled star-section-icon">star</span>
                        <span>Favourites ({favouriteContacts.length})</span>
                      </div>
                    </td>
                  </tr>
                  {#each favouriteContacts as contact (contact.resource_name)}
                    <tr class="contact-row" onclick={() => selectContact(contact)}>
                      {#each activeColKeys as colKey}
                        {#if colKey === 'name'}
                          <td>
                            <div class="name-cell-content">
                              <span class="star-indicator" title="Starred contact">
                                <span class="material-symbols-outlined icon-filled" style="color: var(--favorite); font-size: 18px;">star</span>
                              </span>
                              <div class="avatar-circle" style="background-color: {getAvatarColor(getDisplayName(contact))}; color: #ffffff;">
                                {#if getAvatarSource(contact)}
                                  <img
                                    src={getAvatarSource(contact)}
                                    alt={getDisplayName(contact)}
                                    class="avatar-img"
                                    loading="lazy"
                                    referrerpolicy="no-referrer"
                                    onerror={(e) => { (e.currentTarget as HTMLElement).classList.add('avatar-img-failed'); }}
                                    onload={(e) => { (e.currentTarget as HTMLElement).classList.remove('avatar-img-failed'); }}
                                  />
                                {/if}
                                <span>{getInitials(getDisplayName(contact))}</span>
                              </div>
                              <span class="name-text">{getDisplayName(contact)}</span>
                            </div>
                          </td>
                        {:else if colKey === 'email'}
                          <td>{getPrimaryEmail(contact.payload)}</td>
                        {:else if colKey === 'phone'}
                          <td>{getPrimaryPhone(contact.payload)}</td>
                        {:else if colKey === 'birthday'}
                          <td>{getBirthday(contact.payload)}</td>
                        {:else if colKey === 'labels'}
                          <td>
                            <div class="labels-container">
                              {#each getContactLabels(contact.payload) as lbl}
                                <span class="label-chip">{lbl}</span>
                              {/each}
                            </div>
                          </td>
                        {:else if colKey === 'org'}
                          <td>{getOrganization(contact.payload).org}</td>
                        {:else if colKey === 'title'}
                          <td>{getOrganization(contact.payload).title}</td>
                        {:else if colKey === 'address'}
                          <td>{getPrimaryAddress(contact.payload)}</td>
                        {:else if colKey === 'notes'}
                          <td>{getNotes(contact.payload)}</td>
                        {/if}
                      {/each}
                    </tr>
                  {/each}
                {/if}

                {#if otherContacts.length > 0}
                  <tr class="table-section-row">
                    <td colspan={activeColKeys.length}>
                      <span>Contacts ({otherContacts.length})</span>
                    </td>
                  </tr>
                  {#each otherContacts as contact (contact.resource_name)}
                    <tr class="contact-row" onclick={() => selectContact(contact)}>
                      {#each activeColKeys as colKey}
                        {#if colKey === 'name'}
                          <td>
                            <div class="name-cell-content">
                              <div class="avatar-circle" style="background-color: {getAvatarColor(getDisplayName(contact))}; color: #ffffff;">
                                {#if getAvatarSource(contact)}
                                  <img
                                    src={getAvatarSource(contact)}
                                    alt={getDisplayName(contact)}
                                    class="avatar-img"
                                    loading="lazy"
                                    referrerpolicy="no-referrer"
                                    onerror={(e) => { (e.currentTarget as HTMLElement).classList.add('avatar-img-failed'); }}
                                    onload={(e) => { (e.currentTarget as HTMLElement).classList.remove('avatar-img-failed'); }}
                                  />
                                {/if}
                                <span>{getInitials(getDisplayName(contact))}</span>
                              </div>
                              <span class="name-text">{getDisplayName(contact)}</span>
                            </div>
                          </td>
                        {:else if colKey === 'email'}
                          <td>{getPrimaryEmail(contact.payload)}</td>
                        {:else if colKey === 'phone'}
                          <td>{getPrimaryPhone(contact.payload)}</td>
                        {:else if colKey === 'birthday'}
                          <td>{getBirthday(contact.payload)}</td>
                        {:else if colKey === 'labels'}
                          <td>
                            <div class="labels-container">
                              {#each getContactLabels(contact.payload) as lbl}
                                <span class="label-chip">{lbl}</span>
                              {/each}
                            </div>
                          </td>
                        {:else if colKey === 'org'}
                          <td>{getOrganization(contact.payload).org}</td>
                        {:else if colKey === 'title'}
                          <td>{getOrganization(contact.payload).title}</td>
                        {:else if colKey === 'address'}
                          <td>{getPrimaryAddress(contact.payload)}</td>
                        {:else if colKey === 'notes'}
                          <td>{getNotes(contact.payload)}</td>
                        {/if}
                      {/each}
                    </tr>
                  {/each}
                {/if}

                {#if contacts.length === 0}
                  <tr>
                    <td colspan={activeColKeys.length}>
                      <div class="empty-state">
                        {#if search.trim()}
                          <span class="material-symbols-outlined">search_off</span>
                          <h3 class="empty-state-title">No matching contacts</h3>
                          <p class="empty-state-desc">No contacts matching "{search.trim()}" were found.</p>
                          <button class="action-btn" onclick={clearSearch} style="margin-top: 12px;">Clear search</button>
                        {:else if selectedGroup}
                          <span class="material-symbols-outlined">label_off</span>
                          <h3 class="empty-state-title">No contacts in this label</h3>
                          <p class="empty-state-desc">There are no contacts tagged with this label in snapshot #{capture?.sequence}.</p>
                        {:else}
                          <span class="material-symbols-outlined">people</span>
                          <h3 class="empty-state-title">No contacts found</h3>
                          <p class="empty-state-desc">No contacts available in this snapshot.</p>
                        {/if}
                      </div>
                    </td>
                  </tr>
                {/if}
              </tbody>
            </table>
          </div>
        {/if}
      {:else if pageView === 'changes'}
        <!-- Changes & Snapshot Comparison View -->
        <div class="view-header">
          <h1 class="view-title">
            {#if compareBaseSeq && compareTargetSeq && compareBaseSeq !== compareTargetSeq}
              Snapshot Comparison: #{compareBaseSeq} → #{compareTargetSeq}
            {:else}
              Changes in Snapshot #{capture?.sequence}
            {/if}
          </h1>
        </div>

        <div class="changes-container">
          {#if captures.length > 1}
            <div class="comparison-bar">
              <div class="compare-group">
                <span class="compare-label">Base Snapshot:</span>
                <select
                  class="compare-select"
                  bind:value={compareBaseSeq}
                  onchange={refreshChangesComparison}
                >
                  {#each captures as cap}
                    <option value={cap.sequence}>
                      Snapshot #{cap.sequence} ({formatCaptureTime(cap.committed_at)})
                    </option>
                  {/each}
                </select>
              </div>

              <span class="material-symbols-outlined compare-arrow">arrow_forward</span>

              <div class="compare-group">
                <span class="compare-label">Compare With:</span>
                <select
                  class="compare-select"
                  bind:value={compareTargetSeq}
                  onchange={refreshChangesComparison}
                >
                  {#each captures as cap}
                    <option value={cap.sequence}>
                      Snapshot #{cap.sequence} ({formatCaptureTime(cap.committed_at)})
                    </option>
                  {/each}
                </select>
              </div>

              <div style="display: flex; gap: 8px; margin-left: auto;">
                <button
                  class="compare-quick-btn"
                  onclick={() => {
                    if (capture) {
                      const curSeq = capture.sequence;
                      compareTargetSeq = curSeq;
                      const prior = captures.find((c) => c.sequence < curSeq);
                      compareBaseSeq = prior ? prior.sequence : 1;
                      refreshChangesComparison();
                    }
                  }}
                >
                  Compare with previous
                </button>
                <button
                  class="compare-quick-btn"
                  onclick={() => {
                    if (captures.length >= 2) {
                      compareBaseSeq = captures[captures.length - 1].sequence;
                      compareTargetSeq = captures[0].sequence;
                      refreshChangesComparison();
                    }
                  }}
                >
                  Earliest vs Latest
                </button>
              </div>
            </div>
          {/if}

          {#each changes as change}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="change-card"
              class:selected={chosenChange === change}
              onclick={() => chosenChange = chosenChange === change ? undefined : change}
            >
              <div class="change-header">
                <div>
                  <span class="change-tag {change.kind}">{change.kind}</span>
                  <div style="font-weight: 500; font-size: 15px; margin-top: 2px;">
                    {change.after ? getDisplayName({ resource_name: change.resource_name, display_name: '', payload: change.after, version: change.version }) : (change.before ? getDisplayName({ resource_name: change.resource_name, display_name: '', payload: change.before, version: change.version }) : change.resource_name)}
                  </div>
                  <div style="font-size: 12px; color: var(--google-text-secondary); margin-top: 2px;">
                    Revision #{change.version} · Resource: <code>{change.resource_name}</code>
                  </div>
                </div>
                <button class="icon-btn" title="Inspect diff" onclick={(e) => { e.stopPropagation(); chosenChange = chosenChange === change ? undefined : change; }}>
                  <span class="material-symbols-outlined">{chosenChange === change ? 'expand_less' : 'expand_more'}</span>
                </button>
              </div>

              {#if chosenChange === change}
                <div class="diff-details-panel">
                  <div class="diff-grid">
                    <div>
                      <div class="diff-column-header">
                        Base Snapshot ({change.before ? 'Previous Data' : 'Not Present'})
                      </div>
                      <pre class="diff-pre">{change.before ? JSON.stringify(change.before, null, 2) : '(none)'}</pre>
                    </div>
                    <div>
                      <div class="diff-column-header">
                        Target Snapshot ({change.after ? 'Updated Data' : 'Removed'})
                      </div>
                      <pre class="diff-pre">{change.after ? JSON.stringify(change.after, null, 2) : '(deleted)'}</pre>
                    </div>
                  </div>
                </div>
              {/if}
            </div>
          {/each}

          {#if changes.length === 0}
            <div class="empty-state">
              <span class="material-symbols-outlined">history</span>
              <h3 class="empty-state-title">No changes recorded</h3>
              <p class="empty-state-desc">
                {#if compareBaseSeq && compareTargetSeq && compareBaseSeq === compareTargetSeq}
                  Base snapshot and Target snapshot are identical. Select two different snapshots to compare.
                {:else}
                  No contacts were added, modified, or removed between these snapshots.
                {/if}
              </p>
            </div>
          {/if}
        </div>
      {:else if pageView === 'onboarding'}
        <!-- Onboarding / Google Connect View -->
        <div class="empty-state" style="padding-top: 80px;">
          <div class="brand-icon-circle" style="width: 56px; height: 56px; margin-bottom: 20px;">
            <span class="material-symbols-outlined icon-filled" style="font-size: 32px;">person</span>
          </div>
          <h2 style="font-size: 24px; font-weight: 400; margin-bottom: 8px;">Connect your Google Account</h2>
          <p class="empty-state-desc" style="margin-bottom: 28px;">
            Provide your Google Cloud OAuth Client credentials to begin archiving your contact history.
          </p>

          <div style="width: 100%; max-width: 440px; display: flex; flex-direction: column; gap: 16px; text-align: left;">
            <div>
              <label for="client-id" style="font-size: 12px; font-weight: 500; color: var(--google-text-secondary); display: block; margin-bottom: 6px;">Client ID</label>
              <input
                id="client-id"
                type="text"
                bind:value={clientId}
                placeholder="apps.googleusercontent.com"
                style="width: 100%; height: 42px; padding: 0 14px; border: 1px solid var(--google-border); border-radius: 8px; font-family: inherit; font-size: 14px;"
              />
            </div>
            <div>
              <label for="client-secret" style="font-size: 12px; font-weight: 500; color: var(--google-text-secondary); display: block; margin-bottom: 6px;">Client Secret</label>
              <input
                id="client-secret"
                type="password"
                bind:value={clientSecret}
                placeholder="Client secret"
                style="width: 100%; height: 42px; padding: 0 14px; border: 1px solid var(--google-border); border-radius: 8px; font-family: inherit; font-size: 14px;"
              />
            </div>
            {#if error}
              <div style="color: var(--google-danger); font-size: 13px;">{error}</div>
            {/if}
            <button class="btn-primary" onclick={connectNewAccount} disabled={busy || !clientId || !clientSecret} style="height: 44px; margin-top: 8px;">
              {busy ? 'Connecting...' : 'Connect Google'}
            </button>
          </div>
        </div>
      {/if}
    </main>
  </div>

  <!-- Column Customizer Modal -->
  {#if showColCustomizer}
    <div
      class="modal-overlay"
      onclick={(e) => { if (e.target === e.currentTarget) showColCustomizer = false; }}
      onkeydown={(e) => { if (e.key === 'Escape') showColCustomizer = false; }}
      role="dialog"
      aria-modal="true"
      use:focusDialog
      tabindex="-1"
    >
      <div class="modal-dialog" role="document">
        <div class="modal-header">
          <h2 class="modal-title">Customize Columns</h2>
          <button class="icon-btn" onclick={() => showColCustomizer = false}>
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <div class="modal-body">
          <p style="font-size: 13px; color: var(--google-text-secondary); margin-bottom: 16px;">
            Choose which columns are displayed in the contacts table and reorder them using the arrow buttons.
          </p>

          <div class="customizer-section-title">Displayed columns ({activeColKeys.length})</div>
          <div class="col-options-list">
            {#each activeColKeys as colKey, index}
              {@const colDef = ALL_COLUMNS.find((c) => c.key === colKey)!}
              <div class="col-option-row">
                <div class="col-option-left">
                  <label class="checkbox-label" style="margin: 0;">
                    <input
                      type="checkbox"
                      checked={true}
                      disabled={colKey === 'name'}
                      onchange={() => toggleColumn(colKey)}
                    />
                    <span style="font-weight: {colKey === 'name' ? '600' : '400'};">{colDef.label}</span>
                  </label>
                  {#if colKey === 'name'}
                    <span style="font-size: 11px; color: var(--google-text-secondary); background: var(--google-blue-surface); color: var(--google-blue); padding: 2px 6px; border-radius: 4px;">Primary</span>
                  {/if}
                </div>
                <div class="col-actions">
                  <span style="font-size: 12px; color: var(--google-text-secondary); margin-right: 8px;">
                    {colWidths[colKey]}px
                  </span>
                  <button
                    class="col-order-btn"
                    title="Move up"
                    disabled={index <= 1}
                    onclick={() => moveColumn(colKey, -1)}
                  >
                    <span class="material-symbols-outlined">arrow_upward</span>
                  </button>
                  <button
                    class="col-order-btn"
                    title="Move down"
                    disabled={index === 0 || index >= activeColKeys.length - 1}
                    onclick={() => moveColumn(colKey, 1)}
                  >
                    <span class="material-symbols-outlined">arrow_downward</span>
                  </button>
                </div>
              </div>
            {/each}
          </div>

          {#if hiddenCols.length > 0}
            <div class="customizer-section-title">Hidden columns ({hiddenCols.length})</div>
            <div class="col-options-list">
              {#each hiddenCols as col}
                <div class="col-option-row" onclick={() => toggleColumn(col.key)} role="presentation">
                  <div class="col-option-left">
                    <label class="checkbox-label" style="margin: 0;">
                      <input
                        type="checkbox"
                        checked={false}
                        onchange={() => toggleColumn(col.key)}
                      />
                      <span>{col.label}</span>
                    </label>
                  </div>
                  <div class="col-actions">
                    <span style="font-size: 12px; color: var(--google-text-secondary); margin-right: 8px;">
                      {colWidths[col.key]}px
                    </span>
                    <button class="col-order-btn" title="Add column" onclick={(e) => { e.stopPropagation(); toggleColumn(col.key); }}>
                      <span class="material-symbols-outlined">add</span>
                    </button>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick={resetColumns}>Reset to default</button>
          <button class="btn-primary" onclick={() => showColCustomizer = false}>Done</button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Snapshot Picker Modal / Dropdown -->
  {#if showSnapshotDropdown}
    <div
      class="modal-overlay"
      onclick={(e) => { if (e.target === e.currentTarget) showSnapshotDropdown = false; }}
      onkeydown={(e) => { if (e.key === 'Escape') showSnapshotDropdown = false; }}
      role="dialog"
      aria-modal="true"
      use:focusDialog
      tabindex="-1"
    >
      <div class="modal-dialog" role="document" style="max-width: 460px;">
        <div class="modal-header">
          <h2 class="modal-title">Select Archive Snapshot</h2>
          <button class="icon-btn" onclick={() => showSnapshotDropdown = false}>
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <div class="modal-body">
          <div style="display: flex; flex-direction: column; gap: 8px;">
            {#each captures as cap}
              <button
                class="col-option-row"
                style="border: none; width: 100%; text-align: left;"
                class:active={capture?.sequence === cap.sequence}
                onclick={() => changeCapture(cap.sequence)}
              >
                <div>
                  <div style="font-weight: 500; color: var(--google-text);">Snapshot #{cap.sequence}</div>
                  <div style="font-size: 12px; color: var(--google-text-secondary);">{formatCaptureTime(cap.committed_at)}</div>
                </div>
                <span style="font-size: 12px; font-weight: 600; color: var(--google-blue);">{cap.contact_count} contacts</span>
              </button>
            {/each}
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Settings keeps personal preferences, account controls, and About together. -->
  {#if showSettingsModal}
    <div class="modal-overlay" use:focusDialog role="dialog" aria-modal="true" aria-labelledby="settings-title" tabindex="-1"
      onclick={(e) => { if (e.target === e.currentTarget) showSettingsModal = false; }}
      onkeydown={(e) => { if (e.key === 'Escape') showSettingsModal = false; }}>
      <div class="modal-dialog settings-dialog" role="document">
        <div class="modal-header">
          <h2 class="modal-title" id="settings-title">Settings</h2>
          <button class="icon-btn" aria-label="Close settings" onclick={() => showSettingsModal = false}><span class="material-symbols-outlined">close</span></button>
        </div>
        <nav class="settings-tabs" aria-label="Settings sections">
          <button aria-pressed={settingsTab === 'preferences'} onclick={() => settingsTab = 'preferences'}>Preferences</button>
          <button aria-pressed={settingsTab === 'about'} onclick={() => settingsTab = 'about'}>About</button>
        </nav>
        <div class="modal-body">
          {#if settingsTab === 'preferences'}
            {#if settingsError}<p class="settings-error" role="alert">{settingsError}</p>{/if}
            <section class="settings-section" aria-labelledby="appearance-title">
              <h3 id="appearance-title">Appearance</h3>
              <p>Choose a theme. System follows your device’s appearance automatically.</p>
              <div class="theme-options" role="group" aria-label="Color theme">
                {#each [{value: 'system', label: 'System', icon: 'desktop_windows'}, {value: 'light', label: 'Light', icon: 'light_mode'}, {value: 'dark', label: 'Dark', icon: 'dark_mode'}] as option}
                  <button aria-pressed={preferences.theme === option.value} onclick={() => updatePreferences({theme: option.value as Preferences['theme']})}><span class="material-symbols-outlined" aria-hidden="true">{option.icon}</span>{option.label}</button>
                {/each}
              </div>
              <label class="setting-row"><span>Contact density<small>Adjust the spacing between contact rows.</small></span>
                <select value={preferences.density} onchange={(e) => updatePreferences({density: e.currentTarget.value as Preferences['density']})}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select>
              </label>
              <label class="setting-row"><span>Reduce motion<small>Minimize animations. Your device’s reduced-motion preference is always respected.</small></span><input type="checkbox" checked={preferences.reduceMotion} onchange={(e) => updatePreferences({reduceMotion: e.currentTarget.checked})} /></label>
              <div class="settings-actions"><button class="btn-secondary" onclick={() => { showSettingsModal = false; showColCustomizer = true; }}>Customize contact columns</button></div>
            </section>
            <section class="settings-section" aria-labelledby="capture-settings-title">
              <h3 id="capture-settings-title">Capture schedule</h3>
              <label class="setting-row"><span>Background capture<small>Windows checks at 09:00 and at sign-in. A snapshot is captured when the last one is at least seven days old. Requires the installed release app.</small></span><input type="checkbox" checked={scheduled} disabled={scheduleBusy || !scheduleReady} onchange={(event) => { event.currentTarget.checked = scheduled; toggleSchedule(); }} /></label>
            </section>
            <section class="settings-section" aria-labelledby="account-settings-title">
              <h3 id="account-settings-title">Active account</h3>
              <p class="settings-account">{selected?.email || 'No account selected'}</p>
              <button class="btn-secondary" style="color: var(--google-danger);" disabled={!selected || busy} onclick={disconnectSelected}>Disconnect account</button>
            </section>
          {:else}
            <section class="settings-section about-copy" aria-labelledby="about-title">
              <div class="about-brand"><img class="brand-logo" src={brandLogo} alt="" /><div><h3 id="about-title">Contact History</h3><p>Version {appVersion}</p></div></div>
              <p>A local archive of your Google contacts, with snapshots that let you revisit details and see what changed over time.</p>
              <p>Browse earlier snapshots, compare revisions, and export contacts or back up an account using the sidebar’s export and archive actions.</p>
              <p>Contact archives are stored on this computer. Connecting and capturing contacts requires access to your Google account.</p>
            </section>
          {/if}
        </div>
        <div class="modal-footer"><span class="settings-note" role="status">{settingsTab === 'preferences' ? preferenceNotice : 'Contact History · Local contact archiving'}</span><button class="btn-primary" onclick={() => showSettingsModal = false}>Done</button></div>
      </div>
    </div>
  {/if}
  <!-- Contact Raw Data Modal -->
  {#if showRawDataModal && detail}
    <div
      class="modal-overlay"
      onclick={(e) => { if (e.target === e.currentTarget) showRawDataModal = false; }}
      onkeydown={(e) => { if (e.key === 'Escape') showRawDataModal = false; }}
      role="dialog"
      aria-modal="true"
      use:focusDialog
      tabindex="-1"
    >
      <div class="modal-dialog" role="document" style="max-width: 680px; width: 90%;">
        <div class="modal-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="material-symbols-outlined" style="color: var(--google-blue);">data_object</span>
            <h2 class="modal-title">Contact Payload: {getDisplayName(detail)}</h2>
          </div>
          <button class="icon-btn" onclick={() => showRawDataModal = false}>
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <div class="modal-body" style="user-select: text; -webkit-user-select: text;">
          <div style="display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap;">
            <button class="btn-secondary" onclick={() => copyFieldValue('modal-raw', JSON.stringify(detail?.payload, null, 2))}>
              <span class="material-symbols-outlined" style="font-size: 16px;">content_copy</span>
              <span>{copiedFieldKey === 'modal-raw' ? 'Copied!' : 'Copy JSON'}</span>
            </button>
            <button class="btn-secondary" onclick={() => downloadContactJson(detail!)}>
              <span class="material-symbols-outlined" style="font-size: 16px;">download</span>
              <span>Download JSON</span>
            </button>
            <button class="btn-secondary" onclick={() => downloadContactVcf(detail!)}>
              <span class="material-symbols-outlined" style="font-size: 16px;">contact_page</span>
              <span>Download vCard</span>
            </button>
          </div>
          <pre class="diff-pre raw-data-pre" style="max-height: 420px; font-size: 12px; background: var(--google-surface); user-select: text; -webkit-user-select: text; cursor: text;">{JSON.stringify(detail.payload, null, 2)}</pre>
        </div>
        <div class="modal-footer">
          <button class="btn-primary" onclick={() => showRawDataModal = false}>Close</button>
        </div>
      </div>
    </div>
  {/if}
</div>
