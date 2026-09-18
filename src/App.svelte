<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import brandLogo from './assets/contact-history.png';
  import { version as appVersion } from '../package.json';
  import { readPreferences, savePreferences, applyPreferences, getEffectiveCountry, formatBirthdayDate, type Preferences, type BirthdayFormat } from './lib/preferences';
  import ToggleSwitch from './lib/ToggleSwitch.svelte';
  import CustomSelect, { type SelectOption } from './lib/CustomSelect.svelte';
  import SnapshotSelect from './lib/SnapshotSelect.svelte';
  import { getCountryOptions, formatPhone } from './lib/phone';
  import { getContactPhotos, type ContactPhotoItem } from './lib/photos';

  let preferences = $state(readPreferences());
  let preferenceNotice = $state('');
  let settingsTab = $state<'preferences' | 'schedule' | 'about'>('preferences');
  let scheduleBusy = $state(false);
  let scheduleReady = $state(false);
  let settingsError = $state('');
  let scheduleConfig = $state<ScheduleConfig>({
    enabled: false,
    interval_days: 7,
    time_of_day: '09:00',
    run_at_logon: true,
    run_daily: true,
  });

  let activeFloatingTooltip = $state<{ text: string; x: number; y: number; pos: 'right' | 'top' } | null>(null);

  function showTooltip(e: MouseEvent | FocusEvent, text: string, pos: 'right' | 'top' = 'right') {
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    if (pos === 'right') {
      const estimatedWidth = text.length * 7 + 24;
      if (rect.right + estimatedWidth + 12 > window.innerWidth) {
        activeFloatingTooltip = {
          text,
          x: rect.left + rect.width / 2,
          y: rect.top - 6,
          pos: 'top',
        };
      } else {
        activeFloatingTooltip = {
          text,
          x: rect.right + 8,
          y: rect.top + rect.height / 2,
          pos: 'right',
        };
      }
    } else {
      activeFloatingTooltip = {
        text,
        x: rect.left + rect.width / 2,
        y: rect.top - 6,
        pos: 'top',
      };
    }
  }

  function hideTooltip() {
    activeFloatingTooltip = null;
  }

  const effectiveCountry = $derived(getEffectiveCountry(preferences));
  const countryOptions: SelectOption[] = getCountryOptions();

  const densityOptions: SelectOption[] = [
    { value: 'comfortable', label: 'Comfortable', sublabel: 'Spacious contact rows' },
    { value: 'compact', label: 'Compact', sublabel: 'Dense table rows' },
  ];

  const birthdayFormatOptions: SelectOption[] = [
    { value: 'day-month-year', label: '15 January 1990', sublabel: 'Day Month Year (Long)' },
    { value: 'month-day-year', label: 'January 15, 1990', sublabel: 'Month Day, Year (US Long)' },
    { value: 'short-day-month', label: '15 Jan 1990', sublabel: 'Day Mon Year (Abbreviated)' },
    { value: 'short-month-day', label: 'Jan 15, 1990', sublabel: 'Mon Day, Year (US Abbreviated)' },
    { value: 'iso', label: '1990-01-15', sublabel: 'YYYY-MM-DD (ISO 8601)' },
    { value: 'eu-numeric', label: '15/01/1990', sublabel: 'DD/MM/YYYY (Day first)' },
    { value: 'us-numeric', label: '01/15/1990', sublabel: 'MM/DD/YYYY (Month first)' },
  ];

  const sortFieldOptions: SelectOption[] = [
    { value: 'first', label: 'First name', sublabel: 'Sort by given name' },
    { value: 'last', label: 'Last name', sublabel: 'Sort by family name' },
  ];

  const sortDirectionOptions: SelectOption[] = [
    { value: 'asc', label: 'Ascending (A → Z)' },
    { value: 'desc', label: 'Descending (Z → A)' },
  ];

  const intervalOptions: SelectOption[] = [
    { value: 1, label: 'Every 1 day (Daily)', sublabel: 'Snapshot taken every day' },
    { value: 2, label: 'Every 2 days', sublabel: 'Snapshot taken every 48h' },
    { value: 3, label: 'Every 3 days', sublabel: 'Twice a week' },
    { value: 7, label: 'Every 7 days (Weekly)', sublabel: 'Recommended default' },
    { value: 14, label: 'Every 14 days (Bi-weekly)', sublabel: 'Every two weeks' },
    { value: 30, label: 'Every 30 days (Monthly)', sublabel: 'Monthly archiving' },
  ];

  const colorScheme = matchMedia('(prefers-color-scheme: dark)');
  function syncSystemTheme() { applyPreferences(preferences); }
  function updatePreferences(patch: Partial<Preferences>) {
    preferences = { ...preferences, ...patch };
    preferenceNotice = savePreferences(preferences) ? '' : 'Applied for this session; storage is unavailable';
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
  import ContactChangeCard from './lib/ContactChangeCard.svelte';
  import FieldChanges from './lib/FieldChanges.svelte';
  import ContactPayloadViewer from './lib/ContactPayloadViewer.svelte';
  import { computeContactDiff, extractDisplayName } from './lib/diff';
  import {
    generateContactCsv,
    generateMultipleContactsCsv,
    generateMultipleContactsVcf,
  } from './lib/export-csv';
  import ContextMenu from './lib/ContextMenu.svelte';
  import { openContextMenu, type ContextMenuItem } from './lib/context-menu.svelte';
  import {
    api,
    listenCaptureProgress,
    listenPhotoExportProgress,
    type Account,
    type Capture,
    type Contact,
    type GroupRow,
    type MediaView,
    type DueStatus,
    type ScheduleConfig,
    type Change,
    type ChangelogEntry,
    type CaptureProgress,
    type ContactHistoryEntry,
    type PhotoExportProgress,
    type PhotoExportResult,
    type PhotoQualityInfo,
  } from './lib/ipc';

  const appWindow = getCurrentWindow();

  type Page = 'contacts' | 'changes' | 'settings' | 'onboarding';
  type ColumnKey = 'name' | 'job' | 'email' | 'phone' | 'birthday' | 'labels' | 'org' | 'title' | 'address' | 'notes';

  interface ColumnDef {
    key: ColumnKey;
    label: string;
    defaultWidth: number;
  }

  const ALL_COLUMNS: ColumnDef[] = [
    { key: 'name', label: 'Name', defaultWidth: 260 },
    { key: 'job', label: 'Job title and company', defaultWidth: 220 },
    { key: 'email', label: 'Email', defaultWidth: 230 },
    { key: 'phone', label: 'Phone number', defaultWidth: 180 },
    { key: 'birthday', label: 'Birthday', defaultWidth: 160 },
    { key: 'labels', label: 'Labels', defaultWidth: 240 },
    { key: 'address', label: 'Address', defaultWidth: 220 },
    { key: 'notes', label: 'Notes', defaultWidth: 200 },
    { key: 'org', label: 'Organization', defaultWidth: 180 },
    { key: 'title', label: 'Job title', defaultWidth: 160 },
  ];

  const AVAILABLE_SELECT_COLUMNS: { key: ColumnKey; label: string }[] = [
    { key: 'job', label: 'Job title and company' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone number' },
    { key: 'address', label: 'Address' },
    { key: 'birthday', label: 'Birthday' },
    { key: 'labels', label: 'Labels' },
    { key: 'notes', label: 'Notes' },
  ];

  // App State
  let accounts: Account[] = $state([]);
  let selected: Account | undefined = $state();
  let accountProfile = $state<{ email: string; name?: string | null; picture?: string | null } | null>(null);
  let sidebarCollapsed = $state(false);
  let sidebarWidth = $state(280);
  let isResizingSidebar = $state(false);
  let captures: Capture[] = $state([]);
  let capture: Capture | undefined = $state();
  let groups: GroupRow[] = $state([]);
  let selectedGroups = $state<string[]>([]);
  const selectedGroup = $derived(selectedGroups[0] ?? null);
  let labelMatchMode = $state<'any' | 'all'>('any');
  let allSnapshotContacts: Contact[] = $state([]);
  let avatarMap: Record<string, string> = $state({});
  let mediaCache = new Map<string, MediaView[]>();
  let searchInputEl: HTMLInputElement | null = $state(null);
  let searchDropdownEl: HTMLDivElement | null = $state(null);
  let searchDropdownOpen = $state(false);
  let searchActiveIndex = $state(0);
  let contacts: Contact[] = $state([]);
  let selectedContactKeys = $state<string[]>([]);
  let showSelectionMenu = $state(false);
  let showDownloadMenu = $state(false);
  const selectedCount = $derived(selectedContactKeys.length);
  const isAllSelected = $derived(contacts.length > 0 && contacts.every((c) => selectedContactKeys.includes(c.resource_name)));
  const isIndeterminate = $derived(selectedContactKeys.length > 0 && !isAllSelected);
  const selectedContactsList = $derived(contacts.filter((c) => selectedContactKeys.includes(c.resource_name)));
  let detail: Contact | undefined = $state();
  let media: MediaView[] = $state([]);
  let due: DueStatus | undefined = $state();
  let scheduled = $state(false);
  let connected = $state(false);
  let changes: Change[] = $state([]);
  let chosenChange: Change | undefined = $state();
  let pageView: Page = $state('onboarding');
  type NavigationEntry = {
    contactHistoryNavigation: true;
    index: number;
    accountId: string | null;
    snapshot: number | null;
    page: Page;
    contact: string | null;
    groups: string[];
    changesTab: 'comparison' | 'changelog';
    compareBase: number | null;
    compareTarget: number | null;
  };
  let navigationIndex = $state(0);
  let navigationMaxIndex = $state(0);
  let navigationReady = false;
  let restoringNavigation = false;
  let navigationQueued = false;
  let navigationRequest = 0;
  const hasData = $derived(Boolean(selected && captures.length > 0));
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
  let showDetailMenu = $state(false);
  let showPhotoQualityMenu = $state(false);
  let photoQualityInfo: PhotoQualityInfo | null = $state(null);
  let photoQualityLoading = $state(false);
  let photoQualityError = $state('');
  let photoQualitySelection: number | null = $state(null);
  let photoDownloadBusy = $state(false);
  let photoQualityRequest = 0;
  let showStickyName = $state(false);
  let isScrolled = $state(false);
  let detailViewEl = $state<HTMLElement | null>(null);
  let topNavEl = $state<HTMLElement | null>(null);
  let heroAvatarEl = $state<HTMLElement | null>(null);
  let showPhotosModal = $state(false);
  let photoInfoTooltip: { text: string; x: number; y: number } | null = $state(null);
  let selectedPhotoUrl: string | null = $state(null);
  let showPhotoExportModal = $state(false);
  let photoExportFormat = $state<'folder' | 'zip'>('folder');
  let photoExportBusy = $state(false);
  let photoExportProgress = $state<PhotoExportProgress | null>(null);
  let photoExportResult = $state<PhotoExportResult | null>(null);
  let photoExportError = $state('');
  let compareBaseSeq: number | null = $state(null);
  let compareTargetSeq: number | null = $state(null);
  let changesTab = $state<'comparison' | 'changelog'>('comparison');
  let comparisonSearch = $state('');
  let comparisonKindFilter = $state<'all' | 'added' | 'changed' | 'removed'>('all');
  let changelogList = $state<ChangelogEntry[]>([]);
  let loadingChangelog = $state(false);
  let changelogSearch = $state('');
  let changelogKindFilter = $state<'all' | 'added' | 'changed' | 'removed'>('all');
  let collapsedSnapshots = $state<Set<number>>(new Set());
  let copiedFieldKey = $state<string | null>(null);
  let copiedTimeout: any = null;
  let contactHistory = $state<ContactHistoryEntry[]>([]);
  let originalDetail: Contact | undefined = $state(undefined);
  let previewSequence: number | null = $state(null);
  let previewBusy = $state(false);
  let previewRequest = 0;
  let loadingHistory = $state(false);
  let expandedHistoryVersions = $state<Set<number>>(new Set());
  let captureProgress = $state<CaptureProgress | null>(null);
  let toastMessage = $state('');
  let deleteSnapshotTarget = $state<Capture | null>(null);
  let showResetDatabaseConfirm = $state(false);
  let archiveActionBusy = $state(false);

  // Column Configuration & Resizing State
  let activeColKeys = $state<ColumnKey[]>(['name', 'email', 'phone', 'birthday', 'labels']);
  let colWidths = $state<Record<ColumnKey, number>>({
    name: 260,
    job: 220,
    email: 230,
    phone: 180,
    birthday: 160,
    labels: 240,
    org: 180,
    title: 160,
    address: 220,
    notes: 200,
  });
  let openColDropdownSlot = $state<number | null>(null);
  let draggedColIndex = $state<number | null>(null);
  let dragOverColIndex = $state<number | null>(null);
  let pointerDragSlot = $state<number | null>(null);
  let pointerOverSlot = $state<number | null>(null);

  // Name sorting state
  let nameSortField = $state<'first' | 'last'>('first');
  let nameSortDirection = $state<'asc' | 'desc'>('asc');
  let showSortMenu = $state(false);

  // Group Map derived for quick label name lookup
  const groupMap = $derived.by(() => {
    const map = new Map<string, string>();
    for (const g of groups) {
      map.set(g.resource_name, g.name);
    }
    return map;
  });

  const activeGroups = $derived.by(() => {
    return groups.filter((g) => selectedGroups.includes(g.resource_name));
  });

  const activeGroup = $derived.by(() => {
    return activeGroups[0] ?? null;
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
    if (selectedPhotoUrl && detail?.resource_name === c.resource_name) {
      const match = mediaList.find((m) => m.source_url === selectedPhotoUrl && m.data_url);
      if (match?.data_url) return match.data_url;
      if (avatarMap[selectedPhotoUrl]) return avatarMap[selectedPhotoUrl];
      return selectedPhotoUrl;
    }

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

    // Multi-select label filter
    if (selectedGroups.length > 0) {
      const groupAliasSets: Set<string>[] = [];

      for (const res of selectedGroups) {
        const chosenName = groups.find((group) => group.resource_name === res)?.name?.trim().toLocaleLowerCase()
          || groupMap.get(res)?.trim().toLocaleLowerCase();
        const aliasSet = new Set<string>();
        aliasSet.add(res);
        if (chosenName) {
          for (const group of groups) {
            if (group.name?.trim().toLocaleLowerCase() === chosenName) {
              aliasSet.add(group.resource_name);
            }
          }
        }
        groupAliasSets.push(aliasSet);
      }

      if (labelMatchMode === 'all') {
        filtered = filtered.filter((contact) => {
          const contactMemberships = (contact.payload.memberships as Array<any>) || [];
          const contactGroupResources = new Set(
            contactMemberships
              .map((m) => m?.contactGroupMembership?.contactGroupResourceName)
              .filter(Boolean)
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
            combinedAliases.has(m?.contactGroupMembership?.contactGroupResourceName)
          );
        });
      }
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

  function downloadContactCsv(c: Contact) {
    const name = getDisplayName(c);
    const csvStr = generateContactCsv(c, groupMap);
    const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    a.download = `contact-${safeName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toastMessage = `Downloaded Google CSV for ${name}.`;
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

  function getContactSortKey(c: Contact, field: 'first' | 'last'): string {
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
    return getDisplayName(c).toLowerCase();
  }

  // Sorted contacts: alphabetical by display name respecting first/last name and asc/desc order
  const sortedContacts = $derived.by(() => {
    return [...contacts].sort((a, b) => {
      const keyA = getContactSortKey(a, nameSortField);
      const keyB = getContactSortKey(b, nameSortField);
      const cmp = keyA.localeCompare(keyB, undefined, { numeric: true, sensitivity: 'base' });
      return nameSortDirection === 'asc' ? cmp : -cmp;
    });
  });

  // Favourites starred at top
  const favouriteContacts = $derived.by(() => {
    if (selectedGroups.length > 0) return [];
    return sortedContacts.filter(isFavourite);
  });

  // Remaining contacts
  const otherContacts = $derived.by(() => {
    if (selectedGroups.length > 0) return sortedContacts;
    const favIds = new Set(favouriteContacts.map((c) => c.resource_name));
    return sortedContacts.filter((c) => !favIds.has(c.resource_name));
  });

  function getPrimaryPhone(payload: Record<string, unknown>): string {
    const phones = (payload.phoneNumbers as Array<any>) || [];
    const raw = phones[0]?.value || '';
    if (!raw) return '';
    return formatPhone(raw, phones[0]?.canonicalForm, effectiveCountry).value;
  }

  function getAllPhones(payload: Record<string, unknown>): Array<{ value: string; formatted: string; type: string }> {
    const phones = (payload.phoneNumbers as Array<any>) || [];
    return phones.map((p) => {
      const raw = p?.value || '';
      return {
        value: raw,
        formatted: formatPhone(raw, p?.canonicalForm, effectiveCountry).value || raw,
        type: p?.formattedType || p?.type || 'Other',
      };
    });
  }

  function getBirthday(payload: Record<string, unknown>): string {
    const bdays = (payload.birthdays as Array<any>) || [];
    if (!bdays.length) return '';
    return formatBirthdayDate(bdays[0]?.date, bdays[0]?.text, preferences.birthdayFormat);
  }

  interface ContactLabelItem {
    name: string;
    resourceName: string;
  }

  function getContactLabelItems(payload: Record<string, unknown>): ContactLabelItem[] {
    const mems = (payload.memberships as Array<any>) || [];
    const items: ContactLabelItem[] = [];
    const seen = new Set<string>();
    for (const m of mems) {
      const res = m?.contactGroupMembership?.contactGroupResourceName;
      if (res) {
        const name = groupMap.get(res);
        if (name && !name.startsWith('systemContactGroups/') && !seen.has(name)) {
          seen.add(name);
          items.push({ name, resourceName: res });
        }
      }
    }
    return items;
  }

  function getContactLabels(payload: Record<string, unknown>): string[] {
    return getContactLabelItems(payload).map((item) => item.name);
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

  function getAllAddresses(payload: Record<string, unknown>): Array<{ lines: string[]; type: string; copyValue: string }> {
    const addrs = (payload.addresses as Array<any>) || [];
    return addrs.map((a) => {
      // Build multi-line display: prefer formattedValue (split on newlines), else build from parts
      let lines: string[];
      if (a?.formattedValue?.trim()) {
        lines = a.formattedValue.trim().split(/\r?\n/).filter(Boolean);
      } else {
        lines = [
          a.streetAddress,
          a.extendedAddress,
          a.city && a.region ? `${a.city}, ${a.region} ${a.postalCode || ''}`.trim() : (a.city || a.region || ''),
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
    }).filter((a) => a.lines.length > 0);
  }

  function getNotes(payload: Record<string, unknown>): string {
    const bios = (payload.biographies as Array<any>) || [];
    return bios[0]?.value || '';
  }

  function getAllRelations(payload: Record<string, unknown>): Array<{ name: string; type: string }> {
    const rels = (payload.relations as Array<any>) || [];
    return rels
      .map((r) => ({ name: r?.person || '', type: r?.formattedType || r?.type || 'Related person' }))
      .filter((r) => r.name);
  }

  function getAllEvents(payload: Record<string, unknown>): Array<{ date: string; type: string }> {
    const evts = (payload.events as Array<any>) || [];
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return evts.map((e) => {
      const d = e?.date;
      let dateStr = '';
      if (d) {
        const parts = [d.day, d.month && months[d.month - 1], d.year].filter(Boolean);
        dateStr = parts.join(' ');
      } else if (e?.text) {
        dateStr = e.text;
      }
      return { date: dateStr, type: e?.formattedType || e?.type || 'Event' };
    }).filter((e) => e.date);
  }

  function getAllUrls(payload: Record<string, unknown>): Array<{ url: string; type: string }> {
    const urls = (payload.urls as Array<any>) || [];
    return urls
      .map((u) => ({ url: u?.value || '', type: u?.formattedType || u?.type || 'Website' }))
      .filter((u) => u.url);
  }

  function getAllUserDefined(payload: Record<string, unknown>): Array<{ key: string; value: string }> {
    const ud = (payload.userDefined as Array<any>) || [];
    return ud
      .map((u) => ({ key: u?.key || '', value: u?.value || '' }))
      .filter((u) => u.key || u.value);
  }

  function getAddressMapsUrl(addr: { lines: string[]; copyValue: string }): string {
    return `https://maps.google.com/?q=${encodeURIComponent(addr.copyValue)}`;
  }

  function getMapsUrlFromAddress(address: string): string {
    return `https://maps.google.com/?q=${encodeURIComponent(address)}`;
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

  function formatRelativeTime(dateStr?: string | null): string {
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

  function getLastEditedInfo(c: Contact | undefined, history: ContactHistoryEntry[]): { date: string; relative: string } {
    if (!c) return { date: 'Unknown', relative: '' };
    const sources = (c.payload?.metadata as any)?.sources || [];
    const updateTime = sources.find((s: any) => s?.updateTime)?.updateTime;
    let target = updateTime;
    if (!target && history.length > 0) {
      target = history[0].committed_at;
    } else if (!target && capture?.committed_at) {
      target = capture.committed_at;
    }
    return {
      date: target ? formatCaptureTime(target) : 'Not recorded',
      relative: target ? formatRelativeTime(target) : '',
    };
  }

  function getFirstSeenInfo(c: Contact | undefined, history: ContactHistoryEntry[]): { date: string; relative: string } {
    if (!c) return { date: 'Unknown', relative: '' };
    let target = '';
    if (history.length > 0) {
      target = history[history.length - 1].committed_at;
    } else if (capture?.committed_at) {
      target = capture.committed_at;
    }
    return {
      date: target ? formatCaptureTime(target) : 'Not recorded',
      relative: target ? formatRelativeTime(target) : '',
    };
  }

  const detailLastEdited = $derived(getLastEditedInfo(detail, contactHistory));
  const detailFirstSeen = $derived(getFirstSeenInfo(detail, contactHistory));

  function toggleHistoryVersionExpanded(version: number) {
    const next = new Set(expandedHistoryVersions);
    if (next.has(version)) {
      next.delete(version);
    } else {
      next.add(version);
    }
    expandedHistoryVersions = next;
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
  function currentNavigation(): NavigationEntry {
    return {
      contactHistoryNavigation: true,
      index: navigationIndex,
      accountId: selected?.id ?? null,
      snapshot: capture?.sequence ?? null,
      page: pageView,
      contact: detail?.resource_name ?? null,
      groups: [...selectedGroups],
      changesTab,
      compareBase: compareBaseSeq,
      compareTarget: compareTargetSeq,
    };
  }

  function recordNavigation() {
    if (!navigationReady || restoringNavigation || navigationQueued) return;
    navigationQueued = true;
    queueMicrotask(() => {
      navigationQueued = false;
      if (restoringNavigation) return;
      const next = currentNavigation();
      const previous = window.history.state as NavigationEntry | null;
      if (previous?.contactHistoryNavigation) {
        const { index: _oldIndex, ...oldDestination } = previous;
        const { index: _newIndex, ...newDestination } = next;
        if (JSON.stringify(oldDestination) === JSON.stringify(newDestination)) return;
      }
      navigationIndex++;
      navigationMaxIndex = navigationIndex;
      window.history.pushState({ ...next, index: navigationIndex }, '');
    });
  }

  function goBack() {
    if (navigationIndex > 0) window.history.back();
  }

  function goForward() {
    if (navigationIndex < navigationMaxIndex) window.history.forward();
  }

  async function restoreNavigation(entry: NavigationEntry) {
    const request = ++navigationRequest;
    restoringNavigation = true;
    navigationIndex = entry.index;
    try {
      const account = accounts.find((item) => item.id === entry.accountId);
      if (account && selected?.id !== account.id) await selectAccount(account);
      if (request !== navigationRequest) return;
      if (entry.snapshot && capture?.sequence !== entry.snapshot && captures.some((item) => item.sequence === entry.snapshot)) {
        await changeCapture(entry.snapshot);
      }
      if (request !== navigationRequest) return;
      selectedGroups = entry.groups.filter((name) => groups.some((group) => group.resource_name === name));
      offset = 0;
      updateDisplayedContacts();
      pageView = entry.page;
      changesTab = entry.changesTab;
      compareBaseSeq = entry.compareBase;
      compareTargetSeq = entry.compareTarget;
      if (pageView === 'changes' && changesTab === 'comparison') refreshChangesComparison();
      detail = undefined;
      if (entry.contact && pageView === 'contacts') {
        const contact = allSnapshotContacts.find((item) => item.resource_name === entry.contact);
        if (contact) await selectContact(contact);
      }
      showSettingsModal = false;
      showRawDataModal = false;
      showPhotosModal = false;
      showAccountMenu = false;
      showSnapshotDropdown = false;
      error = '';
    } finally {
      if (request === navigationRequest) restoringNavigation = false;
    }
  }

  function handlePopState(event: PopStateEvent) {
    const entry = event.state as NavigationEntry | null;
    if (entry?.contactHistoryNavigation) void restoreNavigation(entry);
  }

  function handleNativeNavigation(event: MouseEvent) {
    if (event.button === 3 || event.button === 4) {
      event.preventDefault();
      if (event.button === 3) goBack();
      else goForward();
    }
  }

  function navigate(to: Page) {
    pageView = to;
    error = '';
    recordNavigation();
  }

  async function refreshAccounts() {
    try {
      accounts = await api.accounts();
      if (accounts.length) {
        if (!selected || !accounts.some((a) => a.id === selected?.id)) {
          await selectAccount(accounts[0]);
        }
      } else {
        selected = undefined;
        captures = [];
        capture = undefined;
        contacts = [];
        changes = [];
        groups = [];
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
    selectedGroups = [];
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
      await refreshAllChanges();
      if (captures.length > 0) {
        navigate('contacts');
      } else {
        navigate('onboarding');
      }
    } catch (e) {
      error = String(e);
    }
  }

  function isSystemGroup(resName: string, name: string): boolean {
    const trimmed = (name || '').trim();
    // Retain user's propercase "Family" label unless it's explicitly the system group
    if (trimmed === 'Family' && !(resName || '').toLowerCase().endsWith('/family')) {
      return false;
    }
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
    // Ignore lowercase "family"
    if (trimmed === 'family') {
      return true;
    }
    const norm = trimmed.toLowerCase().replace(/[-_\s]/g, '');
    const sysNames = new Set([
      'mycontacts',
      'starred',
      'all',
      'allcontacts',
      'blocked',
      'chatbuddies',
      'chatcontacts',
      'coworkers',
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
    if (!target.closest('.detail-menu-container')) {
      showDetailMenu = false;
      showPhotoQualityMenu = false;
    }
    if (!target.closest('.selection-box-wrapper')) {
      showSelectionMenu = false;
    }
    if (!target.closest('.selection-download-wrapper')) {
      showDownloadMenu = false;
    }
  }

  function updateStickyState() {
    if (!detailViewEl || !topNavEl) {
      isScrolled = false;
      showStickyName = false;
      return;
    }
    isScrolled = detailViewEl.scrollTop > 16;
    if (!heroAvatarEl) {
      showStickyName = isScrolled;
      return;
    }
    const avatarRect = heroAvatarEl.getBoundingClientRect();
    const navRect = topNavEl.getBoundingClientRect();
    // Profile picture is no longer visible once its bottom edge has scrolled
    // above or level with the bottom edge of the sticky top nav bar.
    showStickyName = avatarRect.bottom <= navRect.bottom;
  }

  async function refreshChanges() {
    if (!selected || !capture) {
      changes = [];
      return;
    }
    compareTargetSeq = capture.sequence;
    const prior = captures.find((c) => c.sequence < capture!.sequence);
    compareBaseSeq = prior ? prior.sequence : capture.sequence;

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

  async function refreshAllChanges() {
    if (!selected) {
      changelogList = [];
      return;
    }
    loadingChangelog = true;
    try {
      changelogList = await api.allChanges(selected.id, 2000, 0);
    } catch (e) {
      changelogList = [];
    } finally {
      loadingChangelog = false;
    }
  }

  function swapComparisonSnapshots() {
    const temp = compareBaseSeq;
    compareBaseSeq = compareTargetSeq;
    compareTargetSeq = temp;
    refreshChangesComparison();
    recordNavigation();
  }

  function compareSnapshotWithPrior(seq: number) {
    compareTargetSeq = seq;
    const prior = captures.find((c) => c.sequence < seq);
    compareBaseSeq = prior ? prior.sequence : seq;
    changesTab = 'comparison';
    refreshChangesComparison();
    recordNavigation();
  }

  function toggleSnapshotCollapse(seq: number) {
    const next = new Set(collapsedSnapshots);
    if (next.has(seq)) {
      next.delete(seq);
    } else {
      next.add(seq);
    }
    collapsedSnapshots = next;
  }

  const filteredComparisonChanges = $derived.by(() => {
    let list = changes;
    if (comparisonKindFilter !== 'all') {
      list = list.filter((c) => c.kind === comparisonKindFilter);
    }
    const q = comparisonSearch.trim().toLowerCase();
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
  });

  const comparisonStats = $derived.by(() => {
    return {
      total: changes.length,
      added: changes.filter((c) => c.kind === 'added').length,
      changed: changes.filter((c) => c.kind === 'changed').length,
      removed: changes.filter((c) => c.kind === 'removed').length,
    };
  });

  const filteredChangelog = $derived.by(() => {
    let list = changelogList;
    if (changelogKindFilter !== 'all') {
      list = list.filter((c) => c.kind === changelogKindFilter);
    }
    const q = changelogSearch.trim().toLowerCase();
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
  });

  const changelogStats = $derived.by(() => {
    return {
      totalSnapshots: captures.length,
      totalEvents: changelogList.length,
      added: changelogList.filter((c) => c.kind === 'added').length,
      changed: changelogList.filter((c) => c.kind === 'changed').length,
      removed: changelogList.filter((c) => c.kind === 'removed').length,
    };
  });

  interface SnapshotChangelogGroup {
    sequence: number;
    committed_at: string;
    capture?: Capture;
    changes: ChangelogEntry[];
  }

  const changelogSnapshotGroups = $derived.by(() => {
    const map = new Map<number, SnapshotChangelogGroup>();
    for (const item of filteredChangelog) {
      if (!map.has(item.capture_sequence)) {
        const cap = captures.find((c) => c.sequence === item.capture_sequence);
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
  });

  async function selectContact(contact: Contact) {
    const request = ++previewRequest;
    originalDetail = contact;
    previewSequence = null;
    previewBusy = false;
    detail = contact;
    recordNavigation();
    showStickyName = false;
    isScrolled = false;
    showDetailMenu = false;
    if (detailViewEl) {
      detailViewEl.scrollTop = 0;
    }
    selectedPhotoUrl = null;
    contactHistory = [];
    expandedHistoryVersions = new Set();
    media = mediaCache.get(contact.resource_name) || [];
    if (selected) {
      loadingHistory = true;
      try {
        const history = await api.contactHistory(selected.id, contact.resource_name);
        if (request === previewRequest) contactHistory = history;
      } catch (e) {
        if (request === previewRequest) contactHistory = [];
      } finally {
        if (request === previewRequest) loadingHistory = false;
      }

      if (capture) {
        try {
          const loadedMedia = await api.media(selected.id, capture.sequence, contact.resource_name);
          mediaCache.set(contact.resource_name, loadedMedia);
          if (request === previewRequest && detail?.resource_name === contact.resource_name) {
            media = loadedMedia;
          }
        } catch (e) {
          // non-blocking
        }
      }
    }
  }

  function selectLabelFilter(groupResourceName: string | null) {
    if (groupResourceName === null) {
      selectedGroups = [];
    } else {
      selectedGroups = [groupResourceName];
    }
    if (window.innerWidth < 1000) sidebarCollapsed = true;
    offset = 0;
    detail = undefined;
    updateDisplayedContacts();
    recordNavigation();
  }

  function toggleLabelFilter(groupResourceName: string) {
    if (selectedGroups.includes(groupResourceName)) {
      selectedGroups = selectedGroups.filter((g) => g !== groupResourceName);
    } else {
      selectedGroups = [...selectedGroups, groupResourceName];
    }
    if (window.innerWidth < 1000) sidebarCollapsed = true;
    offset = 0;
    detail = undefined;
    updateDisplayedContacts();
    recordNavigation();
  }

  function isolateLabelFilter(groupResourceName: string) {
    selectedGroups = [groupResourceName];
    if (window.innerWidth < 1000) sidebarCollapsed = true;
    offset = 0;
    detail = undefined;
    updateDisplayedContacts();
    recordNavigation();
  }

  function clearLabelFilter() {
    selectedGroups = [];
    if (window.innerWidth < 1000) sidebarCollapsed = true;
    offset = 0;
    detail = undefined;
    updateDisplayedContacts();
    recordNavigation();
  }

  async function changeCapture(sequence: number) {
    capture = captures.find((c) => c.sequence === sequence);
    offset = 0;
    selectedGroups = [];
    showSnapshotDropdown = false;
    await refreshGroups();
    await refreshContacts();
    await refreshChanges();
    recordNavigation();
  }

  async function previewContactRevision(entry: ContactHistoryEntry) {
    if (!selected || !originalDetail || !entry.after || previewBusy) return;
    const request = ++previewRequest;
    const resourceName = originalDetail.resource_name;
    previewBusy = true;
    try {
      const contact = await api.contactAtSnapshot(selected.id, entry.sequence, resourceName);
      if (request !== previewRequest || !contact) return;
      const previewMedia = await api.media(selected.id, entry.sequence, resourceName).catch(() => []);
      if (request !== previewRequest) return;
      if (detail?.resource_name !== resourceName || pageView !== 'contacts') return;
      detail = contact;
      media = previewMedia;
      previewSequence = entry.sequence;
      selectedPhotoUrl = null;
      detailViewEl?.scrollTo({ top: 0 });
    } catch (e) {
      if (request === previewRequest) toastMessage = `Could not preview revision: ${String(e)}`;
    } finally {
      if (request === previewRequest) previewBusy = false;
    }
  }

  function restoreContactRevision() {
    if (!originalDetail) return;
    previewRequest++;
    detail = originalDetail;
    previewSequence = null;
    previewBusy = false;
    selectedPhotoUrl = null;
    media = mediaCache.get(originalDetail.resource_name) || [];
  }

  async function deleteSelectedSnapshot() {
    if (!selected || !deleteSnapshotTarget || archiveActionBusy) return;
    const sequence = deleteSnapshotTarget.sequence;
    archiveActionBusy = true;
    error = '';
    try {
      await api.deleteSnapshot(selected.id, sequence);
      deleteSnapshotTarget = null;
      showSnapshotDropdown = false;
      mediaCache.clear();
      await selectAccount(selected);
      toastMessage = `Snapshot #${sequence} deleted.`;
    } catch (e) { error = String(e); }
    finally { archiveActionBusy = false; }
  }

  async function resetAllDatabase() {
    if (archiveActionBusy) return;
    archiveActionBusy = true;
    settingsError = '';
    try {
      await api.resetDatabase();
      showResetDatabaseConfirm = false;
      showSettingsModal = false;
      mediaCache.clear();
      if (selected) await selectAccount(selected);
      toastMessage = 'Local database reset. Your connected accounts are ready for a new capture.';
    } catch (e) { settingsError = String(e); }
    finally { archiveActionBusy = false; }
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

  function getColumnLabel(key: ColumnKey): string {
    if (key === 'job') return 'Job title and company';
    if (key === 'email') return 'Email';
    if (key === 'phone') return 'Phone number';
    if (key === 'birthday') return 'Birthday';
    if (key === 'labels') return 'Labels';
    if (key === 'address') return 'Address';
    if (key === 'notes') return 'Notes';
    if (key === 'org') return 'Organization';
    if (key === 'title') return 'Job title';
    if (key === 'name') return 'Name';
    return key;
  }

  function selectColumnForSlot(slotIndex: number, newKey: ColumnKey) {
    if (slotIndex < 1 || slotIndex >= activeColKeys.length) return;
    const existingIndex = activeColKeys.indexOf(newKey);
    const newCols = [...activeColKeys];
    if (existingIndex !== -1) {
      // Swap existing slot with this slot
      newCols[existingIndex] = newCols[slotIndex];
      newCols[slotIndex] = newKey;
    } else {
      newCols[slotIndex] = newKey;
    }
    activeColKeys = newCols;
    try {
      localStorage.setItem('contacts_active_cols', JSON.stringify(activeColKeys));
    } catch (_) {}
    openColDropdownSlot = null;
  }

  function setSortField(field: 'first' | 'last') {
    nameSortField = field;
    try { localStorage.setItem('contacts_sort_field', field); } catch (_) {}
  }

  function toggleSortDirection() {
    nameSortDirection = nameSortDirection === 'asc' ? 'desc' : 'asc';
    try { localStorage.setItem('contacts_sort_dir', nameSortDirection); } catch (_) {}
  }

  function setSortDirection(dir: 'asc' | 'desc') {
    nameSortDirection = dir;
    try { localStorage.setItem('contacts_sort_dir', dir); } catch (_) {}
  }

  function moveColumnSlot(fromIndex: number, direction: -1 | 1) {
    const toIndex = fromIndex + direction;
    if (toIndex < 1 || toIndex >= activeColKeys.length) return;
    const newCols = [...activeColKeys];
    const temp = newCols[fromIndex];
    newCols[fromIndex] = newCols[toIndex];
    newCols[toIndex] = temp;
    activeColKeys = newCols;
    try {
      localStorage.setItem('contacts_active_cols', JSON.stringify(activeColKeys));
    } catch (_) {}
  }

  function startPointerDrag(slotIndex: number, e: PointerEvent) {
    if (e.button !== 0) return;
    pointerDragSlot = slotIndex;
    pointerOverSlot = slotIndex;
    openColDropdownSlot = null;
    const currentTarget = e.currentTarget as HTMLElement;
    try {
      currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}

    function onMove(ev: PointerEvent) {
      if (pointerDragSlot === null) return;
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const row = el?.closest('.col-order-slot-row');
      if (row) {
        const idx = row.getAttribute('data-slot-index');
        if (idx) {
          const num = parseInt(idx, 10);
          if (!isNaN(num) && num >= 1 && num < activeColKeys.length) {
            pointerOverSlot = num;
          }
        }
      }
    }

    function onUp(ev: PointerEvent) {
      try {
        currentTarget.releasePointerCapture(ev.pointerId);
      } catch (_) {}
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (pointerDragSlot !== null && pointerOverSlot !== null && pointerDragSlot !== pointerOverSlot) {
        const newCols = [...activeColKeys];
        const [moved] = newCols.splice(pointerDragSlot, 1);
        newCols.splice(pointerOverSlot, 0, moved);
        activeColKeys = newCols;
        try {
          localStorage.setItem('contacts_active_cols', JSON.stringify(activeColKeys));
        } catch (_) {}
      }
      pointerDragSlot = null;
      pointerOverSlot = null;
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function handleColDragStart(slotIndex: number, e: DragEvent) {
    draggedColIndex = slotIndex;
    openColDropdownSlot = null;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(slotIndex));
    }
  }

  function handleColDragOver(slotIndex: number, e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
    if (dragOverColIndex !== slotIndex) {
      dragOverColIndex = slotIndex;
    }
  }

  function handleColDrop(slotIndex: number, e: DragEvent) {
    e.preventDefault();
    if (draggedColIndex !== null && draggedColIndex !== slotIndex && slotIndex >= 1 && draggedColIndex >= 1) {
      const newCols = [...activeColKeys];
      const [moved] = newCols.splice(draggedColIndex, 1);
      newCols.splice(slotIndex, 0, moved);
      activeColKeys = newCols;
      try {
        localStorage.setItem('contacts_active_cols', JSON.stringify(activeColKeys));
      } catch (_) {}
    }
    draggedColIndex = null;
    dragOverColIndex = null;
  }

  function handleColDragEnd() {
    draggedColIndex = null;
    dragOverColIndex = null;
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
      job: 220,
      email: 230,
      phone: 180,
      birthday: 160,
      labels: 240,
      org: 180,
      title: 160,
      address: 220,
      notes: 200,
    };
    openColDropdownSlot = null;
    draggedColIndex = null;
    dragOverColIndex = null;
    pointerDragSlot = null;
    pointerOverSlot = null;
    try {
      localStorage.removeItem('contacts_active_cols');
      localStorage.removeItem('contacts_col_widths');
    } catch (_) {}
  }

  // Sidebar Resizing Logic
  function startSidebarResize(e: MouseEvent) {
    e.preventDefault();
    isResizingSidebar = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    function onMouseMove(moveEvent: MouseEvent) {
      const maxAllowed = Math.min(480, Math.floor(window.innerWidth * 0.45));
      const newWidth = Math.min(maxAllowed, Math.max(220, moveEvent.clientX));
      sidebarWidth = newWidth;
    }

    function onMouseUp() {
      isResizingSidebar = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      try {
        localStorage.setItem('sidebar_width', String(sidebarWidth));
      } catch (_) {}
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  function resetSidebarWidth() {
    sidebarWidth = 280;
    try {
      localStorage.removeItem('sidebar_width');
    } catch (_) {}
  }

  function handleSidebarResizerKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      sidebarWidth = Math.max(220, sidebarWidth - 10);
      try { localStorage.setItem('sidebar_width', String(sidebarWidth)); } catch (_) {}
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      const maxAllowed = Math.min(480, Math.floor(window.innerWidth * 0.45));
      sidebarWidth = Math.min(maxAllowed, sidebarWidth + 10);
      try { localStorage.setItem('sidebar_width', String(sidebarWidth)); } catch (_) {}
    } else if (e.key === 'Enter' || e.key === 'Home') {
      e.preventDefault();
      resetSidebarWidth();
    }
  }

  // Settings Actions
  async function updateSchedule(patch: Partial<ScheduleConfig>) {
    if (scheduleBusy || !scheduleReady) return;
    scheduleBusy = true;
    settingsError = '';
    const updated = { ...scheduleConfig, ...patch };
    scheduleConfig = updated;
    scheduled = updated.enabled;
    try {
      await api.saveScheduleConfig(updated);
      if (selected) {
        due = await api.due(selected.id);
      }
    } catch (e) {
      settingsError = 'Failed to update schedule: ' + String(e);
    } finally {
      scheduleBusy = false;
    }
  }

  async function toggleSchedule() {
    await updateSchedule({ enabled: !scheduleConfig.enabled });
  }

  async function exportSelected(format: 'csv' | 'vcf') {
    if (!selected || !capture || capture.contact_count === 0) return;
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

  function toggleContactSelection(resName: string, event?: MouseEvent) {
    if (event) {
      event.stopPropagation();
    }
    if (selectedContactKeys.includes(resName)) {
      selectedContactKeys = selectedContactKeys.filter((k) => k !== resName);
    } else {
      selectedContactKeys = [...selectedContactKeys, resName];
    }
  }

  function selectAllVisible() {
    selectedContactKeys = contacts.map((c) => c.resource_name);
  }

  function clearContactSelection() {
    selectedContactKeys = [];
  }

  function toggleSelectAll() {
    if (selectedContactKeys.length > 0) {
      clearContactSelection();
    } else {
      selectAllVisible();
    }
  }

  function triggerFileDownload(content: string, filename: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadSelectedCsv() {
    if (selectedContactsList.length === 0) return;
    const groupMap = new Map<string, string>();
    for (const g of groups) {
      groupMap.set(g.resource_name, g.name);
    }
    const csvContent = generateMultipleContactsCsv(selectedContactsList, groupMap);
    const filename = `google-contacts-selected-${selectedContactsList.length}.csv`;
    triggerFileDownload(csvContent, filename, 'text/csv;charset=utf-8;');
  }

  function downloadSelectedVcf() {
    if (selectedContactsList.length === 0) return;
    const vcfContent = generateMultipleContactsVcf(selectedContactsList);
    const filename = `contacts-selected-${selectedContactsList.length}.vcf`;
    triggerFileDownload(vcfContent, filename, 'text/vcard;charset=utf-8;');
  }

  function downloadSelectedJson() {
    if (selectedContactsList.length === 0) return;
    const jsonContent = JSON.stringify(
      selectedContactsList.map((c) => ({
        resource_name: c.resource_name,
        display_name: c.display_name,
        version: c.version,
        payload: c.payload,
      })),
      null,
      2
    );
    const filename = `contacts-selected-${selectedContactsList.length}.json`;
    triggerFileDownload(jsonContent, filename, 'application/json;charset=utf-8;');
  }

  function sendEmailToSelected() {
    if (selectedContactsList.length === 0) return;
    const emailSet = new Set<string>();
    for (const c of selectedContactsList) {
      const p = (c.payload || {}) as Record<string, any>;
      const ems = (p.emailAddresses as Array<any>) || (p.emails as Array<any>) || [];
      for (const em of ems) {
        const val = typeof em === 'string' ? em : em?.value;
        if (val && typeof val === 'string' && val.includes('@')) {
          emailSet.add(val.trim());
        }
      }
    }
    const emailList = Array.from(emailSet);
    if (emailList.length === 0) {
      toastMessage = 'Selected contacts do not have any email addresses';
      setTimeout(() => {
        if (toastMessage === 'Selected contacts do not have any email addresses') {
          toastMessage = '';
        }
      }, 3000);
      return;
    }
    const mailtoUrl = `mailto:${encodeURIComponent(emailList.join(','))}`;
    window.open(mailtoUrl, '_blank');
  }

  function openPhotoExport() {
    if (!selected || !capture || capture.contact_count === 0) return;
    showPhotoExportModal = true;
    photoExportBusy = false;
    photoExportProgress = null;
    photoExportResult = null;
    photoExportError = '';
  }

  function detailPhotoUrl(): string | null {
    if (!detail) return null;
    const photos = getContactPhotos(detail, media, avatarMap);
    const photo = photos.find((item) => item.url === selectedPhotoUrl) ?? photos[0];
    if (!photo) return null;
    if (/^https?:\/\//.test(photo.url) || photo.url.startsWith('data:image/')) return photo.url;
    return photo.displayUrl.startsWith('data:image/') ? photo.displayUrl : null;
  }

  async function openPhotoQualityMenu() {
    showPhotoQualityMenu = !showPhotoQualityMenu;
    if (!showPhotoQualityMenu || !selected || !capture) return;
    const photoUrl = detailPhotoUrl();
    if (!photoUrl) return;
    const request = ++photoQualityRequest;
    photoQualityInfo = null;
    photoQualitySelection = null;
    photoQualityError = '';
    photoQualityLoading = true;
    try {
      const info = await api.singlePhotoQuality(selected.id, previewSequence ?? capture.sequence, photoUrl);
      if (request === photoQualityRequest && showPhotoQualityMenu) {
        photoQualityInfo = info;
        photoQualitySelection = info.resizable && Math.max(info.width, info.height) >= 512 ? 512 : null;
      }
    } catch (e) {
      if (request === photoQualityRequest && showPhotoQualityMenu) photoQualityError = `Could not check available sizes: ${String(e)}`;
    } finally {
      if (request === photoQualityRequest) photoQualityLoading = false;
    }
  }

  async function downloadDetailPhoto(preferHigh = false) {
    if (!detail || !selected || !capture || photoDownloadBusy) return;
    const photoUrl = detailPhotoUrl();
    if (!photoUrl) {
      toastMessage = 'No photo is available for this contact.';
      return;
    }
    photoDownloadBusy = true;
    try {
      const info = preferHigh || !photoQualityInfo
        ? await api.singlePhotoQuality(selected.id, previewSequence ?? capture.sequence, photoUrl)
        : photoQualityInfo;
      const size = preferHigh
        ? (info.resizable && Math.max(info.width, info.height) >= 512 ? 512 : null)
        : photoQualitySelection;
      const formatNames: Record<string, string> = { jpg: 'JPEG', png: 'PNG', webp: 'WebP', gif: 'GIF' };
      const formats = [info.extension, 'jpg', 'png', 'webp'].filter((value, index, all) => all.indexOf(value) === index);
      const name = getDisplayName(detail).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '') || 'Contact photo';
      const destination = await save({
        defaultPath: `${name}.${info.extension}`,
        title: 'Save Contact Photo',
        filters: formats.map((extension) => ({
          name: extension === info.extension ? `${formatNames[extension]} (original format)` : formatNames[extension],
          extensions: [extension],
        })),
      });
      if (!destination) return;
      const savedPath = await api.exportSinglePhoto(selected.id, previewSequence ?? capture.sequence, photoUrl, destination, size);
      toastMessage = `Photo saved to ${savedPath}`;
      showDetailMenu = false;
      showPhotoQualityMenu = false;
    } catch (e) {
      const message = `Could not download photo: ${String(e)}`;
      if (showPhotoQualityMenu) photoQualityError = message;
      else toastMessage = message;
    } finally {
      photoDownloadBusy = false;
    }
  }

  async function startPhotoExport() {
    if (!selected || !capture) return;
    photoExportBusy = true;
    photoExportError = '';
    photoExportResult = null;
    photoExportProgress = null;

    let unlisten: UnlistenFn | null = null;
    try {
      unlisten = await listenPhotoExportProgress((p) => {
        photoExportProgress = p;
      });

      let destination: string | null = null;
      if (photoExportFormat === 'folder') {
        const selectedDir = await open({
          directory: true,
          multiple: false,
          title: 'Select Destination Folder for Contact Photos',
        });
        if (typeof selectedDir === 'string') {
          destination = selectedDir;
        }
      } else {
        const selectedFile = await save({
          defaultPath: `contact-photos-${selected.email}-capture-${capture.sequence}.zip`,
          filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
        });
        if (selectedFile) {
          destination = selectedFile;
        }
      }

      if (!destination) {
        photoExportBusy = false;
        if (unlisten) unlisten();
        return;
      }

      const res = await api.exportPhotos(
        selected.id,
        capture.sequence,
        destination,
        photoExportFormat,
        false
      );
      photoExportResult = res;
    } catch (e) {
      photoExportError = String(e);
    } finally {
      photoExportBusy = false;
      if (unlisten) {
        unlisten();
      }
    }
  }

  async function backupSelected() {
    if (!selected || captures.length === 0) return;
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
      selected = undefined;
      captures = [];
      capture = undefined;
      contacts = [];
      changes = [];
      groups = [];
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
    if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault();
      if (event.key === 'ArrowLeft') goBack();
      else goForward();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      if (!hasData || pageView === 'onboarding') return;
      event.preventDefault();
      searchInputEl?.focus();
      searchInputEl?.select();
      if (search.trim().length > 0) {
        searchDropdownOpen = true;
      }
      return;
    }
    if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes((document.activeElement as HTMLElement)?.tagName)) {
      if (!hasData || pageView === 'onboarding') return;
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
      showSelectionMenu = false;
      showDownloadMenu = false;
      if (searchDropdownOpen) {
        searchDropdownOpen = false;
        return;
      }
      if (selectedContactKeys.length > 0) {
        clearContactSelection();
        return;
      }
      if (document.activeElement === searchInputEl || search) {
        clearSearch();
      }
    }
  }

  function formatContactSummary(c: Contact): string {
    const payload = c.payload || {};
    const lines: string[] = [getDisplayName(c)];
    const org = getOrganization(payload);
    if (org.title || org.org) {
      lines.push([org.title, org.org].filter(Boolean).join(' • '));
    }
    const email = getPrimaryEmail(payload);
    if (email) lines.push(`Email: ${email}`);
    const phone = getPrimaryPhone(payload);
    if (phone) lines.push(`Phone: ${phone}`);
    const address = getPrimaryAddress(payload);
    if (address) lines.push(`Address: ${address}`);
    const notes = getNotes(payload);
    if (notes) lines.push(`Notes: ${notes}`);
    return lines.join('\n');
  }

  async function handleGlobalContextMenu(e: MouseEvent) {
    // 1. Strictly suppress the default Windows / WebView2 context menu everywhere
    e.preventDefault();

    const target = e.target as HTMLElement | null;
    if (!target) return;

    const items: ContextMenuItem[] = [];
    let header: string | undefined;
    let subHeader: string | undefined;

    // 2. Input or Textarea Context
    const isInput = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
    if (isInput) {
      const inputEl = target as HTMLInputElement | HTMLTextAreaElement;
      const selStart = inputEl.selectionStart ?? 0;
      const selEnd = inputEl.selectionEnd ?? 0;
      const hasSelection = selStart !== selEnd;
      const isReadonly = inputEl.readOnly || inputEl.disabled;
      const hasValue = Boolean(inputEl.value && inputEl.value.length > 0);

      header = inputEl.placeholder || (inputEl instanceof HTMLInputElement && inputEl.type === 'search' ? 'Search' : 'Text Input');

      items.push({
        id: 'input-cut',
        label: 'Cut',
        icon: 'content_cut',
        shortcut: 'Ctrl+X',
        disabled: !hasSelection || isReadonly,
        action: async () => {
          const text = inputEl.value.substring(selStart, selEnd);
          await navigator.clipboard.writeText(text);
          inputEl.setRangeText('', selStart, selEnd, 'end');
          inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        },
      });

      items.push({
        id: 'input-copy',
        label: 'Copy',
        icon: 'content_copy',
        shortcut: 'Ctrl+C',
        disabled: !hasSelection,
        action: async () => {
          const text = inputEl.value.substring(selStart, selEnd);
          await navigator.clipboard.writeText(text);
        },
      });

      items.push({
        id: 'input-paste',
        label: 'Paste',
        icon: 'content_paste',
        shortcut: 'Ctrl+V',
        disabled: isReadonly,
        action: async () => {
          try {
            const text = await navigator.clipboard.readText();
            inputEl.setRangeText(text, selStart, selEnd, 'end');
            inputEl.dispatchEvent(new Event('input', { bubbles: true }));
          } catch (_) {}
        },
      });

      items.push({
        id: 'input-select-all',
        label: 'Select All',
        icon: 'select_all',
        shortcut: 'Ctrl+A',
        disabled: !hasValue,
        action: () => {
          inputEl.select();
        },
      });

      if (inputEl === searchInputEl || inputEl.classList.contains('topbar-search-input')) {
        items.push({
          id: 'input-clear-search',
          label: 'Clear Search',
          icon: 'backspace',
          divider: true,
          disabled: !hasValue,
          action: () => {
            clearSearch();
          },
        });
      } else {
        items.push({
          id: 'input-clear',
          label: 'Clear',
          icon: 'backspace',
          divider: true,
          disabled: !hasValue || isReadonly,
          action: () => {
            inputEl.value = '';
            inputEl.dispatchEvent(new Event('input', { bubbles: true }));
          },
        });
      }

      openContextMenu({ x: e.clientX, y: e.clientY, items, header, subHeader });
      return;
    }

    // 3. Active Text Selection across the page
    const selection = window.getSelection();
    const selectedText = selection ? selection.toString().trim() : '';

    // 4. Contact Item Context (Contacts Table Row or Search Result Item)
    const contactRowEl = target.closest('[data-contact-res]') as HTMLElement | null;
    const contactRes = contactRowEl?.dataset.contactRes;
    const contact = contactRes ? allSnapshotContacts.find((c) => c.resource_name === contactRes) : undefined;

    if (contact) {
      const displayName = getDisplayName(contact);
      const email = getPrimaryEmail(contact.payload);
      const phone = getPrimaryPhone(contact.payload);
      header = displayName;
      subHeader = email || phone || `v${contact.version}`;

      if (selectedText) {
        items.push({
          id: 'copy-selection',
          label: `Copy "${selectedText.length > 20 ? selectedText.slice(0, 18) + '…' : selectedText}"`,
          icon: 'content_copy',
          shortcut: 'Ctrl+C',
          action: async () => {
            await navigator.clipboard.writeText(selectedText);
          },
        });
      }

      items.push({
        id: 'contact-view',
        label: 'View Contact Details',
        icon: 'person',
        action: () => {
          selectContact(contact);
          if (pageView !== 'contacts') navigate('contacts');
        },
      });

      items.push({
        id: 'contact-copy-name',
        label: 'Copy Name',
        icon: 'badge',
        divider: true,
        action: async () => {
          await copyFieldValue('name', displayName);
        },
      });

      if (email) {
        items.push({
          id: 'contact-copy-email',
          label: 'Copy Email Address',
          icon: 'mail',
          action: async () => {
            await copyFieldValue('email', email);
          },
        });
        items.push({
          id: 'contact-send-email',
          label: 'Send Email',
          icon: 'send',
          action: () => {
            window.open('mailto:' + email, '_blank');
          },
        });
      }

      if (phone) {
        items.push({
          id: 'contact-copy-phone',
          label: 'Copy Phone Number',
          icon: 'call',
          action: async () => {
            await copyFieldValue('phone', phone);
          },
        });
      }

      items.push({
        id: 'contact-copy-all',
        label: 'Copy All Details',
        icon: 'content_copy',
        action: async () => {
          const text = formatContactSummary(contact);
          await copyFieldValue('all', text);
        },
      });

      items.push({
        id: 'contact-export-csv',
        label: 'Export as Google CSV',
        icon: 'table_chart',
        divider: true,
        action: () => {
          downloadContactCsv(contact);
        },
      });

      items.push({
        id: 'contact-export-vcf',
        label: 'Export as vCard (.vcf)',
        icon: 'contact_page',
        action: () => {
          downloadContactVcf(contact);
        },
      });

      items.push({
        id: 'contact-export-json',
        label: 'Export as JSON',
        icon: 'download',
        action: () => {
          downloadContactJson(contact);
        },
      });

      items.push({
        id: 'contact-view-raw',
        label: 'View Raw JSON Payload',
        icon: 'data_object',
        divider: true,
        action: () => {
          detail = contact;
          showRawDataModal = true;
        },
      });

      openContextMenu({ x: e.clientX, y: e.clientY, items, header, subHeader });
      return;
    }

    // 5. Contact Detail View Context
    if (detail && target.closest('.detail-view')) {
      const displayName = getDisplayName(detail);
      const emailTarget = target.closest('[data-context="email"]') as HTMLElement | null;
      const phoneTarget = target.closest('[data-context="phone"]') as HTMLElement | null;
      const addressTarget = target.closest('[data-context="address"], .field-address-link') as HTMLElement | null;
      const avatarTarget = target.closest('.hero-avatar') as HTMLElement | null;
      const notesTarget = target.closest('[data-context="notes"]') as HTMLElement | null;

      if (emailTarget) {
        const emailVal = emailTarget.dataset.emailValue || getPrimaryEmail(detail.payload);
        header = emailVal;
        subHeader = 'Email Address';
        items.push({
          id: 'detail-send-email',
          label: 'Send Email',
          icon: 'mail',
          action: () => {
            window.open('mailto:' + emailVal, '_blank');
          },
        });
        items.push({
          id: 'detail-copy-email',
          label: 'Copy Email Address',
          icon: 'content_copy',
          action: async () => {
            await copyFieldValue('email', emailVal);
          },
        });
        items.push({
          id: 'detail-copy-contact',
          label: 'Copy All Contact Details',
          icon: 'badge',
          divider: true,
          action: async () => {
            await copyFieldValue('all', formatContactSummary(detail!));
          },
        });
        openContextMenu({ x: e.clientX, y: e.clientY, items, header, subHeader });
        return;
      }

      if (phoneTarget) {
        const phoneVal = phoneTarget.dataset.phoneValue || getPrimaryPhone(detail.payload);
        header = phoneVal;
        subHeader = 'Phone Number';
        items.push({
          id: 'detail-call-phone',
          label: 'Call Number',
          icon: 'call',
          action: () => {
            window.open('tel:' + phoneVal, '_blank');
          },
        });
        items.push({
          id: 'detail-copy-phone',
          label: 'Copy Phone Number',
          icon: 'content_copy',
          action: async () => {
            await copyFieldValue('phone', phoneVal);
          },
        });
        items.push({
          id: 'detail-copy-contact',
          label: 'Copy All Contact Details',
          icon: 'badge',
          divider: true,
          action: async () => {
            await copyFieldValue('all', formatContactSummary(detail!));
          },
        });
        openContextMenu({ x: e.clientX, y: e.clientY, items, header, subHeader });
        return;
      }

      if (addressTarget) {
        const addrVal = addressTarget.dataset.addressValue || getPrimaryAddress(detail.payload);
        header = addrVal;
        subHeader = 'Address';
        items.push({
          id: 'detail-maps-open',
          label: 'Open in Google Maps',
          icon: 'map',
          action: () => {
            window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addrVal)}`, '_blank');
          },
        });
        items.push({
          id: 'detail-copy-address',
          label: 'Copy Address',
          icon: 'content_copy',
          action: async () => {
            await copyFieldValue('address', addrVal);
          },
        });
        openContextMenu({ x: e.clientX, y: e.clientY, items, header, subHeader });
        return;
      }

      if (avatarTarget) {
        header = displayName;
        subHeader = 'Profile Photos';
        items.push({
          id: 'detail-view-photos',
          label: 'View Photos Gallery',
          icon: 'photo_library',
          action: () => {
            showPhotosModal = true;
          },
        });
        const avatarSrc = getAvatarSource(detail, media);
        if (avatarSrc && avatarSrc.startsWith('http')) {
          items.push({
            id: 'detail-copy-photo-url',
            label: 'Copy Photo URL',
            icon: 'link',
            action: async () => {
              await navigator.clipboard.writeText(avatarSrc);
            },
          });
        }
        openContextMenu({ x: e.clientX, y: e.clientY, items, header, subHeader });
        return;
      }

      if (notesTarget) {
        const notesVal = notesTarget.dataset.notesValue || getNotes(detail.payload);
        header = 'Notes';
        subHeader = displayName;
        items.push({
          id: 'detail-copy-notes',
          label: 'Copy Notes',
          icon: 'content_copy',
          action: async () => {
            await copyFieldValue('notes', notesVal);
          },
        });
        openContextMenu({ x: e.clientX, y: e.clientY, items, header, subHeader });
        return;
      }

      // General Detail View Context
      header = displayName;
      subHeader = `v${detail.version} • ${getPrimaryEmail(detail.payload) || ''}`;

      if (selectedText) {
        items.push({
          id: 'copy-selection',
          label: `Copy "${selectedText.length > 20 ? selectedText.slice(0, 18) + '…' : selectedText}"`,
          icon: 'content_copy',
          shortcut: 'Ctrl+C',
          action: async () => {
            await navigator.clipboard.writeText(selectedText);
          },
        });
      }

      items.push({
        id: 'detail-copy-name',
        label: 'Copy Name',
        icon: 'badge',
        action: async () => {
          await copyFieldValue('name', displayName);
        },
      });

      items.push({
        id: 'detail-copy-all',
        label: 'Copy All Details',
        icon: 'content_copy',
        action: async () => {
          await copyFieldValue('all', formatContactSummary(detail!));
        },
      });

      items.push({
        id: 'detail-view-payload',
        label: 'View Raw Payload',
        icon: 'data_object',
        divider: true,
        action: () => {
          showRawDataModal = true;
        },
      });

      items.push({
        id: 'detail-export-csv',
        label: 'Export Google CSV',
        icon: 'table_chart',
        action: () => {
          downloadContactCsv(detail!);
        },
      });

      items.push({
        id: 'detail-export-vcf',
        label: 'Export vCard',
        icon: 'contact_page',
        action: () => {
          downloadContactVcf(detail!);
        },
      });

      items.push({
        id: 'detail-export-json',
        label: 'Export JSON',
        icon: 'download',
        action: () => {
          downloadContactJson(detail!);
        },
      });

      items.push({
        id: 'detail-print',
        label: 'Print Contact',
        icon: 'print',
        divider: true,
        action: () => {
          window.print();
        },
      });

      items.push({
        id: 'detail-back',
        label: 'Back to Contacts List',
        icon: 'arrow_back',
        action: () => {
          detail = undefined;
        },
      });

      openContextMenu({ x: e.clientX, y: e.clientY, items, header, subHeader });
      return;
    }

    // 6. Snapshot Item Context (inside snapshot dropdown)
    const snapshotEl = target.closest('[data-snapshot-seq]') as HTMLElement | null;
    if (snapshotEl) {
      const seqStr = snapshotEl.dataset.snapshotSeq;
      const seq = seqStr ? parseInt(seqStr, 10) : 0;
      if (seq > 0) {
        header = `Snapshot #${seq}`;
        subHeader = 'Archive Snapshot';

        items.push({
          id: 'snapshot-switch',
          label: `Switch to Snapshot #${seq}`,
          icon: 'history',
          disabled: capture?.sequence === seq,
          action: () => {
            changeCapture(seq);
            showSnapshotDropdown = false;
          },
        });

        items.push({
          id: 'snapshot-compare-prev',
          label: 'Compare with Prior Snapshot',
          icon: 'compare_arrows',
          action: () => {
            compareSnapshotWithPrior(seq);
            navigate('changes');
            showSnapshotDropdown = false;
          },
        });
        items.push({ id: 'snapshot-delete', label: `Delete Snapshot #${seq}`, icon: 'delete', disabled: busy || archiveActionBusy, action: () => {
          error = '';
          deleteSnapshotTarget = captures.find((item) => item.sequence === seq) ?? null;
          showSnapshotDropdown = false;
        } });

        openContextMenu({ x: e.clientX, y: e.clientY, items, header, subHeader });
        return;
      }
    }

    // 7. Change Card Context (inside Changes or Changelog tab)
    const changeCardEl = target.closest('[data-change-card]') as HTMLElement | null;
    if (changeCardEl) {
      const changeRes = changeCardEl.dataset.changeRes;
      const changeName = changeCardEl.dataset.changeName || 'Contact Change';
      header = changeName;
      subHeader = 'Snapshot Change Record';

      const matchedContact = changeRes ? allSnapshotContacts.find((c) => c.resource_name === changeRes) : undefined;
      if (matchedContact) {
        items.push({
          id: 'change-view-contact',
          label: 'View Current Contact Details',
          icon: 'person',
          action: () => {
            selectContact(matchedContact);
            navigate('contacts');
          },
        });
      }

      items.push({
        id: 'change-copy-name',
        label: 'Copy Name',
        icon: 'badge',
        action: async () => {
          await navigator.clipboard.writeText(changeName);
        },
      });

      items.push({
        id: 'change-copy-res',
        label: 'Copy Resource ID',
        icon: 'tag',
        action: async () => {
          if (changeRes) await navigator.clipboard.writeText(changeRes);
        },
      });

      openContextMenu({ x: e.clientX, y: e.clientY, items, header, subHeader });
      return;
    }

    // 8. Label Item Context
    const labelItemEl = target.closest('[data-label-res]') as HTMLElement | null;
    if (labelItemEl) {
      const labelRes = labelItemEl.dataset.labelRes!;
      const labelName = labelItemEl.dataset.labelName || 'Label';
      header = labelName;
      subHeader = 'Contact Label';

      const isFiltered = selectedGroups.includes(labelRes);
      items.push({
        id: 'label-toggle',
        label: isFiltered ? `Remove from filter: "${labelName}"` : `Filter contacts by "${labelName}"`,
        icon: 'label',
        action: () => {
          toggleLabelFilter(labelRes);
          navigate('contacts');
        },
      });

      items.push({
        id: 'label-isolate',
        label: `Filter only "${labelName}"`,
        icon: 'filter_alt',
        action: () => {
          isolateLabelFilter(labelRes);
          navigate('contacts');
        },
      });

      items.push({
        id: 'label-copy-name',
        label: 'Copy Label Name',
        icon: 'content_copy',
        divider: true,
        action: async () => {
          await navigator.clipboard.writeText(labelName);
        },
      });

      if (selectedGroups.length > 0) {
        items.push({
          id: 'label-clear',
          label: 'Clear All Label Filters',
          icon: 'label_off',
          action: () => {
            clearLabelFilter();
          },
        });
      }

      openContextMenu({ x: e.clientX, y: e.clientY, items, header, subHeader });
      return;
    }

    // 9. General Text Selection without an element context
    if (selectedText) {
      header = 'Text Selection';
      subHeader = `${selectedText.length} characters`;

      items.push({
        id: 'sel-copy',
        label: `Copy "${selectedText.length > 24 ? selectedText.slice(0, 22) + '…' : selectedText}"`,
        icon: 'content_copy',
        shortcut: 'Ctrl+C',
        action: async () => {
          await navigator.clipboard.writeText(selectedText);
        },
      });

      items.push({
        id: 'sel-search',
        label: `Search in Contacts for "${selectedText.length > 20 ? selectedText.slice(0, 18) + '…' : selectedText}"`,
        icon: 'search',
        action: () => {
          search = selectedText;
          navigate('contacts');
          onSearchInput();
        },
      });

      items.push({
        id: 'sel-divider',
        divider: true,
        label: '',
      });
    }

    // 10. Global / Fallback Default Context
    header = header || 'Contact History';
    subHeader = subHeader || `v${appVersion} • ${accountProfile?.name || selected?.email || 'Local Archive'}`;

    items.push({
      id: 'global-capture',
      label: 'Take Snapshot Now',
      icon: 'sync',
      shortcut: 'Ctrl+R',
      disabled: busy || !selected,
      action: () => {
        captureNow();
      },
    });

    items.push({
      id: 'global-import',
      label: 'Import Contacts (CSV)...',
      icon: 'upload',
      disabled: busy || !selected,
      action: () => {
        importCsv();
      },
    });

    items.push({
      id: 'global-export-snapshot',
      label: 'Export Current Snapshot (CSV)...',
      icon: 'table_chart',
      disabled: !capture || capture.contact_count === 0,
      action: () => {
        exportSelected('csv');
      },
    });

    items.push({
      id: 'global-nav-contacts',
      label: 'Go to Contacts',
      icon: 'person',
      divider: true,
      action: () => {
        detail = undefined;
        navigate('contacts');
      },
    });

    items.push({
      id: 'global-nav-changes',
      label: 'Go to Changes',
      icon: 'history',
      action: () => {
        navigate('changes');
      },
    });

    items.push({
      id: 'global-settings',
      label: 'Settings & Preferences',
      icon: 'settings',
      shortcut: 'Ctrl+,',
      action: () => {
        showSettingsModal = true;
      },
    });

    items.push({
      id: 'global-theme',
      label: preferences.theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode',
      icon: preferences.theme === 'dark' ? 'light_mode' : 'dark_mode',
      divider: true,
      action: () => {
        const nextTheme = preferences.theme === 'dark' ? 'light' : 'dark';
        updatePreferences({ theme: nextTheme });
        applyPreferences(preferences);
      },
    });

    items.push({
      id: 'global-refresh',
      label: 'Refresh Data',
      icon: 'refresh',
      action: () => {
        refreshContacts();
        refreshGroups();
        refreshChanges();
      },
    });

    openContextMenu({ x: e.clientX, y: e.clientY, items, header, subHeader });
  }

  onMount(async () => {
    window.addEventListener('keydown', handleGlobalKeyDown);
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('mouseup', handleNativeNavigation);
    window.addEventListener('click', handleWindowClick);
    window.addEventListener('contextmenu', handleGlobalContextMenu);
    colorScheme.addEventListener('change', syncSystemTheme);
    api.getScheduleConfig()
      .then((cfg) => {
        scheduleConfig = cfg;
        scheduled = cfg.enabled;
        scheduleReady = true;
      })
      .catch(() => {
        api.scheduleState()
          .then((val) => {
            scheduled = val;
            scheduleConfig.enabled = val;
            scheduleReady = true;
          })
          .catch(() => {
            scheduleReady = true;
          });
      });
    try {
      const savedCols = localStorage.getItem('contacts_active_cols');
      if (savedCols) {
        const parsed = JSON.parse(savedCols);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const validKeys: ColumnKey[] = ['name', 'job', 'email', 'phone', 'birthday', 'labels', 'address', 'notes', 'org', 'title'];
          const filtered = parsed.filter((k: any) => validKeys.includes(k) && k !== 'name');
          activeColKeys = ['name', ...filtered];
        }
      }
      // Ensure at least 4 customizable slots (5 total) like Google Contacts
      const defaults: ColumnKey[] = ['email', 'phone', 'birthday', 'labels', 'job', 'address'];
      for (const defKey of defaults) {
        if (activeColKeys.length >= 5) break;
        if (!activeColKeys.includes(defKey)) {
          activeColKeys = [...activeColKeys, defKey];
        }
      }
      const savedWidths = localStorage.getItem('contacts_col_widths');
      if (savedWidths) colWidths = { ...colWidths, ...JSON.parse(savedWidths) };
      const savedSortField = localStorage.getItem('contacts_sort_field');
      if (savedSortField === 'first' || savedSortField === 'last') nameSortField = savedSortField;
      const savedSortDir = localStorage.getItem('contacts_sort_dir');
      if (savedSortDir === 'asc' || savedSortDir === 'desc') nameSortDirection = savedSortDir;
      const savedSidebarWidth = localStorage.getItem('sidebar_width');
      if (savedSidebarWidth) {
        const sw = parseInt(savedSidebarWidth, 10);
        if (!isNaN(sw) && sw >= 220 && sw <= 480) {
          sidebarWidth = sw;
        }
      }
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
    const existingEntry = window.history.state as NavigationEntry | null;
    if (existingEntry?.contactHistoryNavigation) {
      navigationIndex = existingEntry.index;
      navigationMaxIndex = existingEntry.index;
      await restoreNavigation(existingEntry);
    } else {
      window.history.replaceState(currentNavigation(), '');
    }
    navigationReady = true;

    // Listen for real-time capture progress
    window.addEventListener('resize', updateStickyState);
    unlistenProgress = await listenCaptureProgress((progress) => {
      captureProgress = progress;
    });
  });

  onDestroy(() => {
    unlistenProgress?.();
    window.removeEventListener('keydown', handleGlobalKeyDown);
    window.removeEventListener('popstate', handlePopState);
    window.removeEventListener('mouseup', handleNativeNavigation);
    window.removeEventListener('click', handleWindowClick);
    window.removeEventListener('contextmenu', handleGlobalContextMenu);
    window.removeEventListener('resize', updateStickyState);
    colorScheme.removeEventListener('change', syncSystemTheme);
  });
</script>

<div class="app-container">
  <!-- Native Custom Frameless Topbar -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <header class="topbar" onmousedown={onTopbarMouseDown}>
    <div class="topbar-left" data-tauri-drag-region>
      <button class="icon-btn" aria-label="Back" title="Back (Alt+Left)" disabled={navigationIndex === 0} onclick={goBack}>
        <span class="material-symbols-outlined">arrow_back</span>
      </button>
      <button class="icon-btn" aria-label="Forward" title="Forward (Alt+Right)" disabled={navigationIndex >= navigationMaxIndex} onclick={goForward}>
        <span class="material-symbols-outlined">arrow_forward</span>
      </button>
      {#if hasData && pageView !== 'onboarding'}
        <button
          class="icon-btn"
          data-tooltip="Main menu"
          data-tooltip-pos="bottom-left"
          aria-label="Main menu"
          onclick={() => sidebarCollapsed = !sidebarCollapsed}
        >
          <span class="material-symbols-outlined">menu</span>
        </button>
      {/if}
      <button
        class="app-brand"
        aria-label="Contact History home"
        data-tooltip="Contact History home"
        style="background: none; border: none; padding: 0; text-align: left;"
        onclick={() => { if (hasData) { selectLabelFilter(null); navigate('contacts'); } }}
      >
        <img class="brand-logo" src={brandLogo} alt="" />
        <span class="app-title">Contact History</span>
      </button>
    </div>

    <!-- Draggable area around search with ample space -->
    <div class="topbar-drag-area" data-tauri-drag-region>
      <div class="topbar-drag-spacer" data-tauri-drag-region></div>
      {#if hasData && pageView !== 'onboarding'}
        <div class="topbar-search-container {searchDropdownOpen && search.trim() ? 'has-dropdown' : ''}" data-tauri-drag-region="false">
          <div class="topbar-search {searchDropdownOpen && search.trim() ? 'dropdown-open' : ''}">
            <span class="material-symbols-outlined search-icon">search</span>
            <input
              type="text"
              class="search-input"
              placeholder="Search contacts"
              aria-label="Search contacts"
              bind:this={searchInputEl}
              bind:value={search}
              oninput={onSearchInput}
              onfocus={onSearchFocus}
              onclick={onSearchFocus}
              onkeydown={onSearchKeyDown}
            />
            {#if search}
              <button class="search-clear-btn" aria-label="Clear search" data-tooltip="Clear search" onclick={clearSearch}>
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
                  data-contact-res={contact.resource_name}
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
      {/if}
      <div class="topbar-drag-spacer" data-tauri-drag-region></div>
    </div>

    <!-- Topbar Actions & Window Controls -->
    <div class="topbar-right">
      {#if captures.length > 0 && capture}
        <div class="snapshot-dropdown-container">
          <button
            class="snapshot-chip"
            class:active={showSnapshotDropdown}
            onclick={() => { showSnapshotDropdown = !showSnapshotDropdown; showAccountMenu = false; }}
            data-tooltip="Snapshot timeline"
            aria-haspopup="true"
            aria-expanded={showSnapshotDropdown}
          >
            <span class="material-symbols-outlined">history</span>
            <span>Snapshot #{capture.sequence}</span>
            <span class="material-symbols-outlined" style="font-size: 16px;">
              {showSnapshotDropdown ? 'arrow_drop_up' : 'arrow_drop_down'}
            </span>
          </button>

          {#if showSnapshotDropdown}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="menu-scrim"
              style="position: fixed; inset: 0; z-index: 101; background: transparent;"
              onclick={() => showSnapshotDropdown = false}
              role="presentation"
            ></div>
            <div class="popover snapshot-popover" role="group" aria-label="Archive snapshots">
              <div class="popover-heading">
                <span>Archive snapshots</span>
                <span class="popover-count-tag">{captures.length} total</span>
              </div>
              <div class="snapshot-popover-list">
                {#each captures as cap}
                  <div class="snapshot-popover-row">
                  <button
                    type="button"
                    class="snapshot-popover-item"
                    class:selected={capture?.sequence === cap.sequence}
                    data-snapshot-seq={cap.sequence}
                    onclick={() => { changeCapture(cap.sequence); showSnapshotDropdown = false; }}
                    aria-pressed={capture?.sequence === cap.sequence}
                  >
                    <div class="snapshot-item-left">
                      <div class="snapshot-item-title">Snapshot #{cap.sequence}</div>
                      <div class="snapshot-item-date">{formatCaptureTime(cap.committed_at)}</div>
                    </div>
                    <div class="snapshot-item-right">
                      <span class="snapshot-item-badge">{cap.contact_count} contacts</span>
                      {#if capture?.sequence === cap.sequence}
                        <span class="material-symbols-outlined snapshot-active-check">check</span>
                      {/if}
                    </div>
                  </button>
                  <button class="snapshot-delete-btn" aria-label={`Delete Snapshot #${cap.sequence}`} title={`Delete Snapshot #${cap.sequence}`} disabled={busy || archiveActionBusy} onclick={() => { error = ''; deleteSnapshotTarget = cap; showSnapshotDropdown = false; }}><span class="material-symbols-outlined">delete</span></button>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {/if}

      <button class="icon-btn" onclick={() => showSettingsModal = true} data-tooltip="Settings" aria-label="Settings">
        <span class="material-symbols-outlined">settings</span>
      </button>

      {#if selected}
        <button
          class="account-avatar-btn"
          aria-expanded={showAccountMenu}
          aria-haspopup="true"
          data-tooltip={accountProfile?.name ? `${accountProfile.name} (${selected.email})` : selected.email}
          aria-label={accountProfile?.name ? `${accountProfile.name} (${selected.email})` : selected.email}
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

      <div class="topbar-drag-spacer-sm" data-tauri-drag-region></div>

      <!-- Windows Controls -->
      <div class="window-controls">
        <button class="win-btn" onclick={winMinimize} data-tooltip="Minimize" aria-label="Minimize">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10" /></svg>
        </button>
        <button class="win-btn" onclick={winToggleMaximize} data-tooltip={isMaximized ? 'Restore' : 'Maximize'} aria-label={isMaximized ? 'Restore' : 'Maximize'}>
          {#if isMaximized}
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3h8v8h-2M3 5h8v8H3z" /></svg>
          {:else}
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3h10v10H3z" /></svg>
          {/if}
        </button>
        <button class="win-btn win-close" onclick={winClose} data-tooltip="Close" aria-label="Close">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9m0-9l-9 9" /></svg>
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
    {#if hasData && pageView !== 'onboarding'}
      <!-- Google Contacts Sidebar -->
      <aside class="sidebar" class:collapsed={sidebarCollapsed}>
      <!-- Create / Capture Button -->
      <div class="create-btn-container">
        <button
          class="capture-btn"
          class:busy
          onclick={captureNow}
          disabled={busy || !selected}
          data-tooltip={busy ? 'Capturing snapshot...' : 'Capture snapshot from Google Contacts'}
        >
          <span class="material-symbols-outlined capture-icon" class:spin={busy}>
            {busy ? 'sync' : 'photo_camera'}
          </span>
          <span>{busy ? 'Capturing...' : 'Capture now'}</span>
        </button>
      </div>

      <!-- Main Navigation Items -->
      <div class="sidebar-section">
        <button
          class="nav-item"
          class:active={pageView === 'contacts' && selectedGroups.length === 0 && !detail}
          onclick={() => { clearLabelFilter(); navigate('contacts'); }}
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
        <button
          class="nav-item"
          onclick={() => exportSelected('csv')}
          disabled={!capture || capture.contact_count === 0}
          title={!capture || capture.contact_count === 0 ? 'No contact data to export' : 'Export contacts to CSV'}
        >
          <span class="material-symbols-outlined nav-icon">download</span>
          <span class="nav-label">Export CSV</span>
        </button>
        <button
          class="nav-item"
          onclick={openPhotoExport}
          disabled={!capture || capture.contact_count === 0}
          title={!capture || capture.contact_count === 0 ? 'No contact data to export' : 'Export contact profile photos in highest resolution'}
        >
          <span class="material-symbols-outlined nav-icon">photo_library</span>
          <span class="nav-label">Export Photos</span>
        </button>
        <button
          class="nav-item"
          onclick={backupSelected}
          disabled={!selected || captures.length === 0}
          title={!selected || captures.length === 0 ? 'No archive data to back up' : 'Backup archive'}
        >
          <span class="material-symbols-outlined nav-icon">archive</span>
          <span class="nav-label">Backup archive</span>
        </button>
        <button class="nav-item" onclick={restoreLocal}>
          <span class="material-symbols-outlined nav-icon">unarchive</span>
          <span class="nav-label">Restore archive</span>
        </button>
      </div>

      <!-- Labels Section -->
      {#if groups.length > 0}
        <div class="sidebar-section" class:has-selected-labels={selectedGroups.length > 0}>
          <div class="sidebar-section-header sidebar-section-header-row">
            <div class="sidebar-header-left">
              <span>Labels</span>
              {#if selectedGroups.length > 0}
                <span class="sidebar-header-badge" title="{selectedGroups.length} label{selectedGroups.length > 1 ? 's' : ''} active">
                  {selectedGroups.length === 1 ? '1 active' : `${selectedGroups.length} active`}
                </span>
              {/if}
            </div>
            {#if selectedGroups.length > 0}
              <button
                type="button"
                class="sidebar-header-clear"
                onclick={clearLabelFilter}
                title="Clear all selected labels"
                aria-label="Clear all selected labels"
              >
                Clear
              </button>
            {/if}
          </div>

          {#each groups as group}
            {@const isSelected = selectedGroups.includes(group.resource_name)}
            <div
              class="nav-item label-nav-item"
              class:active={pageView === 'contacts' && isSelected}
              class:is-selected={isSelected}
              data-label-res={group.resource_name}
              data-label-name={group.name}
              onclick={() => { toggleLabelFilter(group.resource_name); navigate('contacts'); }}
              onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleLabelFilter(group.resource_name); navigate('contacts'); } }}
              role="checkbox"
              aria-checked={isSelected}
              tabindex="0"
              title="{group.name} — Click to toggle filter"
            >
              <span class="material-symbols-outlined nav-checkbox" class:checked={isSelected}>
                {isSelected ? 'check_box' : 'check_box_outline_blank'}
              </span>
              <span class="material-symbols-outlined nav-icon" class:icon-filled={isSelected}>
                label
              </span>
              <span class="nav-label">{group.name}</span>
              {#if group.member_count !== null && group.member_count !== undefined}
                <span class="nav-count">{group.member_count}</span>
              {/if}
              <button
                type="button"
                class="only-btn"
                onclick={(e) => {
                  e.stopPropagation();
                  isolateLabelFilter(group.resource_name);
                  navigate('contacts');
                }}
                title="Only show {group.name}"
                aria-label="Only show {group.name}"
              >
                Only
              </button>
            </div>
          {/each}
        </div>
      {/if}

    </aside>

    <!-- Main View Workspace -->
    <main class="main-area">
      {#if pageView === 'contacts'}
        {#if detail}
          <div class="detail-container">
            <!-- ── Top Navigation Row (Frozen Row pinned to top, like Google Contacts) ── -->
            <div
              class="detail-top-bar"
              class:is-scrolled={isScrolled}
            >
              <div
                class="detail-top-nav"
                bind:this={topNavEl}
              >
                <div class="detail-top-nav-left">
                  <button class="icon-btn" onclick={() => { detail = undefined; recordNavigation(); }} data-tooltip="Back to list" data-tooltip-pos="bottom" aria-label="Back to list">
                    <span class="material-symbols-outlined">arrow_back</span>
                  </button>
                  <div class="detail-sticky-profile" class:visible={showStickyName}>
                    <div
                      class="detail-sticky-avatar"
                      style="background-color: {getAvatarColor(getDisplayName(detail))};"
                      aria-hidden="true"
                    >
                      {#if getAvatarSource(detail, media)}
                        <img
                          src={getAvatarSource(detail, media)}
                          alt=""
                          class="detail-sticky-avatar-img"
                          referrerpolicy="no-referrer"
                          onerror={(e) => { (e.currentTarget as HTMLElement).classList.add('avatar-img-failed'); }}
                          onload={(e) => { (e.currentTarget as HTMLElement).classList.remove('avatar-img-failed'); }}
                        />
                      {/if}
                      <span class="detail-sticky-avatar-initials">{getInitials(getDisplayName(detail))}</span>
                    </div>
                    <span class="detail-sticky-name" title={getDisplayName(detail)}>
                      {getDisplayName(detail)}
                    </span>
                  </div>
                </div>
                <div class="detail-nav-actions">
                  {#if isFavourite(detail)}
                    <span class="star-indicator" data-tooltip="Starred contact" data-tooltip-pos="bottom">
                      <span class="material-symbols-outlined icon-filled" style="color: var(--favorite); font-size: 22px;">star</span>
                    </span>
                  {/if}
                  {#if previewSequence !== null}
                    <button class="detail-preview-reset" onclick={restoreContactRevision} title="Return to selected snapshot">
                      <span class="material-symbols-outlined">undo</span>
                      <span>Previewing snapshot #{previewSequence} · Back to selected</span>
                    </button>
                  {/if}
                  <div class="detail-version-pill" data-tooltip="Contact revision #{detail.version}" data-tooltip-pos="bottom">
                    <span class="material-symbols-outlined" style="font-size: 15px;">history</span>
                    <span>v{detail.version}</span>
                  </div>
                  <!-- Three-dots More Options Menu -->
                  <div class="detail-menu-container">
                    <button
                      class="icon-btn"
                      onclick={() => { showDetailMenu = !showDetailMenu; showPhotoQualityMenu = false; }}
                      aria-label="More options"
                      aria-haspopup="true"
                      aria-expanded={showDetailMenu}
                      data-tooltip="More options"
                      data-tooltip-pos="bottom"
                    >
                      <span class="material-symbols-outlined">more_vert</span>
                    </button>
                    {#if showDetailMenu}
                      <div class="detail-menu" role="menu">
                        <button class="detail-menu-item" role="menuitem" onclick={() => { showDetailMenu = false; showRawDataModal = true; }}>
                          <span class="material-symbols-outlined">data_object</span>
                          <span>View raw payload</span>
                        </button>
                        <button class="detail-menu-item" role="menuitem" onclick={() => { showDetailMenu = false; downloadContactCsv(detail!); }}>
                          <span class="material-symbols-outlined">table_chart</span>
                          <span>Export Google CSV</span>
                        </button>
                        <button class="detail-menu-item" role="menuitem" onclick={() => { showDetailMenu = false; downloadContactVcf(detail!); }}>
                          <span class="material-symbols-outlined">contact_page</span>
                          <span>Export vCard</span>
                        </button>
                        <button class="detail-menu-item" role="menuitem" onclick={() => { showDetailMenu = false; downloadContactJson(detail!); }}>
                          <span class="material-symbols-outlined">download</span>
                          <span>Export JSON</span>
                        </button>
                        <div class="detail-photo-trigger">
                          <button class="detail-menu-item detail-photo-main" role="menuitem" disabled={!detailPhotoUrl() || photoDownloadBusy} title={!detailPhotoUrl() ? 'No photo available for this contact' : 'Download Photo at High quality'} onclick={() => downloadDetailPhoto(true)}>
                            <span class="material-symbols-outlined">image</span>
                            <span>Download Photo</span>
                          </button>
                          <button class="detail-photo-expand" type="button" aria-label="Choose Photo quality" aria-expanded={showPhotoQualityMenu} aria-haspopup="true" disabled={!detailPhotoUrl()} onclick={openPhotoQualityMenu}>
                            <span class="material-symbols-outlined">chevron_right</span>
                          </button>
                        </div>
                        {#if showPhotoQualityMenu}
                          <div class="detail-photo-submenu" role="group" aria-label="Photo download quality">
                            {#if photoQualityLoading}
                              <div class="detail-photo-status">Checking available sizes…</div>
                              <div class="detail-photo-progress" role="progressbar" aria-label="Checking available photo sizes" aria-valuetext="Checking available sizes">
                                <div class="detail-photo-progress-fill"></div>
                              </div>
                            {:else if photoQualityInfo}
                              <div class="detail-photo-heading">Photo quality</div>
                              <div class="detail-photo-options" role="radiogroup" aria-label="Photo quality">
                                <button class="detail-photo-option" class:selected={photoQualitySelection === null} role="radio" aria-checked={photoQualitySelection === null} onclick={() => photoQualitySelection = null}>
                                  <span>Original</span><small>{photoQualityInfo.width} × {photoQualityInfo.height} px</small>
                                </button>
                                {#each [{ label: 'High', size: 512 }, { label: 'Medium', size: 256 }, { label: 'Low', size: 96 }] as quality}
                                  {@const available = photoQualityInfo.resizable && Math.max(photoQualityInfo.width, photoQualityInfo.height) >= quality.size}
                                  <button class="detail-photo-option" class:selected={photoQualitySelection === quality.size} role="radio" aria-checked={photoQualitySelection === quality.size} disabled={!available} title={available ? `${quality.size} pixels on the longest side` : `Requires a photo at least ${quality.size} pixels wide or high`} onclick={() => photoQualitySelection = quality.size}>
                                    <span>{quality.label}</span><small>{quality.size} px</small>
                                  </button>
                                {/each}
                              </div>
                              <button class="detail-photo-save" disabled={photoDownloadBusy} onclick={() => downloadDetailPhoto()}>{photoDownloadBusy ? 'Downloading…' : 'Download Photo'}</button>
                            {/if}
                            {#if photoQualityError}<div class="detail-photo-error" role="alert">{photoQualityError}</div>{/if}
                          </div>
                        {/if}
                        <div class="detail-menu-divider"></div>
                        <button class="detail-menu-item" role="menuitem" onclick={() => { showDetailMenu = false; window.print(); }}>
                          <span class="material-symbols-outlined">print</span>
                          <span>Print</span>
                        </button>
                      </div>
                    {/if}
                  </div>
                </div>
              </div>
            </div>

            <!-- Scrollable Detail Content (scrolls underneath frozen top bar) -->
            <div
              class="detail-view"
              bind:this={detailViewEl}
              onscroll={updateStickyState}
            >
              <!-- Detail Hero Avatar & Names (scrolls naturally) -->
              <div class="detail-hero">
              <button
                type="button"
                class="hero-avatar"
                bind:this={heroAvatarEl}
                onclick={() => showPhotosModal = true}
                aria-label="View photos for {getDisplayName(detail)}"
                data-tooltip="View photos"
                data-tooltip-pos="bottom"
              >
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
                  <div class="hero-avatar-overlay">
                    <span class="material-symbols-outlined">photo_camera</span>
                  </div>
                </button>
                <div class="hero-info">
                  <h1 class="hero-name">{getDisplayName(detail)}</h1>
                  {#if getNickname(detail.payload)}
                    <span class="hero-nickname">{getNickname(detail.payload)}</span>
                  {/if}
                  {#if getOrganization(detail.payload).title || getOrganization(detail.payload).org}
                    {@const organization = getOrganization(detail.payload)}
                    <span class="hero-job-info">{[organization.title, organization.org].filter(Boolean).join(' at ')}</span>
                  {/if}
                </div>
              </div>

              <!-- Action Circles Row with Divider Line -->
              {#if detail.payload}
                {@const primaryEmail = getPrimaryEmail(detail.payload)}
                {@const hasEmail = Boolean(primaryEmail)}
                <div class="hero-actions-container">
                  <div class="hero-action-buttons">
                    <!-- Email -->
                    <div class="action-circle-group">
                      {#if hasEmail}
                        <a href="mailto:{primaryEmail}" class="action-circle-btn" data-tooltip="Send email to {primaryEmail}" data-tooltip-pos="top" aria-label="Send email">
                          <span class="material-symbols-outlined">mail</span>
                        </a>
                      {:else}
                        <div class="action-circle-btn disabled" aria-disabled="true" data-tooltip="No email address" data-tooltip-pos="top" aria-label="Email unavailable">
                          <span class="material-symbols-outlined">mail</span>
                        </div>
                      {/if}
                      <span class="action-circle-label">Email</span>
                    </div>

                    <!-- Schedule -->
                    <div class="action-circle-group">
                      {#if hasEmail}
                        <button type="button" class="action-circle-btn" onclick={() => api.openExternalUrl(`https://calendar.google.com/calendar/r/eventedit?add=${encodeURIComponent(primaryEmail)}`)} data-tooltip="Schedule event with {primaryEmail}" data-tooltip-pos="top" aria-label="Schedule event">
                          <span class="material-symbols-outlined">event</span>
                        </button>
                      {:else}
                        <div class="action-circle-btn disabled" aria-disabled="true" data-tooltip="No email address to schedule" data-tooltip-pos="top" aria-label="Schedule unavailable">
                          <span class="material-symbols-outlined">event</span>
                        </div>
                      {/if}
                      <span class="action-circle-label">Schedule</span>
                    </div>

                    <!-- Chat -->
                    <div class="action-circle-group">
                      {#if hasEmail}
                        <a href="mailto:{primaryEmail}" class="action-circle-btn" data-tooltip="Chat with {primaryEmail}" data-tooltip-pos="top" aria-label="Chat">
                          <span class="material-symbols-outlined">chat</span>
                        </a>
                      {:else}
                        <div class="action-circle-btn disabled" aria-disabled="true" data-tooltip="No email address for chat" data-tooltip-pos="top" aria-label="Chat unavailable">
                          <span class="material-symbols-outlined">chat</span>
                        </div>
                      {/if}
                      <span class="action-circle-label">Chat</span>
                    </div>

                    <!-- Video -->
                    <div class="action-circle-group">
                      {#if hasEmail}
                        <button type="button" class="action-circle-btn" onclick={() => api.openExternalUrl('https://meet.google.com/new')} data-tooltip="Start video meeting" data-tooltip-pos="top" aria-label="Start video meeting">
                          <span class="material-symbols-outlined">videocam</span>
                        </button>
                      {:else}
                        <div class="action-circle-btn disabled" aria-disabled="true" data-tooltip="No video meeting available" data-tooltip-pos="top" aria-label="Video unavailable">
                          <span class="material-symbols-outlined">videocam</span>
                        </div>
                      {/if}
                      <span class="action-circle-label">Video</span>
                    </div>
                  </div>
                  <div class="hero-actions-divider"></div>
                </div>
              {/if}

              <!-- Label Membership Chips Row -->
              {#if getContactLabelItems(detail.payload).length > 0}
                <div class="detail-chips-row">
                  {#each getContactLabelItems(detail.payload) as lbl (lbl.resourceName)}
                    {@const isSelected = selectedGroups.includes(lbl.resourceName)}
                    <button
                      type="button"
                      class="detail-chip"
                      class:active={isSelected}
                      onclick={() => { toggleLabelFilter(lbl.resourceName); navigate('contacts'); }}
                      data-tooltip="{isSelected ? 'Remove from filter: ' : 'Filter by label: '}{lbl.name}"
                      data-tooltip-pos="top"
                      aria-label="{isSelected ? 'Remove from filter: ' : 'Filter by label: '}{lbl.name}"
                    >
                      <span class="material-symbols-outlined">label</span>
                      <span>{lbl.name}</span>
                    </button>
                  {/each}
                </div>
              {/if}


            <!-- Structured Details Cards Grid -->
            <div class="detail-cards-grid">
              <!-- Left Column: Contact Details + Relocated Archive Snapshot -->
              <div class="detail-column-left">
                <div class="detail-card">
                  <h2 class="card-title">Contact details</h2>
                  <div class="field-list">
                    {#if getAllEmails(detail.payload).length === 0}
                      <div class="field-item">
                        <span class="material-symbols-outlined field-icon">mail</span>
                        <div class="field-content">
                          <span class="field-value field-placeholder">Add email</span>
                        </div>
                      </div>
                    {:else}
                      {#each getAllEmails(detail.payload) as email, idx}
                        <div class="field-item" data-context="email" data-email-value={email.value}>
                          <!-- Show icon only on first email row; spacer on subsequent rows -->
                          {#if idx === 0}
                            <span class="material-symbols-outlined field-icon">mail</span>
                          {:else}
                            <span class="field-icon-spacer"></span>
                          {/if}
                          <div class="field-content">
                            <a href="mailto:{email.value}" class="field-value">{email.value}</a>
                            <span class="field-meta">• {email.type}</span>
                            <div class="field-actions">
                              <button
                                class="field-copy-btn"
                                data-tooltip="Copy email"
                                data-tooltip-pos="top"
                                aria-label="Copy email"
                                onclick={() => copyFieldValue(`email-${idx}`, email.value)}
                              >
                                <span class="material-symbols-outlined">content_copy</span>
                              </button>
                              {#if copiedFieldKey === `email-${idx}`}
                                <div class="copy-popup-badge">
                                  <span class="material-symbols-outlined" style="font-size: 13px;">check</span>
                                  <span>Copied!</span>
                                </div>
                              {/if}
                            </div>
                          </div>
                        </div>
                      {/each}
                    {/if}

                    {#each getAllPhones(detail.payload) as phone, idx}
                      <div class="field-item" data-context="phone" data-phone-value={phone.value}>
                        <!-- Show icon only on first phone row; spacer on subsequent rows -->
                        {#if idx === 0}
                          <span class="material-symbols-outlined field-icon">call</span>
                        {:else}
                          <span class="field-icon-spacer"></span>
                        {/if}
                        <div class="field-content">
                          <a href="tel:{phone.value}" class="field-value">{phone.formatted || phone.value}</a>
                          <span class="field-meta">• {phone.type}</span>
                          <div class="field-actions">
                            <button
                              class="field-copy-btn"
                              data-tooltip="Copy phone"
                              data-tooltip-pos="top"
                              aria-label="Copy phone"
                              onclick={() => copyFieldValue(`phone-${idx}`, phone.value)}
                            >
                              <span class="material-symbols-outlined">content_copy</span>
                            </button>
                            {#if copiedFieldKey === `phone-${idx}`}
                              <div class="copy-popup-badge">
                                <span class="material-symbols-outlined" style="font-size: 13px;">check</span>
                                <span>Copied!</span>
                              </div>
                            {/if}
                          </div>
                        </div>
                      </div>
                    {/each}

                    {#if getBirthday(detail.payload)}
                      <div class="field-item">
                        <span class="material-symbols-outlined field-icon">cake</span>
                        <div class="field-content">
                          <span class="field-value text-plain">{getBirthday(detail.payload)}</span>
                          <span class="field-meta">• Birthday</span>
                          <div class="field-actions">
                            <button
                              class="field-copy-btn"
                              data-tooltip="Copy birthday"
                              data-tooltip-pos="top"
                              aria-label="Copy birthday"
                              onclick={() => copyFieldValue('birthday', getBirthday(detail!.payload))}
                            >
                              <span class="material-symbols-outlined">content_copy</span>
                            </button>
                            {#if copiedFieldKey === 'birthday'}
                              <div class="copy-popup-badge">
                                <span class="material-symbols-outlined" style="font-size: 13px;">check</span>
                                <span>Copied!</span>
                              </div>
                            {/if}
                          </div>
                        </div>
                      </div>
                    {/if}

                    {#if getNickname(detail.payload)}
                      <div class="field-item">
                        <span class="material-symbols-outlined field-icon">person</span>
                        <div class="field-content">
                          <span class="field-value text-plain">{getNickname(detail.payload)}</span>
                          <span class="field-meta">• Nickname</span>
                          <div class="field-actions">
                            <button
                              class="field-copy-btn"
                              data-tooltip="Copy nickname"
                              data-tooltip-pos="top"
                              aria-label="Copy nickname"
                              onclick={() => copyFieldValue('nickname', getNickname(detail!.payload))}
                            >
                              <span class="material-symbols-outlined">content_copy</span>
                            </button>
                            {#if copiedFieldKey === 'nickname'}
                              <div class="copy-popup-badge">
                                <span class="material-symbols-outlined" style="font-size: 13px;">check</span>
                                <span>Copied!</span>
                              </div>
                            {/if}
                          </div>
                        </div>
                      </div>
                    {/if}

                    {#if getOrganization(detail.payload).org || getOrganization(detail.payload).title}
                      {@const orgInfo = [getOrganization(detail.payload).title, getOrganization(detail.payload).org].filter(Boolean).join(' at ')}
                      <div class="field-item">
                        <span class="material-symbols-outlined field-icon">domain</span>
                        <div class="field-content">
                          <span class="field-value text-plain">{orgInfo}</span>
                          <span class="field-meta">• Job info</span>
                          <div class="field-actions">
                            <button
                              class="field-copy-btn"
                              data-tooltip="Copy job info"
                              data-tooltip-pos="top"
                              aria-label="Copy job info"
                              onclick={() => copyFieldValue('org', orgInfo)}
                            >
                              <span class="material-symbols-outlined">content_copy</span>
                            </button>
                            {#if copiedFieldKey === 'org'}
                              <div class="copy-popup-badge">
                                <span class="material-symbols-outlined" style="font-size: 13px;">check</span>
                                <span>Copied!</span>
                              </div>
                            {/if}
                          </div>
                        </div>
                      </div>
                    {/if}

                    {#each getAllAddresses(detail.payload) as addr, idx}
                      <div class="field-item field-item--multiline">
                        {#if idx === 0}
                          <span class="material-symbols-outlined field-icon" style="align-self: flex-start; margin-top: 1px;">location_on</span>
                        {:else}
                          <span class="field-icon-spacer" style="align-self: flex-start;"></span>
                        {/if}
                        <div class="field-content field-content--address" data-context="address" data-address-value={addr.copyValue}>
                          <div class="field-address-text">
                            {#if addr.lines.length > 1}
                              <a
                                class="field-address-lines field-address-link"
                                href={getAddressMapsUrl(addr)}
                                onclick={(e) => { e.preventDefault(); api.openExternalUrl(getAddressMapsUrl(addr)); }}
                                tabindex="-1"
                              >
                                {#each addr.lines.slice(0, -1) as line}
                                  <span class="field-value field-address-line">{line}</span>
                                {/each}
                              </a>
                            {/if}
                            <div class="field-address-last-line">
                              <a
                                class="field-address-link"
                                href={getAddressMapsUrl(addr)}
                                onclick={(e) => { e.preventDefault(); api.openExternalUrl(getAddressMapsUrl(addr)); }}
                                aria-label="Open {addr.copyValue} in Google Maps"
                              ><span class="field-value field-address-line">{addr.lines[addr.lines.length - 1]}</span></a>
                              <span class="field-meta" title={addr.type}>• {addr.type}</span>
                            </div>
                          </div>
                          <div class="field-actions field-address-actions">
                            <button
                              class="field-copy-btn"
                              data-tooltip="Copy address"
                              data-tooltip-pos="top"
                              aria-label="Copy address"
                              onclick={() => copyFieldValue(`address-${idx}`, addr.copyValue)}
                            >
                              <span class="material-symbols-outlined">content_copy</span>
                            </button>
                            <button
                              class="field-copy-btn"
                              data-tooltip="Open in Google Maps"
                              data-tooltip-pos="top"
                              aria-label="Open in Google Maps"
                              onclick={() => api.openExternalUrl(getAddressMapsUrl(addr))}
                            >
                              <span class="material-symbols-outlined">open_in_new</span>
                            </button>
                            {#if copiedFieldKey === `address-${idx}`}
                              <div class="copy-popup-badge">
                                <span class="material-symbols-outlined" style="font-size: 13px;">check</span>
                                <span>Copied!</span>
                              </div>
                            {/if}
                          </div>
                        </div>
                      </div>
                    {/each}

                    {#if getNotes(detail.payload)}
                      {@const notes = getNotes(detail.payload)}
                      <div class="field-item" data-context="notes" data-notes-value={notes}>
                        <span class="material-symbols-outlined field-icon">notes</span>
                        <div class="field-content">
                          <span class="field-value text-plain" style="white-space: pre-wrap;">{notes}</span>
                          <span class="field-meta">• Notes</span>
                          <div class="field-actions">
                            <button
                              class="field-copy-btn"
                              data-tooltip="Copy notes"
                              data-tooltip-pos="top"
                              aria-label="Copy notes"
                              onclick={() => copyFieldValue('notes', notes)}
                            >
                              <span class="material-symbols-outlined">content_copy</span>
                            </button>
                            {#if copiedFieldKey === 'notes'}
                              <div class="copy-popup-badge">
                                <span class="material-symbols-outlined" style="font-size: 13px;">check</span>
                                <span>Copied!</span>
                              </div>
                            {/if}
                          </div>
                        </div>
                      </div>
                    {/if}

                    <!-- ── Events (non-birthday: anniversaries, custom, etc.) ── -->
                    {#each getAllEvents(detail.payload) as evt, idx}
                      <div class="field-item">
                        {#if idx === 0}
                          <span class="material-symbols-outlined field-icon">event</span>
                        {:else}
                          <span class="field-icon-spacer"></span>
                        {/if}
                        <div class="field-content">
                          <span class="field-value text-plain">{evt.date}</span>
                          <span class="field-meta">• {evt.type}</span>
                          <div class="field-actions">
                            <button class="field-copy-btn" data-tooltip="Copy date" data-tooltip-pos="top" aria-label="Copy date" onclick={() => copyFieldValue(`event-${idx}`, evt.date)}>
                              <span class="material-symbols-outlined">content_copy</span>
                            </button>
                            {#if copiedFieldKey === `event-${idx}`}
                              <div class="copy-popup-badge">
                                <span class="material-symbols-outlined" style="font-size: 13px;">check</span>
                                <span>Copied!</span>
                              </div>
                            {/if}
                          </div>
                        </div>
                      </div>
                    {/each}

                    <!-- ── Related People ──────────────────────────────────────── -->
                    {#each getAllRelations(detail.payload) as rel, idx}
                      <div class="field-item">
                        {#if idx === 0}
                          <span class="material-symbols-outlined field-icon">group</span>
                        {:else}
                          <span class="field-icon-spacer"></span>
                        {/if}
                        <div class="field-content">
                          <span class="field-value text-plain">{rel.name}</span>
                          <span class="field-meta">• {rel.type}</span>
                          <div class="field-actions">
                            <button class="field-copy-btn" data-tooltip="Copy name" data-tooltip-pos="top" aria-label="Copy name" onclick={() => copyFieldValue(`rel-${idx}`, rel.name)}>
                              <span class="material-symbols-outlined">content_copy</span>
                            </button>
                            {#if copiedFieldKey === `rel-${idx}`}
                              <div class="copy-popup-badge">
                                <span class="material-symbols-outlined" style="font-size: 13px;">check</span>
                                <span>Copied!</span>
                              </div>
                            {/if}
                          </div>
                        </div>
                      </div>
                    {/each}

                    <!-- ── Websites / URLs ─────────────────────────────────────── -->
                    {#each getAllUrls(detail.payload) as url, idx}
                      <div class="field-item">
                        {#if idx === 0}
                          <span class="material-symbols-outlined field-icon">link</span>
                        {:else}
                          <span class="field-icon-spacer"></span>
                        {/if}
                        <div class="field-content">
                          <a
                            class="field-value"
                            href={url.url}
                            onclick={(e) => { e.preventDefault(); api.openExternalUrl(url.url); }}
                          >{url.url}</a>
                          <span class="field-meta">• {url.type}</span>
                          <div class="field-actions">
                            <button class="field-copy-btn" data-tooltip="Copy URL" data-tooltip-pos="top" aria-label="Copy URL" onclick={() => copyFieldValue(`url-${idx}`, url.url)}>
                              <span class="material-symbols-outlined">content_copy</span>
                            </button>
                            <button class="field-copy-btn" data-tooltip="Open URL" data-tooltip-pos="top" aria-label="Open URL" onclick={() => api.openExternalUrl(url.url)}>
                              <span class="material-symbols-outlined">open_in_new</span>
                            </button>
                            {#if copiedFieldKey === `url-${idx}`}
                              <div class="copy-popup-badge">
                                <span class="material-symbols-outlined" style="font-size: 13px;">check</span>
                                <span>Copied!</span>
                              </div>
                            {/if}
                          </div>
                        </div>
                      </div>
                    {/each}

                    <!-- ── Custom / User-Defined Fields ───────────────────────── -->
                    {#each getAllUserDefined(detail.payload) as ud, idx}
                      <div class="field-item">
                        {#if idx === 0}
                          <span class="material-symbols-outlined field-icon">list_alt</span>
                        {:else}
                          <span class="field-icon-spacer"></span>
                        {/if}
                        <div class="field-content">
                          <span class="field-value text-plain">{ud.value}</span>
                          <span class="field-meta">• {ud.key}</span>
                          <div class="field-actions">
                            <button class="field-copy-btn" data-tooltip="Copy value" data-tooltip-pos="top" aria-label="Copy value" onclick={() => copyFieldValue(`ud-${idx}`, ud.value)}>
                              <span class="material-symbols-outlined">content_copy</span>
                            </button>
                            {#if copiedFieldKey === `ud-${idx}`}
                              <div class="copy-popup-badge">
                                <span class="material-symbols-outlined" style="font-size: 13px;">check</span>
                                <span>Copied!</span>
                              </div>
                            {/if}
                          </div>
                        </div>
                      </div>
                    {/each}
                  </div>
                </div>


                <!-- Relocated Archive Snapshot Card (Left Column) -->
                <div class="snapshot-card">
                  <h2 class="card-title">
                    <span>Archive Snapshot</span>
                    <span class="material-symbols-outlined" style="color: var(--google-blue); font-size: 18px;">verified</span>
                  </h2>
                  <div class="snapshot-info-grid">
                    <div class="snapshot-info-row">
                      <span class="snapshot-info-label">
                        <span class="material-symbols-outlined" style="font-size: 16px;">photo_library</span>
                        <span>{previewSequence === null ? 'Selected Snapshot' : 'Preview Snapshot'}</span>
                      </span>
                      <span class="snapshot-info-value">Snapshot #{previewSequence ?? capture?.sequence}</span>
                    </div>
                    <div class="snapshot-info-row">
                      <span class="snapshot-info-label">
                        <span class="material-symbols-outlined" style="font-size: 16px;">calendar_today</span>
                        <span>Captured Date</span>
                      </span>
                      <span class="snapshot-info-value">{formatCaptureTime(previewSequence === null ? capture?.committed_at : contactHistory.find((entry) => entry.sequence === previewSequence)?.committed_at)}</span>
                    </div>
                    <div class="snapshot-info-row">
                      <span class="snapshot-info-label">
                        <span class="material-symbols-outlined" style="font-size: 16px;">tag</span>
                        <span>Snapshot Revision</span>
                      </span>
                      <span class="snapshot-info-value">#{detail.version}</span>
                    </div>
                    <div class="snapshot-info-row">
                      <span class="snapshot-info-label">
                        <span class="material-symbols-outlined" style="font-size: 16px;">fingerprint</span>
                        <span>Resource</span>
                      </span>
                      <span class="snapshot-info-value"><code>{detail.resource_name}</code></span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Right Card: Full History Log with Last Edited & First Seen Dates -->
              <div class="history-log-card">
                <div class="history-card-header">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <h2 class="card-title" style="margin-bottom: 0;">History</h2>
                    <span class="material-symbols-outlined" style="color: var(--google-text-secondary); font-size: 18px; cursor: help;" data-tooltip="A chronological log of every change captured for this contact" data-tooltip-pos="top">help</span>
                  </div>
                  {#if contactHistory.length > 0}
                    <span class="history-count-pill">{contactHistory.length} {contactHistory.length === 1 ? 'revision' : 'revisions'}</span>
                  {/if}
                </div>

                <!-- Key Dates Bar: Last Edited & Added to Contacts -->
                <div class="history-dates-bar">
                  <div class="date-stat-card">
                    <div class="date-stat-header">
                      <span class="material-symbols-outlined">edit_calendar</span>
                      <span>Last edited</span>
                    </div>
                    <div class="date-stat-value">{detailLastEdited.date}</div>
                    {#if detailLastEdited.relative}
                      <div class="date-stat-relative">{detailLastEdited.relative}</div>
                    {/if}
                  </div>
                  <div class="date-stat-card">
                    <div class="date-stat-header">
                      <span class="material-symbols-outlined">person_add</span>
                      <span>First seen</span>
                    </div>
                    <div class="date-stat-value">{detailFirstSeen.date}</div>
                    {#if detailFirstSeen.relative}
                      <div class="date-stat-relative">{detailFirstSeen.relative}</div>
                    {/if}
                  </div>
                </div>


                <!-- Timeline Log Entries -->
                {#if loadingHistory}
                  <div style="display: flex; align-items: center; justify-content: center; gap: 8px; padding: 24px; color: var(--google-text-secondary); font-size: 13px;">
                    <span class="material-symbols-outlined" style="animation: spin 1s linear infinite;">sync</span>
                    <span>Loading history log...</span>
                  </div>
                {:else if contactHistory.length === 0}
                  <div style="padding: 16px; text-align: center; color: var(--google-text-secondary); font-size: 13px;">
                    No prior revisions recorded.
                  </div>
                {:else}
                  <div class="history-log-timeline">
                    {#each contactHistory as entry, idx (entry.version)}
                      {@const isCurrent = entry.version === detail.version}
                      {@const diff = computeContactDiff(entry.before, entry.after, groupMap)}
                      {@const isExpanded = expandedHistoryVersions.has(entry.version)}
                      <div class="history-entry-card" class:is-current={isCurrent}>
                        <div class="history-entry-top">
                          <div class="history-entry-meta">
                            <span class="history-version-badge">Version #{entry.version}</span>
                            {#if isCurrent}
                              <span class="history-tag modified">Viewing</span>
                            {/if}
                            <span class="history-entry-snapshot">Snapshot #{entry.sequence}</span>
                          </div>
                          <span class="history-entry-date">{formatCaptureTime(entry.committed_at)}</span>
                        </div>

                        {#if entry.after !== null && (entry.version !== detail.version || previewSequence !== entry.sequence)}
                          <button type="button" class="history-preview-btn" disabled={previewBusy} onclick={() => previewContactRevision(entry)}>
                            <span class="material-symbols-outlined">visibility</span>
                            <span>Preview contact at this revision</span>
                          </button>
                        {/if}

                        <div class="history-entry-badges">
                          {#if entry.before === null}
                            <span class="history-tag added">
                              <span class="material-symbols-outlined" style="font-size: 13px;">add_circle</span>
                              <span>First captured record</span>
                            </span>
                          {:else if entry.after === null}
                            <span class="history-tag deleted">
                              <span class="material-symbols-outlined" style="font-size: 13px;">delete</span>
                              <span>Deleted</span>
                            </span>
                          {:else if diff.badges.length > 0}
                            {#each diff.badges as badge}
                              <span class="history-tag {badge.type}">
                                <span class="material-symbols-outlined" style="font-size: 13px;">{badge.icon}</span>
                                <span>{badge.label}</span>
                              </span>
                            {/each}
                          {:else}
                            <span class="history-tag neutral">
                              <span>Verified in snapshot</span>
                            </span>
                          {/if}
                        </div>

                        {#if entry.before !== null && entry.after !== null && diff.groups.length > 0}
                          <button
                            type="button"
                            class="history-diff-toggle-btn"
                            onclick={() => toggleHistoryVersionExpanded(entry.version)}
                          >
                            <span class="material-symbols-outlined" style="font-size: 14px;">{isExpanded ? 'expand_less' : 'expand_more'}</span>
                            <span>{isExpanded ? 'Hide changes' : 'Show changes'}</span>
                          </button>
                          {#if isExpanded}
                            <div class="history-diff-content">
                              <FieldChanges before={entry.before} after={entry.after} labels={groupMap} />
                            </div>
                          {/if}
                        {/if}
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
            </div>
          </div>
        </div>
        {:else}
          <!-- Main Contacts Table List View (Screenshots 1 & 3) -->
          <div class="view-header" class:has-filter-bar={selectedGroups.length > 0}>
            <div class="view-header-main">
              <h1 class="view-title">
                {#if selectedGroups.length === 0}
                  Contacts ({capture ? capture.contact_count : contacts.length})
                {:else if selectedGroups.length === 1}
                  {groups.find((g) => g.resource_name === selectedGroups[0])?.name || 'Filtered Contacts'} ({contacts.length})
                {:else}
                  Filtered Contacts ({contacts.length})
                {/if}
              </h1>
            </div>
            <div class="view-header-actions">
              <button class="icon-btn" onclick={() => window.print()} data-tooltip="Print" aria-label="Print">
                <span class="material-symbols-outlined">print</span>
              </button>
              <button
                class="icon-btn"
                onclick={() => exportSelected('csv')}
                disabled={!capture || capture.contact_count === 0}
                data-tooltip={!capture || capture.contact_count === 0 ? 'No contacts to export' : 'Export CSV'}
                aria-label="Export CSV"
              >
                <span class="material-symbols-outlined">upload</span>
              </button>
              <button
                class="icon-btn"
                onclick={openPhotoExport}
                disabled={!capture || capture.contact_count === 0}
                data-tooltip={!capture || capture.contact_count === 0 ? 'No contacts to export' : 'Export Contact Photos'}
                aria-label="Export Contact Photos"
              >
                <span class="material-symbols-outlined">photo_library</span>
              </button>
              <button
                class="icon-btn"
                class:active={showColCustomizer}
                onclick={() => showColCustomizer = true}
                data-tooltip="Change column order"
                aria-label="Change column order"
              >
                <span class="material-symbols-outlined">more_vert</span>
              </button>
            </div>
          </div>

          {#if selectedGroups.length > 0}
            <div class="filter-contacts-bar" role="region" aria-label="Active label filters">
              <div class="filter-bar-left">
                <div class="filter-bar-lead">
                  <span class="material-symbols-outlined filter-lead-icon">filter_list</span>
                  <span class="filter-lead-label">Filtered by:</span>
                </div>
                <div class="filter-chips-list">
                  {#each selectedGroups as resName (resName)}
                    {@const grp = groups.find((g) => g.resource_name === resName)}
                    <div class="filter-chip" title={grp?.name || resName}>
                      <span class="material-symbols-outlined filter-chip-icon">label</span>
                      <span class="filter-chip-text">{grp?.name || resName}</span>
                      <button
                        type="button"
                        class="filter-chip-remove"
                        onclick={() => toggleLabelFilter(resName)}
                        title="Remove {grp?.name || 'label'} filter"
                        aria-label="Remove {grp?.name || 'label'} filter"
                      >
                        <span class="material-symbols-outlined">close</span>
                      </button>
                    </div>
                  {/each}
                </div>
              </div>

              <div class="filter-bar-right">
                {#if selectedGroups.length > 1}
                  <div class="match-mode-segmented-control" role="radiogroup" aria-label="Label match mode">
                    <button
                      type="button"
                      class="segmented-btn"
                      class:active={labelMatchMode === 'any'}
                      onclick={() => { labelMatchMode = 'any'; updateDisplayedContacts(); }}
                      title="Show contacts matching ANY of the selected labels (OR)"
                    >
                      Any label
                    </button>
                    <button
                      type="button"
                      class="segmented-btn"
                      class:active={labelMatchMode === 'all'}
                      onclick={() => { labelMatchMode = 'all'; updateDisplayedContacts(); }}
                      title="Show contacts matching ALL of the selected labels (AND)"
                    >
                      All labels
                    </button>
                  </div>
                  <span class="filter-bar-divider" aria-hidden="true"></span>
                {/if}
                <button
                  type="button"
                  class="filter-clear-all-btn"
                  onclick={clearLabelFilter}
                  title="Clear {selectedGroups.length > 1 ? 'all label filters' : 'label filter'}"
                  aria-label="Clear {selectedGroups.length > 1 ? 'all label filters' : 'label filter'}"
                >
                  <span class="material-symbols-outlined">close</span>
                  <span>{selectedGroups.length > 1 ? 'Clear all' : 'Clear'}</span>
                </button>
              </div>
            </div>
          {/if}

          <div class="table-scroll-container">
            <table class="contacts-table">
              <colgroup>
                {#each activeColKeys as colKey}
                  <col style="width: {colWidths[colKey]}px;" />
                {/each}
              </colgroup>
              <thead>
                {#if selectedContactKeys.length > 0}
                  <tr class="table-selection-row">
                    <th colspan={activeColKeys.length} class="table-selection-th">
                      <div class="table-selection-toolbar">
                        <div class="selection-toolbar-left">
                          <div class="selection-box-wrapper">
                            <button
                              type="button"
                              class="selection-master-checkbox"
                              onclick={toggleSelectAll}
                              title={isAllSelected ? 'Deselect all' : 'Select all'}
                              aria-label={isAllSelected ? 'Deselect all' : 'Select all'}
                            >
                              <span class="material-symbols-outlined">
                                {isIndeterminate ? 'remove' : 'check'}
                              </span>
                            </button>
                            <button
                              type="button"
                              class="selection-dropdown-trigger"
                              onclick={(e) => { e.stopPropagation(); showSelectionMenu = !showSelectionMenu; }}
                              title="Selection options"
                              aria-label="Selection options"
                              aria-expanded={showSelectionMenu}
                            >
                              <span class="material-symbols-outlined">arrow_drop_down</span>
                            </button>
                            {#if showSelectionMenu}
                              <div class="selection-dropdown-menu" role="menu">
                                <button
                                  type="button"
                                  class="selection-dropdown-item"
                                  onclick={() => { selectAllVisible(); showSelectionMenu = false; }}
                                  role="menuitem"
                                >
                                  All
                                </button>
                                <button
                                  type="button"
                                  class="selection-dropdown-item"
                                  onclick={() => { clearContactSelection(); showSelectionMenu = false; }}
                                  role="menuitem"
                                >
                                  None
                                </button>
                              </div>
                            {/if}
                          </div>
                          <span class="selection-count-label">
                            {selectedContactKeys.length} selected
                          </span>
                        </div>

                        <div class="selection-toolbar-actions">
                          <button
                            type="button"
                            class="icon-btn selection-action-btn"
                            onclick={sendEmailToSelected}
                            data-tooltip="Send email in new window"
                            aria-label="Send email in new window"
                          >
                            <span class="material-symbols-outlined">mail</span>
                          </button>
                          <button
                            type="button"
                            class="icon-btn selection-action-btn"
                            onclick={openPhotoExport}
                            data-tooltip="Export Contact Photos"
                            aria-label="Export Contact Photos"
                          >
                            <span class="material-symbols-outlined">photo_library</span>
                          </button>
                          <div class="selection-download-wrapper">
                            <button
                              type="button"
                              class="icon-btn selection-action-btn"
                              class:active={showDownloadMenu}
                              onclick={(e) => { e.stopPropagation(); showDownloadMenu = !showDownloadMenu; }}
                              data-tooltip="Download contacts"
                              aria-label="Download contacts"
                              aria-expanded={showDownloadMenu}
                            >
                              <span class="material-symbols-outlined">download</span>
                            </button>
                            {#if showDownloadMenu}
                              <div class="selection-download-menu" role="menu">
                                <button
                                  type="button"
                                  class="selection-menu-item"
                                  onclick={() => { downloadSelectedVcf(); showDownloadMenu = false; }}
                                  role="menuitem"
                                >
                                  <span class="material-symbols-outlined">contact_page</span>
                                  <div class="menu-item-text">
                                    <span class="menu-item-title">vCard format (.vcf)</span>
                                    <span class="menu-item-subtitle">For Apple Contacts, Outlook, iOS & Android</span>
                                  </div>
                                </button>
                                <button
                                  type="button"
                                  class="selection-menu-item"
                                  onclick={() => { downloadSelectedCsv(); showDownloadMenu = false; }}
                                  role="menuitem"
                                >
                                  <span class="material-symbols-outlined">table_chart</span>
                                  <div class="menu-item-text">
                                    <span class="menu-item-title">Google CSV (.csv)</span>
                                    <span class="menu-item-subtitle">For importing into Google Contacts</span>
                                  </div>
                                </button>
                                <button
                                  type="button"
                                  class="selection-menu-item"
                                  onclick={() => { downloadSelectedJson(); showDownloadMenu = false; }}
                                  role="menuitem"
                                >
                                  <span class="material-symbols-outlined">data_object</span>
                                  <div class="menu-item-text">
                                    <span class="menu-item-title">JSON format (.json)</span>
                                    <span class="menu-item-subtitle">Raw snapshot payload</span>
                                  </div>
                                </button>
                              </div>
                            {/if}
                          </div>
                          <button
                            type="button"
                            class="icon-btn selection-action-btn"
                            onclick={() => window.print()}
                            data-tooltip="Print"
                            aria-label="Print"
                          >
                            <span class="material-symbols-outlined">print</span>
                          </button>
                          <button
                            type="button"
                            class="icon-btn selection-action-btn"
                            onclick={clearContactSelection}
                            data-tooltip="Clear selection"
                            aria-label="Clear selection"
                          >
                            <span class="material-symbols-outlined">close</span>
                          </button>
                        </div>
                      </div>
                    </th>
                  </tr>
                {:else}
                  <tr>
                  {#each activeColKeys as colKey}
                    {@const colDef = ALL_COLUMNS.find((c) => c.key === colKey)!}
                    <th style="width: {colWidths[colKey]}px;" class={colKey === 'name' ? 'th-name-col' : ''}>
                      <div class="th-content {colKey === 'name' ? 'th-name-content' : ''}">
                        {#if colKey === 'name'}
                          <button
                            type="button"
                            class="th-sort-toggle-btn"
                            onclick={toggleSortDirection}
                            data-tooltip="Sort: {nameSortField === 'first' ? 'First' : 'Last'} name ({nameSortDirection === 'asc' ? 'A→Z' : 'Z→A'}) • Click to reverse"
                            data-tooltip-pos="bottom-left"
                            aria-label="Toggle sort direction"
                          >
                            <span class="th-col-label">{colDef ? colDef.label : 'Name'}</span>
                            <span class="material-symbols-outlined th-sort-arrow" class:desc={nameSortDirection === 'desc'}>
                              arrow_upward
                            </span>
                          </button>

                          <div class="th-sort-menu-wrapper">
                            <button
                              type="button"
                              class="th-sort-tune-btn"
                              class:active={showSortMenu}
                              onclick={(e) => { e.stopPropagation(); showSortMenu = !showSortMenu; }}
                              data-tooltip={showSortMenu ? '' : 'Name sorting options'}
                              data-tooltip-pos="bottom-left"
                              aria-haspopup="menu"
                              aria-expanded={showSortMenu}
                            >
                              <span class="material-symbols-outlined" style="font-size: 15px;">tune</span>
                            </button>

                            {#if showSortMenu}
                              <!-- svelte-ignore a11y_click_events_have_key_events -->
                              <!-- svelte-ignore a11y_no_static_element_interactions -->
                              <div
                                class="menu-scrim"
                                style="position: fixed; inset: 0; z-index: 101; background: transparent;"
                                onclick={() => showSortMenu = false}
                                role="presentation"
                              ></div>
                              <div class="th-sort-popover" role="menu" aria-label="Sort options">
                                <div class="sort-menu-heading">Sort by</div>
                                <button
                                  type="button"
                                  class="sort-menu-item"
                                  class:is-active={nameSortField === 'first'}
                                  onclick={() => { setSortField('first'); showSortMenu = false; }}
                                  role="menuitemradio"
                                  aria-checked={nameSortField === 'first'}
                                >
                                  <span class="material-symbols-outlined item-check-icon">{nameSortField === 'first' ? 'check' : ''}</span>
                                  <span>First name</span>
                                </button>
                                <button
                                  type="button"
                                  class="sort-menu-item"
                                  class:is-active={nameSortField === 'last'}
                                  onclick={() => { setSortField('last'); showSortMenu = false; }}
                                  role="menuitemradio"
                                  aria-checked={nameSortField === 'last'}
                                >
                                  <span class="material-symbols-outlined item-check-icon">{nameSortField === 'last' ? 'check' : ''}</span>
                                  <span>Last name</span>
                                </button>

                                <div class="menu-divider"></div>
                                <div class="sort-menu-heading">Order</div>
                                <button
                                  type="button"
                                  class="sort-menu-item"
                                  class:is-active={nameSortDirection === 'asc'}
                                  onclick={() => { setSortDirection('asc'); showSortMenu = false; }}
                                  role="menuitemradio"
                                  aria-checked={nameSortDirection === 'asc'}
                                >
                                  <span class="material-symbols-outlined item-check-icon">{nameSortDirection === 'asc' ? 'check' : ''}</span>
                                  <span>A &rarr; Z (Ascending)</span>
                                </button>
                                <button
                                  type="button"
                                  class="sort-menu-item"
                                  class:is-active={nameSortDirection === 'desc'}
                                  onclick={() => { setSortDirection('desc'); showSortMenu = false; }}
                                  role="menuitemradio"
                                  aria-checked={nameSortDirection === 'desc'}
                                >
                                  <span class="material-symbols-outlined item-check-icon">{nameSortDirection === 'desc' ? 'check' : ''}</span>
                                  <span>Z &rarr; A (Reverse)</span>
                                </button>
                              </div>
                            {/if}
                          </div>
                        {:else}
                          <span>{colDef ? colDef.label : colKey}</span>
                        {/if}

                        <div
                          class="col-resizer"
                          class:resizing={resizingCol === colKey}
                          onmousedown={(e) => onResizeStart(colKey, e)}
                          role="presentation"
                          aria-hidden="true"
                          data-tooltip="Drag to resize"
                        ></div>
                      </div>
                    </th>
                  {/each}
                </tr>
                {/if}
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
                    <tr
                      class="contact-row"
                      class:is-selected={selectedContactKeys.includes(contact.resource_name)}
                      data-contact-res={contact.resource_name}
                      onclick={() => selectContact(contact)}
                    >
                      {#each activeColKeys as colKey}
                        {#if colKey === 'name'}
                          <td>
                            <div class="name-cell-content">
                              <div
                                class="avatar-select-container"
                                class:selected={selectedContactKeys.includes(contact.resource_name)}
                                onclick={(e) => toggleContactSelection(contact.resource_name, e)}
                                onkeydown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    toggleContactSelection(contact.resource_name);
                                  }
                                }}
                                role="checkbox"
                                aria-checked={selectedContactKeys.includes(contact.resource_name)}
                                tabindex="0"
                                title={selectedContactKeys.includes(contact.resource_name) ? "Deselect contact" : "Select contact"}
                              >
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
                                <div class="contact-select-checkbox" class:checked={selectedContactKeys.includes(contact.resource_name)}>
                                  {#if selectedContactKeys.includes(contact.resource_name)}
                                    <span class="material-symbols-outlined check-icon">check</span>
                                  {/if}
                                </div>
                              </div>
                              <span class="name-text">{getDisplayName(contact)}</span>
                            </div>
                          </td>
                        {:else if colKey === 'job'}
                          {@const jobInfo = getOrganization(contact.payload)}
                          {@const jobText = [jobInfo.title, jobInfo.org].filter(Boolean).join(' • ')}
                          {@const cellKey = `table-${contact.resource_name}-job`}
                          <td title={jobText}>
                            {#if jobText}
                              <div class="table-cell-content">
                                <span class="table-cell-text">{jobText}</span>
                                <button
                                  type="button"
                                  class="table-cell-copy-btn"
                                  class:copied={copiedFieldKey === cellKey}
                                  onclick={(e) => {
                                    e.stopPropagation();
                                    copyFieldValue(cellKey, jobText);
                                    showTooltip(e, 'Copied!', 'right');
                                  }}
                                  onmouseenter={(e) => showTooltip(e, copiedFieldKey === cellKey ? 'Copied!' : 'Copy job info', 'right')}
                                  onmouseleave={hideTooltip}
                                  onblur={hideTooltip}
                                  aria-label="Copy job info"
                                >
                                  <span class="material-symbols-outlined">
                                    {copiedFieldKey === cellKey ? 'check' : 'content_copy'}
                                  </span>
                                </button>
                              </div>
                            {/if}
                          </td>
                        {:else if colKey === 'email'}
                          {@const email = getPrimaryEmail(contact.payload)}
                          {@const cellKey = `table-${contact.resource_name}-email`}
                          <td>
                            {#if email}
                              <div class="table-cell-content">
                                <a
                                  href="mailto:{email}"
                                  class="table-cell-link"
                                  onclick={(e) => e.stopPropagation()}
                                  aria-label="Send email to {email}"
                                >
                                  {email}
                                </a>
                                <button
                                  type="button"
                                  class="table-cell-copy-btn"
                                  class:copied={copiedFieldKey === cellKey}
                                  onclick={(e) => {
                                    e.stopPropagation();
                                    copyFieldValue(cellKey, email);
                                    showTooltip(e, 'Copied!', 'right');
                                  }}
                                  onmouseenter={(e) => showTooltip(e, copiedFieldKey === cellKey ? 'Copied!' : 'Copy email', 'right')}
                                  onmouseleave={hideTooltip}
                                  onblur={hideTooltip}
                                  aria-label="Copy email"
                                >
                                  <span class="material-symbols-outlined">
                                    {copiedFieldKey === cellKey ? 'check' : 'content_copy'}
                                  </span>
                                </button>
                              </div>
                            {/if}
                          </td>
                        {:else if colKey === 'phone'}
                          {@const phone = getPrimaryPhone(contact.payload)}
                          {@const cellKey = `table-${contact.resource_name}-phone`}
                          <td>
                            {#if phone}
                              <div class="table-cell-content">
                                <a
                                  href="tel:{phone}"
                                  class="table-cell-link"
                                  onclick={(e) => e.stopPropagation()}
                                  aria-label="Call {phone}"
                                >
                                  {phone}
                                </a>
                                <button
                                  type="button"
                                  class="table-cell-copy-btn"
                                  class:copied={copiedFieldKey === cellKey}
                                  onclick={(e) => {
                                    e.stopPropagation();
                                    copyFieldValue(cellKey, phone);
                                    showTooltip(e, 'Copied!', 'right');
                                  }}
                                  onmouseenter={(e) => showTooltip(e, copiedFieldKey === cellKey ? 'Copied!' : 'Copy phone', 'right')}
                                  onmouseleave={hideTooltip}
                                  onblur={hideTooltip}
                                  aria-label="Copy phone"
                                >
                                  <span class="material-symbols-outlined">
                                    {copiedFieldKey === cellKey ? 'check' : 'content_copy'}
                                  </span>
                                </button>
                              </div>
                            {/if}
                          </td>
                        {:else if colKey === 'birthday'}
                          {@const bday = getBirthday(contact.payload)}
                          {@const cellKey = `table-${contact.resource_name}-birthday`}
                          <td>
                            {#if bday}
                              <div class="table-cell-content">
                                <span class="table-cell-text">{bday}</span>
                                <button
                                  type="button"
                                  class="table-cell-copy-btn"
                                  class:copied={copiedFieldKey === cellKey}
                                  onclick={(e) => {
                                    e.stopPropagation();
                                    copyFieldValue(cellKey, bday);
                                    showTooltip(e, 'Copied!', 'right');
                                  }}
                                  onmouseenter={(e) => showTooltip(e, copiedFieldKey === cellKey ? 'Copied!' : 'Copy birthday', 'right')}
                                  onmouseleave={hideTooltip}
                                  onblur={hideTooltip}
                                  aria-label="Copy birthday"
                                >
                                  <span class="material-symbols-outlined">
                                    {copiedFieldKey === cellKey ? 'check' : 'content_copy'}
                                  </span>
                                </button>
                              </div>
                            {/if}
                          </td>
                        {:else if colKey === 'labels'}
                          <td class="labels-cell">
                            <div class="labels-container">
                              {#each getContactLabelItems(contact.payload) as lbl (lbl.resourceName)}
                                {@const isSelected = selectedGroups.includes(lbl.resourceName)}
                                <button
                                  type="button"
                                  class="label-chip"
                                  class:active={isSelected}
                                  onclick={(e) => {
                                    e.stopPropagation();
                                    toggleLabelFilter(lbl.resourceName);
                                    navigate('contacts');
                                  }}
                                  onmouseenter={(e) => showTooltip(e, isSelected ? `Remove filter: ${lbl.name}` : `Filter by label: ${lbl.name}`, 'top')}
                                  onmouseleave={hideTooltip}
                                  onblur={hideTooltip}
                                  aria-label="{isSelected ? 'Remove from filter: ' : 'Filter by label: '}{lbl.name}"
                                >
                                  {lbl.name}
                                </button>
                              {/each}
                            </div>
                          </td>
                        {:else if colKey === 'org'}
                          {@const org = getOrganization(contact.payload).org}
                          {@const cellKey = `table-${contact.resource_name}-org`}
                          <td>
                            {#if org}
                              <div class="table-cell-content">
                                <span class="table-cell-text">{org}</span>
                                <button
                                  type="button"
                                  class="table-cell-copy-btn"
                                  class:copied={copiedFieldKey === cellKey}
                                  onclick={(e) => {
                                    e.stopPropagation();
                                    copyFieldValue(cellKey, org);
                                    showTooltip(e, 'Copied!', 'right');
                                  }}
                                  onmouseenter={(e) => showTooltip(e, copiedFieldKey === cellKey ? 'Copied!' : 'Copy company', 'right')}
                                  onmouseleave={hideTooltip}
                                  onblur={hideTooltip}
                                  aria-label="Copy company"
                                >
                                  <span class="material-symbols-outlined">
                                    {copiedFieldKey === cellKey ? 'check' : 'content_copy'}
                                  </span>
                                </button>
                              </div>
                            {/if}
                          </td>
                        {:else if colKey === 'title'}
                          {@const title = getOrganization(contact.payload).title}
                          {@const cellKey = `table-${contact.resource_name}-title`}
                          <td>
                            {#if title}
                              <div class="table-cell-content">
                                <span class="table-cell-text">{title}</span>
                                <button
                                  type="button"
                                  class="table-cell-copy-btn"
                                  class:copied={copiedFieldKey === cellKey}
                                  onclick={(e) => {
                                    e.stopPropagation();
                                    copyFieldValue(cellKey, title);
                                    showTooltip(e, 'Copied!', 'right');
                                  }}
                                  onmouseenter={(e) => showTooltip(e, copiedFieldKey === cellKey ? 'Copied!' : 'Copy job title', 'right')}
                                  onmouseleave={hideTooltip}
                                  onblur={hideTooltip}
                                  aria-label="Copy job title"
                                >
                                  <span class="material-symbols-outlined">
                                    {copiedFieldKey === cellKey ? 'check' : 'content_copy'}
                                  </span>
                                </button>
                              </div>
                            {/if}
                          </td>
                        {:else if colKey === 'address'}
                          {@const addr = getPrimaryAddress(contact.payload)}
                          {@const cellKey = `table-${contact.resource_name}-address`}
                          <td>
                            {#if addr}
                              <div class="table-cell-content">
                                <a
                                  href={getMapsUrlFromAddress(addr)}
                                  class="table-cell-link"
                                  onclick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    api.openExternalUrl(getMapsUrlFromAddress(addr));
                                  }}
                                  aria-label="Open in Google Maps: {addr}"
                                >
                                  {addr}
                                </a>
                                <button
                                  type="button"
                                  class="table-cell-copy-btn"
                                  class:copied={copiedFieldKey === cellKey}
                                  onclick={(e) => {
                                    e.stopPropagation();
                                    copyFieldValue(cellKey, addr);
                                    showTooltip(e, 'Copied!', 'right');
                                  }}
                                  onmouseenter={(e) => showTooltip(e, copiedFieldKey === cellKey ? 'Copied!' : 'Copy address', 'right')}
                                  onmouseleave={hideTooltip}
                                  onblur={hideTooltip}
                                  aria-label="Copy address"
                                >
                                  <span class="material-symbols-outlined">
                                    {copiedFieldKey === cellKey ? 'check' : 'content_copy'}
                                  </span>
                                </button>
                              </div>
                            {/if}
                          </td>
                        {:else if colKey === 'notes'}
                          {@const notes = getNotes(contact.payload)}
                          {@const cellKey = `table-${contact.resource_name}-notes`}
                          <td>
                            {#if notes}
                              <div class="table-cell-content">
                                <span class="table-cell-text">{notes}</span>
                                <button
                                  type="button"
                                  class="table-cell-copy-btn"
                                  class:copied={copiedFieldKey === cellKey}
                                  onclick={(e) => {
                                    e.stopPropagation();
                                    copyFieldValue(cellKey, notes);
                                    showTooltip(e, 'Copied!', 'right');
                                  }}
                                  onmouseenter={(e) => showTooltip(e, copiedFieldKey === cellKey ? 'Copied!' : 'Copy notes', 'right')}
                                  onmouseleave={hideTooltip}
                                  onblur={hideTooltip}
                                  aria-label="Copy notes"
                                >
                                  <span class="material-symbols-outlined">
                                    {copiedFieldKey === cellKey ? 'check' : 'content_copy'}
                                  </span>
                                </button>
                              </div>
                            {/if}
                          </td>
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
                    <tr
                      class="contact-row"
                      class:is-selected={selectedContactKeys.includes(contact.resource_name)}
                      data-contact-res={contact.resource_name}
                      onclick={() => selectContact(contact)}
                    >
                      {#each activeColKeys as colKey}
                        {#if colKey === 'name'}
                          <td>
                            <div class="name-cell-content">
                              <div
                                class="avatar-select-container"
                                class:selected={selectedContactKeys.includes(contact.resource_name)}
                                onclick={(e) => toggleContactSelection(contact.resource_name, e)}
                                onkeydown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    toggleContactSelection(contact.resource_name);
                                  }
                                }}
                                role="checkbox"
                                aria-checked={selectedContactKeys.includes(contact.resource_name)}
                                tabindex="0"
                                title={selectedContactKeys.includes(contact.resource_name) ? "Deselect contact" : "Select contact"}
                              >
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
                                <div class="contact-select-checkbox" class:checked={selectedContactKeys.includes(contact.resource_name)}>
                                  {#if selectedContactKeys.includes(contact.resource_name)}
                                    <span class="material-symbols-outlined check-icon">check</span>
                                  {/if}
                                </div>
                              </div>
                              <span class="name-text">{getDisplayName(contact)}</span>
                            </div>
                          </td>
                        {:else if colKey === 'job'}
                          {@const jobInfo = getOrganization(contact.payload)}
                          {@const jobText = [jobInfo.title, jobInfo.org].filter(Boolean).join(' • ')}
                          {@const cellKey = `table-${contact.resource_name}-job`}
                          <td title={jobText}>
                            {#if jobText}
                              <div class="table-cell-content">
                                <span class="table-cell-text">{jobText}</span>
                                <button
                                  type="button"
                                  class="table-cell-copy-btn"
                                  class:copied={copiedFieldKey === cellKey}
                                  onclick={(e) => {
                                    e.stopPropagation();
                                    copyFieldValue(cellKey, jobText);
                                    showTooltip(e, 'Copied!', 'right');
                                  }}
                                  onmouseenter={(e) => showTooltip(e, copiedFieldKey === cellKey ? 'Copied!' : 'Copy job info', 'right')}
                                  onmouseleave={hideTooltip}
                                  onblur={hideTooltip}
                                  aria-label="Copy job info"
                                >
                                  <span class="material-symbols-outlined">
                                    {copiedFieldKey === cellKey ? 'check' : 'content_copy'}
                                  </span>
                                </button>
                              </div>
                            {/if}
                          </td>
                        {:else if colKey === 'email'}
                          {@const email = getPrimaryEmail(contact.payload)}
                          {@const cellKey = `table-${contact.resource_name}-email`}
                          <td>
                            {#if email}
                              <div class="table-cell-content">
                                <a
                                  href="mailto:{email}"
                                  class="table-cell-link"
                                  onclick={(e) => e.stopPropagation()}
                                  aria-label="Send email to {email}"
                                >
                                  {email}
                                </a>
                                <button
                                  type="button"
                                  class="table-cell-copy-btn"
                                  class:copied={copiedFieldKey === cellKey}
                                  onclick={(e) => {
                                    e.stopPropagation();
                                    copyFieldValue(cellKey, email);
                                    showTooltip(e, 'Copied!', 'right');
                                  }}
                                  onmouseenter={(e) => showTooltip(e, copiedFieldKey === cellKey ? 'Copied!' : 'Copy email', 'right')}
                                  onmouseleave={hideTooltip}
                                  onblur={hideTooltip}
                                  aria-label="Copy email"
                                >
                                  <span class="material-symbols-outlined">
                                    {copiedFieldKey === cellKey ? 'check' : 'content_copy'}
                                  </span>
                                </button>
                              </div>
                            {/if}
                          </td>
                        {:else if colKey === 'phone'}
                          {@const phone = getPrimaryPhone(contact.payload)}
                          {@const cellKey = `table-${contact.resource_name}-phone`}
                          <td>
                            {#if phone}
                              <div class="table-cell-content">
                                <a
                                  href="tel:{phone}"
                                  class="table-cell-link"
                                  onclick={(e) => e.stopPropagation()}
                                  aria-label="Call {phone}"
                                >
                                  {phone}
                                </a>
                                <button
                                  type="button"
                                  class="table-cell-copy-btn"
                                  class:copied={copiedFieldKey === cellKey}
                                  onclick={(e) => {
                                    e.stopPropagation();
                                    copyFieldValue(cellKey, phone);
                                    showTooltip(e, 'Copied!', 'right');
                                  }}
                                  onmouseenter={(e) => showTooltip(e, copiedFieldKey === cellKey ? 'Copied!' : 'Copy phone', 'right')}
                                  onmouseleave={hideTooltip}
                                  onblur={hideTooltip}
                                  aria-label="Copy phone"
                                >
                                  <span class="material-symbols-outlined">
                                    {copiedFieldKey === cellKey ? 'check' : 'content_copy'}
                                  </span>
                                </button>
                              </div>
                            {/if}
                          </td>
                        {:else if colKey === 'birthday'}
                          {@const bday = getBirthday(contact.payload)}
                          {@const cellKey = `table-${contact.resource_name}-birthday`}
                          <td>
                            {#if bday}
                              <div class="table-cell-content">
                                <span class="table-cell-text">{bday}</span>
                                <button
                                  type="button"
                                  class="table-cell-copy-btn"
                                  class:copied={copiedFieldKey === cellKey}
                                  onclick={(e) => {
                                    e.stopPropagation();
                                    copyFieldValue(cellKey, bday);
                                    showTooltip(e, 'Copied!', 'right');
                                  }}
                                  onmouseenter={(e) => showTooltip(e, copiedFieldKey === cellKey ? 'Copied!' : 'Copy birthday', 'right')}
                                  onmouseleave={hideTooltip}
                                  onblur={hideTooltip}
                                  aria-label="Copy birthday"
                                >
                                  <span class="material-symbols-outlined">
                                    {copiedFieldKey === cellKey ? 'check' : 'content_copy'}
                                  </span>
                                </button>
                              </div>
                            {/if}
                          </td>
                        {:else if colKey === 'labels'}
                          <td class="labels-cell">
                            <div class="labels-container">
                              {#each getContactLabelItems(contact.payload) as lbl (lbl.resourceName)}
                                {@const isSelected = selectedGroups.includes(lbl.resourceName)}
                                <button
                                  type="button"
                                  class="label-chip"
                                  class:active={isSelected}
                                  onclick={(e) => {
                                    e.stopPropagation();
                                    toggleLabelFilter(lbl.resourceName);
                                    navigate('contacts');
                                  }}
                                  onmouseenter={(e) => showTooltip(e, isSelected ? `Remove filter: ${lbl.name}` : `Filter by label: ${lbl.name}`, 'top')}
                                  onmouseleave={hideTooltip}
                                  onblur={hideTooltip}
                                  aria-label="{isSelected ? 'Remove from filter: ' : 'Filter by label: '}{lbl.name}"
                                >
                                  {lbl.name}
                                </button>
                              {/each}
                            </div>
                          </td>
                        {:else if colKey === 'org'}
                          {@const org = getOrganization(contact.payload).org}
                          {@const cellKey = `table-${contact.resource_name}-org`}
                          <td>
                            {#if org}
                              <div class="table-cell-content">
                                <span class="table-cell-text">{org}</span>
                                <button
                                  type="button"
                                  class="table-cell-copy-btn"
                                  class:copied={copiedFieldKey === cellKey}
                                  onclick={(e) => {
                                    e.stopPropagation();
                                    copyFieldValue(cellKey, org);
                                    showTooltip(e, 'Copied!', 'right');
                                  }}
                                  onmouseenter={(e) => showTooltip(e, copiedFieldKey === cellKey ? 'Copied!' : 'Copy company', 'right')}
                                  onmouseleave={hideTooltip}
                                  onblur={hideTooltip}
                                  aria-label="Copy company"
                                >
                                  <span class="material-symbols-outlined">
                                    {copiedFieldKey === cellKey ? 'check' : 'content_copy'}
                                  </span>
                                </button>
                              </div>
                            {/if}
                          </td>
                        {:else if colKey === 'title'}
                          {@const title = getOrganization(contact.payload).title}
                          {@const cellKey = `table-${contact.resource_name}-title`}
                          <td>
                            {#if title}
                              <div class="table-cell-content">
                                <span class="table-cell-text">{title}</span>
                                <button
                                  type="button"
                                  class="table-cell-copy-btn"
                                  class:copied={copiedFieldKey === cellKey}
                                  onclick={(e) => {
                                    e.stopPropagation();
                                    copyFieldValue(cellKey, title);
                                    showTooltip(e, 'Copied!', 'right');
                                  }}
                                  onmouseenter={(e) => showTooltip(e, copiedFieldKey === cellKey ? 'Copied!' : 'Copy job title', 'right')}
                                  onmouseleave={hideTooltip}
                                  onblur={hideTooltip}
                                  aria-label="Copy job title"
                                >
                                  <span class="material-symbols-outlined">
                                    {copiedFieldKey === cellKey ? 'check' : 'content_copy'}
                                  </span>
                                </button>
                              </div>
                            {/if}
                          </td>
                        {:else if colKey === 'address'}
                          {@const addr = getPrimaryAddress(contact.payload)}
                          {@const cellKey = `table-${contact.resource_name}-address`}
                          <td>
                            {#if addr}
                              <div class="table-cell-content">
                                <a
                                  href={getMapsUrlFromAddress(addr)}
                                  class="table-cell-link"
                                  onclick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    api.openExternalUrl(getMapsUrlFromAddress(addr));
                                  }}
                                  aria-label="Open in Google Maps: {addr}"
                                >
                                  {addr}
                                </a>
                                <button
                                  type="button"
                                  class="table-cell-copy-btn"
                                  class:copied={copiedFieldKey === cellKey}
                                  onclick={(e) => {
                                    e.stopPropagation();
                                    copyFieldValue(cellKey, addr);
                                    showTooltip(e, 'Copied!', 'right');
                                  }}
                                  onmouseenter={(e) => showTooltip(e, copiedFieldKey === cellKey ? 'Copied!' : 'Copy address', 'right')}
                                  onmouseleave={hideTooltip}
                                  onblur={hideTooltip}
                                  aria-label="Copy address"
                                >
                                  <span class="material-symbols-outlined">
                                    {copiedFieldKey === cellKey ? 'check' : 'content_copy'}
                                  </span>
                                </button>
                              </div>
                            {/if}
                          </td>
                        {:else if colKey === 'notes'}
                          {@const notes = getNotes(contact.payload)}
                          {@const cellKey = `table-${contact.resource_name}-notes`}
                          <td>
                            {#if notes}
                              <div class="table-cell-content">
                                <span class="table-cell-text">{notes}</span>
                                <button
                                  type="button"
                                  class="table-cell-copy-btn"
                                  class:copied={copiedFieldKey === cellKey}
                                  onclick={(e) => {
                                    e.stopPropagation();
                                    copyFieldValue(cellKey, notes);
                                    showTooltip(e, 'Copied!', 'right');
                                  }}
                                  onmouseenter={(e) => showTooltip(e, copiedFieldKey === cellKey ? 'Copied!' : 'Copy notes', 'right')}
                                  onmouseleave={hideTooltip}
                                  onblur={hideTooltip}
                                  aria-label="Copy notes"
                                >
                                  <span class="material-symbols-outlined">
                                    {copiedFieldKey === cellKey ? 'check' : 'content_copy'}
                                  </span>
                                </button>
                              </div>
                            {/if}
                          </td>
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
                        {:else if selectedGroups.length > 0}
                          <span class="material-symbols-outlined">label_off</span>
                          <h3 class="empty-state-title">No contacts match selected labels</h3>
                          <p class="empty-state-desc">
                            {#if selectedGroups.length === 1}
                              There are no contacts tagged with this label in snapshot #{capture?.sequence}.
                            {:else if labelMatchMode === 'all'}
                              No contacts possess all {selectedGroups.length} selected labels simultaneously in snapshot #{capture?.sequence}.
                            {:else}
                              No contacts are tagged with any of the {selectedGroups.length} selected labels in snapshot #{capture?.sequence}.
                            {/if}
                          </p>
                          <div style="display: flex; gap: 8px; justify-content: center; margin-top: 12px;">
                            {#if selectedGroups.length > 1 && labelMatchMode === 'all'}
                              <button class="action-btn" onclick={() => { labelMatchMode = 'any'; updateDisplayedContacts(); }}>
                                Switch to Match ANY
                              </button>
                            {/if}
                            <button class="action-btn" onclick={clearLabelFilter} style="background: var(--surface-base); color: var(--google-text); border: 1px solid var(--google-border);">
                              Clear label filters
                            </button>
                          </div>
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
        <!-- Changes & Changelog View -->
        <div class="view-header" style="border-bottom: none; padding-bottom: 4px;">
          <h1 class="view-title">
            {#if changesTab === 'comparison'}
              {#if compareBaseSeq && compareTargetSeq && compareBaseSeq !== compareTargetSeq}
                Snapshot Comparison: #{compareBaseSeq} → #{compareTargetSeq}
              {:else}
                Changes in Snapshot #{capture?.sequence}
              {/if}
            {:else}
              Entire Changelog
            {/if}
          </h1>

          <!-- Segmented Tab Navigation -->
          <div class="segmented-nav-group" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={changesTab === 'comparison'}
              class="segmented-nav-btn"
              class:active={changesTab === 'comparison'}
              onclick={() => { changesTab = 'comparison'; recordNavigation(); }}
            >
              <span class="material-symbols-outlined">compare_arrows</span>
              <span>Snapshot Comparison</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={changesTab === 'changelog'}
              class="segmented-nav-btn"
              class:active={changesTab === 'changelog'}
              onclick={() => {
                changesTab = 'changelog';
                recordNavigation();
                if (changelogList.length === 0) refreshAllChanges();
              }}
            >
              <span class="material-symbols-outlined">history</span>
              <span>Entire Changelog</span>
              {#if changelogList.length > 0}
                <span class="filter-pill-count">{changelogList.length}</span>
              {/if}
            </button>
          </div>
        </div>

        <div class="changes-container">
          {#if changesTab === 'comparison'}
            <!-- TAB 1: SNAPSHOT COMPARISON -->
            {#if captures.length > 1}
              <div class="comparison-bar">
                <SnapshotSelect label="Base snapshot" {captures} value={compareBaseSeq} onchange={(value) => { compareBaseSeq = value; refreshChangesComparison(); recordNavigation(); }} />

                <button
                  type="button"
                  class="compare-swap-btn"
                  title="Swap base and target snapshots"
                  aria-label="Swap snapshots"
                  onclick={swapComparisonSnapshots}
                >
                  <span class="material-symbols-outlined">swap_horiz</span>
                </button>

                <SnapshotSelect label="Compare with" {captures} value={compareTargetSeq} onchange={(value) => { compareTargetSeq = value; refreshChangesComparison(); recordNavigation(); }} />

                <div class="compare-presets" role="group" aria-label="Comparison shortcuts">
                  <button
                    type="button"
                    class="compare-quick-btn"
                    onclick={() => {
                      if (capture) {
                        const curSeq = capture.sequence;
                        compareTargetSeq = curSeq;
                        const prior = captures.find((c) => c.sequence < curSeq);
                        compareBaseSeq = prior ? prior.sequence : curSeq;
                        refreshChangesComparison();
                        recordNavigation();
                      }
                    }}
                  >
                    Compare with previous
                  </button>
                  <button
                    type="button"
                    class="compare-quick-btn"
                    onclick={() => {
                      if (captures.length >= 2) {
                        compareBaseSeq = captures[captures.length - 1].sequence;
                        compareTargetSeq = captures[0].sequence;
                        refreshChangesComparison();
                        recordNavigation();
                      }
                    }}
                  >
                    Earliest vs Latest
                  </button>
                </div>
              </div>
            {/if}

            <!-- Summary Metrics & Filter Toolbar -->
            {#if changes.length > 0}
              <div class="changes-stats-row">
                <div class="stat-chip">
                  <strong>{comparisonStats.total}</strong>
                  <span class="label">Total {comparisonStats.total === 1 ? 'Change' : 'Changes'}</span>
                </div>
                {#if comparisonStats.added > 0}
                  <div class="stat-chip added">
                    <span class="material-symbols-outlined icon-micro">add_circle</span>
                    <strong>+{comparisonStats.added}</strong>
                    <span class="label">Added</span>
                  </div>
                {/if}
                {#if comparisonStats.changed > 0}
                  <div class="stat-chip changed">
                    <span class="material-symbols-outlined icon-micro">edit</span>
                    <strong>~{comparisonStats.changed}</strong>
                    <span class="label">Modified</span>
                  </div>
                {/if}
                {#if comparisonStats.removed > 0}
                  <div class="stat-chip removed">
                    <span class="material-symbols-outlined icon-micro">remove_circle</span>
                    <strong>-{comparisonStats.removed}</strong>
                    <span class="label">Removed</span>
                  </div>
                {/if}
              </div>

              <div class="changes-filter-toolbar">
                <div class="changes-search-box">
                  <span class="material-symbols-outlined">search</span>
                  <input
                    type="text"
                    class="changes-search-input"
                    placeholder="Filter comparison changes..."
                    bind:value={comparisonSearch}
                  />
                  {#if comparisonSearch}
                    <button
                      type="button"
                      class="icon-btn"
                      style="width: 24px; height: 24px;"
                      onclick={() => (comparisonSearch = '')}
                    >
                      <span class="material-symbols-outlined" style="font-size: 16px;">close</span>
                    </button>
                  {/if}
                </div>

                <div class="filter-pills-row">
                  <button
                    type="button"
                    class="filter-pill"
                    class:active={comparisonKindFilter === 'all'}
                    onclick={() => (comparisonKindFilter = 'all')}
                  >
                    All <span class="filter-pill-count">{changes.length}</span>
                  </button>
                  {#if comparisonStats.added > 0}
                    <button
                      type="button"
                      class="filter-pill"
                      class:active={comparisonKindFilter === 'added'}
                      onclick={() => (comparisonKindFilter = 'added')}
                    >
                      Added <span class="filter-pill-count">{comparisonStats.added}</span>
                    </button>
                  {/if}
                  {#if comparisonStats.changed > 0}
                    <button
                      type="button"
                      class="filter-pill"
                      class:active={comparisonKindFilter === 'changed'}
                      onclick={() => (comparisonKindFilter = 'changed')}
                    >
                      Modified <span class="filter-pill-count">{comparisonStats.changed}</span>
                    </button>
                  {/if}
                  {#if comparisonStats.removed > 0}
                    <button
                      type="button"
                      class="filter-pill"
                      class:active={comparisonKindFilter === 'removed'}
                      onclick={() => (comparisonKindFilter = 'removed')}
                    >
                      Removed <span class="filter-pill-count">{comparisonStats.removed}</span>
                    </button>
                  {/if}
                </div>
              </div>
            {/if}

            <!-- Changes Card List -->
            {#each filteredComparisonChanges as change (change.resource_name + '-' + change.version)}
              <ContactChangeCard
                {change}
                labels={groupMap}
                avatarUrl={getAvatarSource({ resource_name: change.resource_name, display_name: '', payload: change.after || change.before || {}, version: change.version }, media)}
                birthdayFormat={preferences.birthdayFormat}
              />
            {/each}

            {#if changes.length === 0}
              <div class="empty-state">
                <span class="material-symbols-outlined" style="font-size: 48px; color: var(--google-text-secondary); margin-bottom: 12px;">history_toggle_off</span>
                <h3 class="empty-state-title">No changes recorded</h3>
                <p class="empty-state-desc">
                  {#if compareBaseSeq && compareTargetSeq && compareBaseSeq === compareTargetSeq}
                    Base snapshot and Target snapshot are identical. Select two different snapshots above to compare them.
                  {:else}
                    No contacts were added, modified, or removed between Snapshot #{compareBaseSeq} and Snapshot #{compareTargetSeq}.
                  {/if}
                </p>
              </div>
            {:else if filteredComparisonChanges.length === 0}
              <div class="empty-state" style="padding: 40px 20px;">
                <span class="material-symbols-outlined" style="font-size: 36px; color: var(--google-text-secondary); margin-bottom: 8px;">filter_list_off</span>
                <h3 class="empty-state-title">No matching changes</h3>
                <p class="empty-state-desc">No changes match your current search and type filters.</p>
                <button
                  type="button"
                  class="compare-quick-btn"
                  style="margin-top: 12px;"
                  onclick={() => { comparisonSearch = ''; comparisonKindFilter = 'all'; }}
                >
                  Reset filters
                </button>
              </div>
            {/if}
          {:else}
            <!-- TAB 2: ENTIRE CHANGELOG -->
            <!-- Full Lifetime Archive Stats -->
            <div class="changelog-overview-grid">
              <div class="changelog-metric-card">
                <span class="num">{changelogStats.totalSnapshots}</span>
                <span class="title">Total Snapshots</span>
              </div>
              <div class="changelog-metric-card">
                <span class="num" style="color: var(--google-blue);">{changelogStats.totalEvents}</span>
                <span class="title">Revisions Recorded</span>
              </div>
              <div class="changelog-metric-card">
                <span class="num" style="color: var(--success-text);">+{changelogStats.added}</span>
                <span class="title">Total Contacts Added</span>
              </div>
              <div class="changelog-metric-card">
                <span class="num" style="color: var(--google-blue);">~{changelogStats.changed}</span>
                <span class="title">Modifications</span>
              </div>
              <div class="changelog-metric-card">
                <span class="num" style="color: var(--google-danger);">-{changelogStats.removed}</span>
                <span class="title">Total Contacts Removed</span>
              </div>
            </div>

            <!-- Search & Filter for Changelog -->
            <div class="changes-filter-toolbar">
              <div class="changes-search-box">
                <span class="material-symbols-outlined">search</span>
                <input
                  type="text"
                  class="changes-search-input"
                  placeholder="Search entire changelog by name or field..."
                  bind:value={changelogSearch}
                />
                {#if changelogSearch}
                  <button
                    type="button"
                    class="icon-btn"
                    style="width: 24px; height: 24px;"
                    onclick={() => (changelogSearch = '')}
                  >
                    <span class="material-symbols-outlined" style="font-size: 16px;">close</span>
                  </button>
                {/if}
              </div>

              <div class="filter-pills-row">
                <button
                  type="button"
                  class="filter-pill"
                  class:active={changelogKindFilter === 'all'}
                  onclick={() => (changelogKindFilter = 'all')}
                >
                  All <span class="filter-pill-count">{changelogList.length}</span>
                </button>
                <button
                  type="button"
                  class="filter-pill"
                  class:active={changelogKindFilter === 'added'}
                  onclick={() => (changelogKindFilter = 'added')}
                >
                  Added <span class="filter-pill-count">{changelogStats.added}</span>
                </button>
                <button
                  type="button"
                  class="filter-pill"
                  class:active={changelogKindFilter === 'changed'}
                  onclick={() => (changelogKindFilter = 'changed')}
                >
                  Modified <span class="filter-pill-count">{changelogStats.changed}</span>
                </button>
                <button
                  type="button"
                  class="filter-pill"
                  class:active={changelogKindFilter === 'removed'}
                  onclick={() => (changelogKindFilter = 'removed')}
                >
                  Removed <span class="filter-pill-count">{changelogStats.removed}</span>
                </button>
              </div>
            </div>

            {#if loadingChangelog}
              <div class="empty-state" style="padding: 60px 20px;">
                <span class="material-symbols-outlined spin" style="font-size: 36px; color: var(--google-blue); margin-bottom: 12px;">sync</span>
                <h3 class="empty-state-title">Loading entire changelog...</h3>
              </div>
            {:else if changelogSnapshotGroups.length > 0}
              <!-- Chronological Snapshot Timeline Feed -->
              <div class="timeline-feed">
                {#each changelogSnapshotGroups as group (group.sequence)}
                  {@const isCollapsed = collapsedSnapshots.has(group.sequence)}
                  <div class="timeline-snapshot-block">
                    <div class="timeline-node-pin"></div>
                    <div class="timeline-snapshot-header">
                      <div class="timeline-header-left">
                        <span class="timeline-snap-title">Snapshot #{group.sequence}</span>
                        <span class="timeline-snap-time">{formatCaptureTime(group.committed_at)}</span>
                        <span class="timeline-snap-count">
                          {group.changes.length} {group.changes.length === 1 ? 'change' : 'changes'}
                        </span>
                      </div>

                      <div style="display: flex; align-items: center; gap: 8px;">
                        <button
                          type="button"
                          class="timeline-compare-btn"
                          onclick={() => compareSnapshotWithPrior(group.sequence)}
                          title="Open snapshot comparison for this snapshot"
                        >
                          <span class="material-symbols-outlined" style="font-size: 16px;">compare_arrows</span>
                          <span>Compare this snapshot</span>
                        </button>
                        <button
                          type="button"
                          class="icon-btn"
                          style="width: 32px; height: 32px;"
                          title={isCollapsed ? 'Expand snapshot changes' : 'Collapse snapshot changes'}
                          onclick={() => toggleSnapshotCollapse(group.sequence)}
                        >
                          <span class="material-symbols-outlined" style="font-size: 20px;">
                            {isCollapsed ? 'expand_more' : 'expand_less'}
                          </span>
                        </button>
                      </div>
                    </div>

                    {#if !isCollapsed}
                      <div class="timeline-changes-wrap">
                        {#each group.changes as item (item.resource_name + '-' + item.version)}
                          <ContactChangeCard
                            change={{
                              resource_name: item.resource_name,
                              kind: item.kind,
                              version: item.version,
                              before: item.before,
                              after: item.after,
                            }}
                            labels={groupMap}
                            avatarUrl={getAvatarSource({ resource_name: item.resource_name, display_name: '', payload: item.after || item.before || {}, version: item.version }, media)}
                            showSnapshotBadge={false}
                            committedAt={item.committed_at}
                            birthdayFormat={preferences.birthdayFormat}
                          />
                        {/each}
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
            {:else}
              <div class="empty-state">
                <span class="material-symbols-outlined" style="font-size: 48px; color: var(--google-text-secondary); margin-bottom: 12px;">history</span>
                <h3 class="empty-state-title">No changelog entries found</h3>
                <p class="empty-state-desc">
                  {#if changelogSearch || changelogKindFilter !== 'all'}
                    No records match your filters. Try clearing search or selecting "All".
                  {:else}
                    No contact revisions have been recorded in this archive yet.
                  {/if}
                </p>
              </div>
            {/if}
          {/if}
        </div>
      {/if}
    </main>
  {:else}
    <!-- Simple Onboarding Screen -->
    <div class="onboarding-screen">
      <div class="onboarding-card">
        {#if selected && captures.length === 0}
          <!-- Case 1: Account connected, but no snapshots captured yet -->
          <div class="onboarding-avatar-circle">
            {#if accountProfile?.picture}
              <img
                src={accountProfile.picture}
                alt={accountProfile?.name || selected.email}
                class="onboarding-avatar-img"
                referrerpolicy="no-referrer"
                onerror={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
              />
            {:else}
              <span class="material-symbols-outlined icon-filled" style="font-size: 32px; color: var(--google-blue);">person</span>
            {/if}
          </div>

          <div class="onboarding-account-badge">
            <span class="material-symbols-outlined" style="font-size: 16px; color: var(--success-text);">check_circle</span>
            <span>{accountProfile?.name ? `${accountProfile.name} (${selected.email})` : selected.email}</span>
          </div>

          <h1 class="onboarding-title">Capture your first snapshot</h1>
          <p class="onboarding-desc">
            Your Google account is connected. Capture your first snapshot to begin archiving your contact history and tracking revisions over time.
          </p>

          <div class="onboarding-form">
            {#if error}
              <div class="banner banner-error" style="margin-bottom: 4px; font-size: 13px;">
                <span class="material-symbols-outlined" style="font-size: 18px;">error</span>
                <span>{error}</span>
              </div>
            {/if}

            <button
              class="btn-primary"
              onclick={captureNow}
              disabled={busy}
              style="height: 48px; font-size: 15px; font-weight: 500; display: flex; align-items: center; justify-content: center; gap: 8px;"
            >
              <span class="material-symbols-outlined" class:spin={busy} style="font-size: 20px;">
                {busy ? 'sync' : 'photo_camera'}
              </span>
              <span>{busy ? 'Capturing snapshot...' : 'Capture contacts now'}</span>
            </button>

            <div class="onboarding-divider">or import existing data</div>

            <div class="onboarding-secondary-actions">
              <button class="btn-secondary" onclick={importCsv} disabled={busy} style="height: 40px; display: flex; align-items: center; justify-content: center; gap: 8px;">
                <span class="material-symbols-outlined" style="font-size: 18px;">upload</span>
                <span>Import from CSV</span>
              </button>
              <button class="btn-secondary" onclick={restoreLocal} disabled={busy} style="height: 40px; display: flex; align-items: center; justify-content: center; gap: 8px;">
                <span class="material-symbols-outlined" style="font-size: 18px;">unarchive</span>
                <span>Restore database backup</span>
              </button>
              <button
                class="btn-secondary"
                onclick={disconnectSelected}
                disabled={busy}
                style="height: 40px; color: var(--google-danger); border-color: transparent; display: flex; align-items: center; justify-content: center; gap: 8px;"
              >
                <span class="material-symbols-outlined" style="font-size: 18px;">logout</span>
                <span>Disconnect account</span>
              </button>
            </div>
          </div>

        {:else}
          <!-- Case 2: No account connected (or explicitly adding another account) -->
          <div class="onboarding-icon-circle">
            <span class="material-symbols-outlined icon-filled" style="font-size: 32px;">contacts</span>
          </div>

          <h1 class="onboarding-title">Welcome to Contact History</h1>
          <p class="onboarding-desc">
            Connect your Google Account using your OAuth Client credentials to begin archiving contacts and tracking revisions over time.
          </p>

          <div class="onboarding-form">
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
              <div class="banner banner-error" style="margin-top: 4px; font-size: 13px;">
                <span class="material-symbols-outlined" style="font-size: 18px;">error</span>
                <span>{error}</span>
              </div>
            {/if}
            <button
              class="btn-primary"
              onclick={connectNewAccount}
              disabled={busy || !clientId.trim() || !clientSecret.trim()}
              style="height: 48px; font-size: 15px; font-weight: 500; margin-top: 4px; display: flex; align-items: center; justify-content: center; gap: 8px;"
            >
              <span class="material-symbols-outlined" class:spin={busy} style="font-size: 20px;">
                {busy ? 'sync' : 'login'}
              </span>
              <span>{busy ? 'Connecting to Google...' : 'Connect Google'}</span>
            </button>

            <div class="onboarding-divider">or restore an archive</div>

            <div class="onboarding-secondary-actions">
              <button class="btn-secondary" onclick={restoreLocal} disabled={busy} style="height: 40px; display: flex; align-items: center; justify-content: center; gap: 8px;">
                <span class="material-symbols-outlined" style="font-size: 18px;">unarchive</span>
                <span>Restore from backup archive</span>
              </button>
              {#if hasData}
                <button class="btn-secondary" onclick={() => navigate('contacts')} style="height: 40px; margin-top: 4px; display: flex; align-items: center; justify-content: center; gap: 8px;">
                  <span class="material-symbols-outlined" style="font-size: 18px;">arrow_back</span>
                  <span>Back to contacts</span>
                </button>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

  <!-- Column Customizer Modal (Google Contacts Style) -->
  {#if showColCustomizer}
    <div
      class="modal-overlay"
      onclick={(e) => {
        if (e.target === e.currentTarget) {
          showColCustomizer = false;
          openColDropdownSlot = null;
        }
      }}
      onkeydown={(e) => {
        if (e.key === 'Escape') {
          if (openColDropdownSlot !== null) {
            openColDropdownSlot = null;
          } else {
            showColCustomizer = false;
          }
        }
      }}
      role="dialog"
      aria-modal="true"
      use:focusDialog
      tabindex="-1"
    >
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div
        class="modal-dialog col-order-dialog"
        role="document"
        onclick={(e) => {
          const target = e.target as HTMLElement;
          if (!target.closest('.col-order-select-container')) {
            openColDropdownSlot = null;
          }
        }}
      >
        <div class="col-order-header">
          <h2 class="col-order-title">Change column order</h2>
        </div>
        <div class="col-order-body">
          <p class="col-order-subtitle">
            Choose columns to show and drag to change the order. Small screens may not display all columns.
          </p>

          <div class="col-order-list" role="list">
            <!-- 1. Fixed Name row -->
            <div class="col-order-row col-order-fixed-row" role="listitem">
              <span class="col-order-num">1.</span>
              <span class="col-order-fixed-name">Name</span>
            </div>

            <!-- Draggable slots 2 to N -->
            {#each activeColKeys.slice(1) as colKey, idx}
              {@const slotIndex = idx + 1}
              {@const isDropdownOpen = openColDropdownSlot === slotIndex}
              <div
                class="col-order-row col-order-slot-row"
                class:is-dragging={pointerDragSlot === slotIndex}
                class:is-drag-over={pointerOverSlot === slotIndex && pointerDragSlot !== slotIndex}
                data-slot-index={slotIndex}
                role="listitem"
              >
                <span class="col-order-num">{slotIndex + 1}.</span>

                <div class="col-order-select-container">
                  <button
                    type="button"
                    class="col-order-select-btn"
                    class:is-open={isDropdownOpen}
                    onclick={(e) => {
                      e.stopPropagation();
                      openColDropdownSlot = isDropdownOpen ? null : slotIndex;
                    }}
                    aria-haspopup="listbox"
                    aria-expanded={isDropdownOpen}
                  >
                    <span class="col-order-select-label">{getColumnLabel(colKey)}</span>
                    <span class="material-symbols-outlined col-order-arrow">
                      {isDropdownOpen ? 'arrow_drop_up' : 'arrow_drop_down'}
                    </span>
                  </button>

                  {#if isDropdownOpen}
                    <div class="col-order-dropdown" role="listbox">
                      {#each AVAILABLE_SELECT_COLUMNS as opt}
                        <button
                          type="button"
                          class="col-order-option"
                          class:is-selected={opt.key === colKey}
                          onclick={(e) => {
                            e.stopPropagation();
                            selectColumnForSlot(slotIndex, opt.key);
                          }}
                          role="option"
                          aria-selected={opt.key === colKey}
                        >
                          <span>{opt.label}</span>
                          {#if opt.key === colKey}
                            <span class="material-symbols-outlined col-opt-check">check</span>
                          {/if}
                        </button>
                      {/each}
                    </div>
                  {/if}
                </div>

                <div class="col-reorder-actions">
                  <div class="col-micro-arrows">
                    <button
                      type="button"
                      class="col-micro-btn"
                      disabled={slotIndex <= 1}
                      onclick={(e) => { e.stopPropagation(); moveColumnSlot(slotIndex, -1); }}
                      data-tooltip="Move up"
                      aria-label="Move up"
                    >
                      <span class="material-symbols-outlined">expand_less</span>
                    </button>
                    <button
                      type="button"
                      class="col-micro-btn"
                      disabled={slotIndex >= activeColKeys.length - 1}
                      onclick={(e) => { e.stopPropagation(); moveColumnSlot(slotIndex, 1); }}
                      data-tooltip="Move down"
                      aria-label="Move down"
                    >
                      <span class="material-symbols-outlined">expand_more</span>
                    </button>
                  </div>

                  <!-- svelte-ignore a11y_interactive_supports_focus -->
                  <div
                    class="col-drag-handle-btn"
                    onpointerdown={(e) => startPointerDrag(slotIndex, e)}
                    data-tooltip="Drag to reorder"
                    aria-label="Drag to reorder"
                    role="button"
                    tabindex="0"
                    onkeydown={(e) => {
                      if (e.key === 'ArrowUp') { e.preventDefault(); moveColumnSlot(slotIndex, -1); }
                      if (e.key === 'ArrowDown') { e.preventDefault(); moveColumnSlot(slotIndex, 1); }
                    }}
                  >
                    <svg width="18" height="12" viewBox="0 0 18 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <line x1="0" y1="2" x2="18" y2="2" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
                      <line x1="0" y1="10" x2="18" y2="10" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
                    </svg>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        </div>

        <div class="col-order-footer">
          <button type="button" class="col-order-btn-text" onclick={resetColumns}>Reset</button>
          <button
            type="button"
            class="col-order-btn-text col-order-btn-done"
            onclick={() => { showColCustomizer = false; openColDropdownSlot = null; }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Settings keeps personal preferences, capture schedules, account controls, and About together. -->
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
          <button aria-pressed={settingsTab === 'preferences'} onclick={() => settingsTab = 'preferences'}>
            <span class="material-symbols-outlined">tune</span>
            Preferences
          </button>
          <button aria-pressed={settingsTab === 'schedule'} onclick={() => settingsTab = 'schedule'}>
            <span class="material-symbols-outlined">schedule</span>
            Capture Schedule
          </button>
          <button aria-pressed={settingsTab === 'about'} onclick={() => settingsTab = 'about'}>
            <span class="material-symbols-outlined">info</span>
            About
          </button>
        </nav>
        <div class="modal-body settings-body">
          {#if settingsError}<p class="settings-error" role="alert">{settingsError}</p>{/if}

          {#if settingsTab === 'preferences'}
            <!-- Appearance & Display -->
            <div class="settings-section-header">
              <h3>
                <span class="material-symbols-outlined">palette</span>
                Appearance & Display
              </h3>
              <p>Customize the look, density, and ordering of your contacts workspace.</p>
            </div>
            <div class="settings-card">
              <div class="setting-row">
                <div class="setting-row-text">
                  <span class="setting-row-title">Color theme</span>
                  <span class="setting-row-desc">Choose Light, Dark, or let the app automatically match your operating system.</span>
                </div>
                <div class="theme-options" role="group" aria-label="Color theme">
                  {#each [{value: 'system', label: 'System', icon: 'desktop_windows'}, {value: 'light', label: 'Light', icon: 'light_mode'}, {value: 'dark', label: 'Dark', icon: 'dark_mode'}] as option}
                    <button aria-pressed={preferences.theme === option.value} onclick={() => updatePreferences({theme: option.value as Preferences['theme']})}>
                      <span class="material-symbols-outlined" aria-hidden="true">{option.icon}</span>
                      {option.label}
                    </button>
                  {/each}
                </div>
              </div>

              <div class="setting-row">
                <div class="setting-row-text">
                  <span class="setting-row-title">Contact density</span>
                  <span class="setting-row-desc">Adjust the vertical spacing between contact table rows.</span>
                </div>
                <div class="setting-row-control">
                  <CustomSelect
                    options={densityOptions}
                    value={preferences.density}
                    onchange={(v) => updatePreferences({ density: v })}
                    ariaLabel="Contact density"
                  />
                </div>
              </div>

              <div class="setting-row">
                <div class="setting-row-text">
                  <span class="setting-row-title">Sort contacts by</span>
                  <span class="setting-row-desc">Order contacts by their first name or last name.</span>
                </div>
                <div class="setting-row-control">
                  <CustomSelect
                    options={sortFieldOptions}
                    value={nameSortField}
                    onchange={(v) => setSortField(v as 'first' | 'last')}
                    ariaLabel="Sort contacts by"
                  />
                </div>
              </div>

              <div class="setting-row">
                <div class="setting-row-text">
                  <span class="setting-row-title">Name sort order</span>
                  <span class="setting-row-desc">Alphabetical A to Z, or descending Z to A.</span>
                </div>
                <div class="setting-row-control">
                  <CustomSelect
                    options={sortDirectionOptions}
                    value={nameSortDirection}
                    onchange={(v) => setSortDirection(v as 'asc' | 'desc')}
                    ariaLabel="Name sort order"
                  />
                </div>
              </div>

              <div class="setting-row">
                <div class="setting-row-text">
                  <span class="setting-row-title">Birthday format</span>
                  <span class="setting-row-desc">Choose how birthdays are displayed across the table, contact details, and changes.</span>
                </div>
                <div class="setting-row-control">
                  <CustomSelect
                    options={birthdayFormatOptions}
                    value={preferences.birthdayFormat}
                    onchange={(v) => updatePreferences({ birthdayFormat: v as BirthdayFormat })}
                    ariaLabel="Birthday format"
                  />
                </div>
              </div>

              <div class="setting-row">
                <div class="setting-row-text">
                  <span class="setting-row-title">Reduce motion</span>
                  <span class="setting-row-desc">Minimize animations. Your device’s reduced-motion preference is always respected.</span>
                </div>
                <div class="setting-row-control">
                  <ToggleSwitch
                    checked={preferences.reduceMotion}
                    onchange={(c) => updatePreferences({ reduceMotion: c })}
                    label="Reduce motion"
                  />
                </div>
              </div>

              <div class="settings-actions" style="margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--google-border-subtle);">
                <button class="btn-secondary" onclick={() => { showSettingsModal = false; showColCustomizer = true; }}>
                  <span class="material-symbols-outlined" style="font-size: 18px;">view_column</span>
                  Change column order & visibility...
                </button>
              </div>
            </div>

            <!-- Phone & Region Settings -->
            <div class="settings-section-header">
              <h3>
                <span class="material-symbols-outlined">call</span>
                Phone & Region
              </h3>
              <p>Configure how national phone numbers without country prefixes are formatted and dialed.</p>
            </div>
            <div class="settings-card">
              <div class="setting-row">
                <div class="setting-row-text">
                  <span class="setting-row-title">Default country code</span>
                  <span class="setting-row-desc">
                    Used for phone numbers without an international country code.
                  </span>
                </div>
                <div class="setting-row-control">
                  <CustomSelect
                    options={countryOptions}
                    searchable={true}
                    searchPlaceholder="Search country or code..."
                    value={preferences.defaultCountry || 'auto'}
                    onchange={(val) => updatePreferences({ defaultCountry: String(val) })}
                    ariaLabel="Default phone country code"
                  />
                </div>
              </div>
            </div>

            <!-- Active Account -->
            <div class="settings-section-header">
              <h3>
                <span class="material-symbols-outlined">account_circle</span>
                Active Account
              </h3>
              <p>The Google account currently connected for contact sync and snapshots.</p>
            </div>
            <div class="settings-card">
              <div class="setting-row">
                <div class="setting-row-text">
                  <span class="setting-row-title">{selected?.email || 'No account selected'}</span>
                  <span class="setting-row-desc">
                    {#if accountProfile?.name}
                      Google profile: {accountProfile.name}
                    {:else}
                      All contact archives and snapshot history remain stored securely on this computer.
                    {/if}
                  </span>
                </div>
                <div class="setting-row-control">
                  <button class="btn-secondary" style="color: var(--google-danger);" disabled={!selected || busy} onclick={disconnectSelected}>
                    Disconnect account
                  </button>
                </div>
              </div>
            </div>

            <div class="settings-section-header">
              <h3><span class="material-symbols-outlined">database</span> Local database</h3>
              <p>Manage the archived contact data stored on this computer.</p>
            </div>
            <div class="settings-card">
              <div class="setting-row">
                <div class="setting-row-text">
                  <span class="setting-row-title">Clear and reset database</span>
                  <span class="setting-row-desc">Permanently delete every snapshot, contact history entry, and saved photo for all accounts. Connected accounts and preferences stay available.</span>
                </div>
                <div class="setting-row-control"><button class="btn-secondary danger-action" disabled={archiveActionBusy || busy || accounts.length === 0} onclick={() => showResetDatabaseConfirm = true}>Reset database</button></div>
              </div>
            </div>

          {:else if settingsTab === 'schedule'}
            <!-- Capture Schedule Tab -->
            <div class="settings-section-header">
              <h3>
                <span class="material-symbols-outlined">schedule</span>
                Automated Background Capture
              </h3>
              <p>Configure automatic snapshot intervals, scheduled times, and logon checks to keep your archive up to date.</p>
            </div>

            <div class="schedule-status-banner">
              <div class="status-indicator-group">
                <span class="status-dot" class:active={scheduleConfig.enabled}></span>
                <div class="status-text-info">
                  <span class="status-title">{scheduleConfig.enabled ? 'Automatic Capture Active' : 'Automatic Capture Paused'}</span>
                  <span class="status-subtitle">
                    {#if due?.next_due_at}
                      Next snapshot due: {new Date(due.next_due_at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      {#if due.due} &middot; <strong style="color: var(--google-blue);">Due now</strong>{/if}
                    {:else if scheduleConfig.enabled}
                      Snapshots will run automatically in the background when contacts are due.
                    {:else}
                      Turn on the switch below to automate background snapshot capture.
                    {/if}
                  </span>
                </div>
              </div>
              <ToggleSwitch
                checked={scheduleConfig.enabled}
                disabled={scheduleBusy || !scheduleReady}
                onchange={() => toggleSchedule()}
                label="Toggle automatic capture"
              />
            </div>

            <div class="settings-card" style="opacity: {scheduleConfig.enabled ? '1' : '0.5'}; pointer-events: {scheduleConfig.enabled ? 'auto' : 'none'}; transition: opacity 0.2s ease;">
              <div class="setting-row">
                <div class="setting-row-text">
                  <span class="setting-row-title">Capture interval rule</span>
                  <span class="setting-row-desc">Minimum age of your previous snapshot before a new one is captured. Prevents redundant snapshots if contacts haven't changed.</span>
                </div>
                <div class="setting-row-control">
                  <CustomSelect
                    options={intervalOptions}
                    value={scheduleConfig.interval_days}
                    disabled={!scheduleConfig.enabled || scheduleBusy}
                    onchange={(val) => updateSchedule({ interval_days: Number(val) })}
                    ariaLabel="Capture interval"
                  />
                </div>
              </div>

              <div class="setting-row">
                <div class="setting-row-text">
                  <span class="setting-row-title">Preferred daily check time</span>
                  <span class="setting-row-desc">The time of day Windows triggers the automated capture check.</span>
                </div>
                <div class="setting-row-control">
                  <input
                    type="time"
                    class="schedule-time-input"
                    value={scheduleConfig.time_of_day || '09:00'}
                    disabled={!scheduleConfig.enabled || scheduleBusy}
                    onchange={(e) => updateSchedule({ time_of_day: e.currentTarget.value })}
                    aria-label="Preferred daily check time"
                  />
                </div>
              </div>

              <div class="setting-row">
                <div class="setting-row-text">
                  <span class="setting-row-title">Run at user sign-in (Logon)</span>
                  <span class="setting-row-desc">Checks if a capture is due whenever you log into Windows.</span>
                </div>
                <div class="setting-row-control">
                  <ToggleSwitch
                    checked={scheduleConfig.run_at_logon}
                    disabled={!scheduleConfig.enabled || scheduleBusy}
                    onchange={(c) => updateSchedule({ run_at_logon: c })}
                    label="Run at logon"
                  />
                </div>
              </div>

              <div class="setting-row">
                <div class="setting-row-text">
                  <span class="setting-row-title">Run daily at preferred time</span>
                  <span class="setting-row-desc">Schedules a recurring Windows background task at your specified time.</span>
                </div>
                <div class="setting-row-control">
                  <ToggleSwitch
                    checked={scheduleConfig.run_daily}
                    disabled={!scheduleConfig.enabled || scheduleBusy}
                    onchange={(c) => updateSchedule({ run_daily: c })}
                    label="Run daily"
                  />
                </div>
              </div>
            </div>

          {:else}
            <!-- About Tab -->
            <section class="settings-section about-copy" aria-labelledby="about-title">
              <div class="about-brand">
                <img class="brand-logo" src={brandLogo} alt="" />
                <div>
                  <h3 id="about-title">Contact History</h3>
                  <p>Version {appVersion}</p>
                </div>
              </div>
              <p>A local archive of your Google contacts, with snapshots that let you revisit details and see what changed over time.</p>
              <p>Browse earlier snapshots, compare revisions, and export contacts or back up an account using the sidebar’s export and archive actions.</p>
              <p>Contact archives are stored privately on this computer. Connecting and capturing contacts requires access to your Google account.</p>
            </section>
          {/if}
        </div>
        <div class="modal-footer">
          {#if preferenceNotice}
            <span class="settings-note" role="status">
              {preferenceNotice}
            </span>
          {/if}
          <button class="btn-primary" onclick={() => showSettingsModal = false}>Done</button>
        </div>
      </div>
    </div>
  {/if}
  {#if deleteSnapshotTarget}
    <div class="modal-overlay archive-confirm-overlay" use:focusDialog role="dialog" aria-modal="true" aria-labelledby="delete-snapshot-title" tabindex="-1" onkeydown={(e) => { if (e.key === 'Escape' && !archiveActionBusy) deleteSnapshotTarget = null; }}>
      <div class="modal-dialog archive-confirm-dialog" role="document">
        <div class="modal-header"><h2 class="modal-title" id="delete-snapshot-title">Delete Snapshot #{deleteSnapshotTarget.sequence}?</h2></div>
        <div class="modal-body">
          <p>Captured {formatCaptureTime(deleteSnapshotTarget.committed_at)} with {deleteSnapshotTarget.contact_count} contacts.</p>
          <p>This permanently removes the snapshot and its unique history from this computer. Remaining snapshots stay available. This cannot be undone.</p>
          {#if error}<p class="settings-error" role="alert">{error}</p>{/if}
        </div>
        <div class="modal-footer archive-confirm-actions"><button class="btn-secondary" disabled={archiveActionBusy} onclick={() => deleteSnapshotTarget = null}>Cancel</button><button class="btn-primary danger-button" disabled={archiveActionBusy} onclick={deleteSelectedSnapshot}>{archiveActionBusy ? 'Deleting...' : 'Delete snapshot'}</button></div>
      </div>
    </div>
  {/if}
  {#if showResetDatabaseConfirm}
    <div class="modal-overlay archive-confirm-overlay" use:focusDialog role="dialog" aria-modal="true" aria-labelledby="reset-database-title" tabindex="-1" onkeydown={(e) => { if (e.key === 'Escape' && !archiveActionBusy) showResetDatabaseConfirm = false; }}>
      <div class="modal-dialog archive-confirm-dialog" role="document">
        <div class="modal-header"><h2 class="modal-title" id="reset-database-title">Reset the entire database?</h2></div>
        <div class="modal-body"><p>All snapshots, contact history, and stored photos for {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'} will be permanently deleted. Connected accounts and preferences will remain. This cannot be undone.</p><p>Back up any archives you want to keep before continuing.</p>{#if settingsError}<p class="settings-error" role="alert">{settingsError}</p>{/if}</div>
        <div class="modal-footer archive-confirm-actions"><button class="btn-secondary" disabled={archiveActionBusy} onclick={() => showResetDatabaseConfirm = false}>Cancel</button><button class="btn-primary danger-button" disabled={archiveActionBusy} onclick={resetAllDatabase}>{archiveActionBusy ? 'Resetting...' : 'Reset database'}</button></div>
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
      <div class="modal-dialog" role="document" style="max-width: 940px; width: 95%; height: 80vh; display: flex; flex-direction: column;">
        <div class="modal-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="material-symbols-outlined" style="color: var(--google-blue);">data_object</span>
            <h2 class="modal-title">Raw Contact Payload: {getDisplayName(detail)}</h2>
          </div>
          <button class="icon-btn" onclick={() => showRawDataModal = false}>
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <div class="modal-body" style="flex: 1; overflow: hidden; display: flex; flex-direction: column; padding-bottom: 0;">
          <ContactPayloadViewer payload={detail.payload as Record<string, unknown>} maxHeight="100%" />
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick={() => downloadContactCsv(detail!)}>
            <span class="material-symbols-outlined" style="font-size: 16px;">table_chart</span>
            <span>Download CSV</span>
          </button>
          <button class="btn-secondary" onclick={() => downloadContactJson(detail!)}>
            <span class="material-symbols-outlined" style="font-size: 16px;">download</span>
            <span>Download JSON</span>
          </button>
          <button class="btn-secondary" onclick={() => downloadContactVcf(detail!)}>
            <span class="material-symbols-outlined" style="font-size: 16px;">contact_page</span>
            <span>Download vCard</span>
          </button>
          <button class="btn-primary" onclick={() => showRawDataModal = false}>Close</button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Export Contact Photos Modal -->
  {#if showPhotoExportModal}
    <div
      class="modal-overlay"
      onclick={(e) => { if (e.target === e.currentTarget && !photoExportBusy) showPhotoExportModal = false; }}
      onkeydown={(e) => { if (e.key === 'Escape' && !photoExportBusy) showPhotoExportModal = false; }}
      role="dialog"
      aria-modal="true"
      use:focusDialog
      tabindex="-1"
    >
      <div class="modal-dialog" role="document" style="max-width: 520px; width: 90%;">
        <div class="modal-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="material-symbols-outlined" style="color: var(--google-blue);">photo_library</span>
            <h2 class="modal-title">Export Contact Photos</h2>
          </div>
          <button class="icon-btn" onclick={() => { if (!photoExportBusy) showPhotoExportModal = false; }} disabled={photoExportBusy}>
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <div class="modal-body" style="display: flex; flex-direction: column; gap: 16px;">
          <p style="color: var(--text-secondary); font-size: 13px; line-height: 1.5; margin: 0;">
            Download and export all profile contact images in their highest available resolution from Google CDN. Images are saved with contact names as filenames.
          </p>

          <!-- Format Choice -->
          <div>
            <div style="font-weight: 600; font-size: 13px; margin-bottom: 8px; color: var(--text-primary);">
              Export Format
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
              <button
                type="button"
                class="export-option-card"
                class:selected={photoExportFormat === 'folder'}
                onclick={() => photoExportFormat = 'folder'}
                disabled={photoExportBusy}
              >
                <span class="material-symbols-outlined" style="font-size: 28px; color: var(--google-blue);">folder</span>
                <div style="font-weight: 600; font-size: 13px;">Folder</div>
                <div style="font-size: 11px; color: var(--text-secondary); text-align: center;">Extract photos directly into a selected directory</div>
              </button>
              <button
                type="button"
                class="export-option-card"
                class:selected={photoExportFormat === 'zip'}
                onclick={() => photoExportFormat = 'zip'}
                disabled={photoExportBusy}
              >
                <span class="material-symbols-outlined" style="font-size: 28px; color: var(--google-blue);">folder_zip</span>
                <div style="font-weight: 600; font-size: 13px;">ZIP Archive</div>
                <div style="font-size: 11px; color: var(--text-secondary); text-align: center;">Bundle all photos into a single compressed .zip file</div>
              </button>
            </div>
          </div>

          <!-- Progress during export -->
          {#if photoExportBusy}
            <div style="background: var(--google-blue-pill); border-radius: 10px; padding: 14px; display: flex; flex-direction: column; gap: 8px;">
              <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 500; color: var(--text-primary);">
                <span>{photoExportProgress ? `Exporting: ${photoExportProgress.name}` : 'Preparing export...'}</span>
                {#if photoExportProgress && photoExportProgress.total > 0}
                  <span>{photoExportProgress.current} / {photoExportProgress.total}</span>
                {/if}
              </div>
              <div class="banner-progress-bar" style="width: 100%; height: 8px;">
                <div
                  class="banner-progress-fill"
                  style="width: {photoExportProgress && photoExportProgress.total > 0 ? Math.min(100, Math.round((photoExportProgress.current / photoExportProgress.total) * 100)) : 15}%;"
                ></div>
              </div>
            </div>
          {/if}

          <!-- Result Success Banner -->
          {#if photoExportResult}
            <div style="background: rgba(52, 168, 83, 0.1); border: 1px solid #34a853; border-radius: 10px; padding: 14px; display: flex; flex-direction: column; gap: 6px;">
              <div style="display: flex; align-items: center; gap: 6px; color: #1e8e3e; font-weight: 600; font-size: 13px;">
                <span class="material-symbols-outlined" style="font-size: 18px;">check_circle</span>
                <span>Export Completed Successfully!</span>
              </div>
              <div style="font-size: 12px; color: var(--text-primary);">
                Exported <strong>{photoExportResult.exported_photos}</strong> photo(s) to:
                <div style="font-family: monospace; font-size: 11px; margin-top: 4px; word-break: break-all; background: var(--surface-base); padding: 6px 8px; border-radius: 6px;">
                  {photoExportResult.destination}
                </div>
              </div>
              <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">
                {photoExportResult.skipped_no_photo} contact(s) had no photo.
                {#if photoExportResult.skipped_default > 0}
                  {photoExportResult.skipped_default} default avatar(s) skipped.
                {/if}
              </div>
            </div>
          {/if}

          <!-- Error Banner -->
          {#if photoExportError}
            <div class="error-banner" style="margin: 0;">
              <span class="material-symbols-outlined">error</span>
              <span>{photoExportError}</span>
            </div>
          {/if}
        </div>
        <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 8px;">
          {#if photoExportResult}
            <button class="btn-primary" onclick={() => showPhotoExportModal = false}>Done</button>
          {:else}
            <button class="btn-secondary" onclick={() => showPhotoExportModal = false} disabled={photoExportBusy}>Cancel</button>
            <button class="btn-primary" onclick={startPhotoExport} disabled={photoExportBusy}>
              {#if photoExportBusy}
                <span>Exporting...</span>
              {:else}
                <span class="material-symbols-outlined" style="font-size: 16px; margin-right: 4px;">download</span>
                <span>Export Photos</span>
              {/if}
            </button>
          {/if}
        </div>
      </div>
    </div>
  {/if}

  <!-- Photos Modal (Google Contacts Authentic Style) -->
  {#if showPhotosModal && detail}
    {@const contactPhotos = getContactPhotos(detail, media, avatarMap)}
    <div
      class="modal-overlay"
      use:focusDialog
      role="dialog"
      aria-modal="true"
      aria-labelledby="photos-modal-title"
      tabindex="-1"
      onclick={(e) => { if (e.target === e.currentTarget) { showPhotosModal = false; photoInfoTooltip = null; } }}
      onkeydown={(e) => { if (e.key === 'Escape') { showPhotosModal = false; photoInfoTooltip = null; } }}
    >
      <div class="modal-dialog photos-dialog" role="document">
        <div class="modal-header photos-modal-header">
          <h2 class="modal-title" id="photos-modal-title">Photos</h2>
          <button class="icon-btn" aria-label="Close photos dialog" onclick={() => { showPhotosModal = false; photoInfoTooltip = null; }}>
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <div class="modal-body photos-modal-body">
          {#if contactPhotos.length === 0}
            <div class="photos-empty-state">
              <div class="photo-circle empty-avatar" style="background-color: {getAvatarColor(getDisplayName(detail))};">
                <span>{getInitials(getDisplayName(detail))}</span>
              </div>
              <p class="photos-empty-text">No photos held for this contact.</p>
            </div>
          {:else}
            <div class="photos-modal-grid">
              {#each contactPhotos as photo}
                <div class="photo-card" aria-label="{photo.label}">
                  <div class="photo-circle">
                    <img
                      src={photo.displayUrl}
                      alt={photo.label}
                      referrerpolicy="no-referrer"
                      onerror={(e) => { (e.currentTarget as HTMLElement).classList.add('avatar-img-failed'); }}
                    />
                  </div>
                  <div class="photo-label-row">
                    <span class="photo-label">{photo.label}</span>
                    {#if photo.type === 'profile'}
                      {@const infoText = photo.sourceEmail
                        ? `This profile picture comes from the account for: ${photo.sourceEmail}`
                        : 'This profile picture comes from a linked Google Account'}
                      <span
                        class="photo-info-icon material-symbols-outlined"
                        role="button"
                        tabindex="0"
                        aria-label={infoText}
                        onmouseenter={(e) => {
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          photoInfoTooltip = { text: infoText, x: rect.left + rect.width / 2, y: rect.top - 10 };
                        }}
                        onmouseleave={() => { photoInfoTooltip = null; }}
                        onfocus={(e) => {
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          photoInfoTooltip = { text: infoText, x: rect.left + rect.width / 2, y: rect.top - 10 };
                        }}
                        onblur={() => { photoInfoTooltip = null; }}
                      >info</span>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>

      <!-- Photo info tooltip — rendered inside the fixed overlay so it is never clipped -->
      {#if photoInfoTooltip}
        <div
          class="photo-info-popover"
          style="left: {photoInfoTooltip.x}px; top: {photoInfoTooltip.y}px;"
          role="tooltip"
        >
          {photoInfoTooltip.text}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Floating Material Design Tooltip (Rendered at root, never clipped or hidden) -->
  {#if activeFloatingTooltip}
    <div
      class="floating-global-tooltip pos-{activeFloatingTooltip.pos}"
      style="left: {activeFloatingTooltip.x}px; top: {activeFloatingTooltip.y}px;"
      role="tooltip"
    >
      {activeFloatingTooltip.text}
    </div>
  {/if}

  <!-- Global Custom Desktop Context Menu -->
  <ContextMenu />
</div>
