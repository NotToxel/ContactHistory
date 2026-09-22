import { DEFAULT_COLUMNS, DEFAULT_COLUMN_WIDTHS, SIDEBAR } from './layout';
import { showToast } from './actions/notifications';
import * as configuration from './configuration';
import * as selectors from './selectors';
import { registerLifecycle } from './lifecycle';
import { type MissingField } from '../lib/missing-fields';
import { readPreferences, getEffectiveCountry } from '../lib/preferences';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { UnlistenFn } from '@tauri-apps/api/event';
import {
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
} from '../lib/ipc';
import type { ContactScope, Page, ColumnKey } from './types';
import * as actions_printing from './actions/printing';
import * as actions_preferences from './actions/preferences';
import * as actions_dialog from './actions/dialog';
import * as actions_avatars from './actions/avatars';
import * as actions_search from './actions/search';
import * as actions_downloads from './actions/downloads';
import * as actions_contact_fields from './actions/contact-fields';
import * as actions_contact_history from './actions/contact-history';
import * as actions_window from './actions/window';
import * as actions_navigation from './actions/navigation';
import * as actions_accounts from './actions/accounts';
import * as actions_search_events from './actions/search-events';
import * as actions_changes from './actions/changes';
import * as actions_contacts from './actions/contacts';
import * as actions_archive from './actions/archive';
import * as actions_columns from './actions/columns';
import * as actions_sidebar from './actions/sidebar';
import * as actions_photo_export from './actions/photo-export';
import * as actions_keyboard from './actions/keyboard';
import * as actions_context_menu from './actions/context-menu';
/** Per-window reactive state. Feature actions live in actions/; rendering lives in views/. */
export class AppModel {
  showToast = showToast.bind(this);
  toastTimeout: ReturnType<typeof setTimeout> | undefined;
  activeDragCleanup: (() => void) | undefined;
  changeMissingFields = actions_printing.changeMissingFields.bind(this);
  prepareScopes = actions_printing.prepareScopes.bind(this);
  openPrintDialog = actions_printing.openPrintDialog.bind(this);
  printChosenContacts = actions_printing.printChosenContacts.bind(this);
  showTooltip = actions_preferences.showTooltip.bind(this);
  hideTooltip = actions_preferences.hideTooltip.bind(this);
  syncSystemTheme = actions_preferences.syncSystemTheme.bind(this);
  updatePreferences = actions_preferences.updatePreferences.bind(this);
  focusDialog = actions_dialog.focusDialog.bind(this);
  getDisplayName = actions_avatars.getDisplayName.bind(this);
  getAvatarColor = actions_avatars.getAvatarColor.bind(this);
  getAvatarInitial = actions_avatars.getAvatarInitial.bind(this);
  getInitials = actions_avatars.getInitials.bind(this);
  getPhotoUrl = actions_avatars.getPhotoUrl.bind(this);
  getAvatarSource = actions_avatars.getAvatarSource.bind(this);
  normalizeSearchText = actions_search.normalizeSearchText.bind(this);
  levenshtein = actions_search.levenshtein.bind(this);
  matchesToken = actions_search.matchesToken.bind(this);
  matchesContact = actions_search.matchesContact.bind(this);
  updateDisplayedContacts = actions_search.updateDisplayedContacts.bind(this);
  copyFieldValue = actions_downloads.copyFieldValue.bind(this);
  downloadContactJson = actions_downloads.downloadContactJson.bind(this);
  downloadContactVcf = actions_downloads.downloadContactVcf.bind(this);
  downloadContactCsv = actions_downloads.downloadContactCsv.bind(this);
  getPrimaryEmail = actions_contact_fields.getPrimaryEmail.bind(this);
  getAllEmails = actions_contact_fields.getAllEmails.bind(this);
  isFavourite = actions_contact_fields.isFavourite.bind(this);
  getContactSortKey = actions_contact_fields.getContactSortKey.bind(this);
  getPrimaryPhone = actions_contact_fields.getPrimaryPhone.bind(this);
  getAllPhones = actions_contact_fields.getAllPhones.bind(this);
  getBirthday = actions_contact_fields.getBirthday.bind(this);
  getContactLabelItems = actions_contact_fields.getContactLabelItems.bind(this);
  getContactLabels = actions_contact_fields.getContactLabels.bind(this);
  getNickname = actions_contact_fields.getNickname.bind(this);
  getOrganization = actions_contact_fields.getOrganization.bind(this);
  getPrimaryAddress = actions_contact_fields.getPrimaryAddress.bind(this);
  getAllAddresses = actions_contact_fields.getAllAddresses.bind(this);
  getNotes = actions_contact_fields.getNotes.bind(this);
  getAllRelations = actions_contact_fields.getAllRelations.bind(this);
  getAllEvents = actions_contact_fields.getAllEvents.bind(this);
  getAllUrls = actions_contact_fields.getAllUrls.bind(this);
  getAllUserDefined = actions_contact_fields.getAllUserDefined.bind(this);
  getAddressMapsUrl = actions_contact_fields.getAddressMapsUrl.bind(this);
  getMapsUrlFromAddress = actions_contact_fields.getMapsUrlFromAddress.bind(this);
  formatCaptureTime = actions_contact_fields.formatCaptureTime.bind(this);
  formatRelativeTime = actions_contact_fields.formatRelativeTime.bind(this);
  getLastEditedInfo = actions_contact_fields.getLastEditedInfo.bind(this);
  getFirstSeenInfo = actions_contact_fields.getFirstSeenInfo.bind(this);
  toggleHistoryVersionExpanded = actions_contact_history.toggleHistoryVersionExpanded.bind(this);
  winMinimize = actions_window.winMinimize.bind(this);
  winToggleMaximize = actions_window.winToggleMaximize.bind(this);
  winClose = actions_window.winClose.bind(this);
  onTopbarMouseDown = actions_window.onTopbarMouseDown.bind(this);
  currentNavigation = actions_navigation.currentNavigation.bind(this);
  recordNavigation = actions_navigation.recordNavigation.bind(this);
  goBack = actions_navigation.goBack.bind(this);
  goForward = actions_navigation.goForward.bind(this);
  restoreNavigation = actions_navigation.restoreNavigation.bind(this);
  handlePopState = actions_navigation.handlePopState.bind(this);
  handleNativeNavigation = actions_navigation.handleNativeNavigation.bind(this);
  navigate = actions_navigation.navigate.bind(this);
  refreshAccounts = actions_accounts.refreshAccounts.bind(this);
  selectAccount = actions_accounts.selectAccount.bind(this);
  refreshGroups = actions_accounts.refreshGroups.bind(this);
  refreshContacts = actions_accounts.refreshContacts.bind(this);
  onSearchInput = actions_search_events.onSearchInput.bind(this);
  onSearchFocus = actions_search_events.onSearchFocus.bind(this);
  clearSearch = actions_search_events.clearSearch.bind(this);
  selectSearchResult = actions_search_events.selectSearchResult.bind(this);
  scrollActiveSearchResultIntoView =
    actions_search_events.scrollActiveSearchResultIntoView.bind(this);
  onSearchKeyDown = actions_search_events.onSearchKeyDown.bind(this);
  handleWindowClick = actions_search_events.handleWindowClick.bind(this);
  updateStickyState = actions_contact_history.updateStickyState.bind(this);
  refreshChanges = actions_changes.refreshChanges.bind(this);
  refreshChangesComparison = actions_changes.refreshChangesComparison.bind(this);
  refreshAllChanges = actions_changes.refreshAllChanges.bind(this);
  swapComparisonSnapshots = actions_changes.swapComparisonSnapshots.bind(this);
  compareSnapshotWithPrior = actions_changes.compareSnapshotWithPrior.bind(this);
  toggleSnapshotCollapse = actions_changes.toggleSnapshotCollapse.bind(this);
  selectContact = actions_contacts.selectContact.bind(this);
  selectLabelFilter = actions_contacts.selectLabelFilter.bind(this);
  toggleLabelFilter = actions_contacts.toggleLabelFilter.bind(this);
  isolateLabelFilter = actions_contacts.isolateLabelFilter.bind(this);
  clearLabelFilter = actions_contacts.clearLabelFilter.bind(this);
  changeCapture = actions_contacts.changeCapture.bind(this);
  previewContactRevision = actions_contacts.previewContactRevision.bind(this);
  restoreContactRevision = actions_contacts.restoreContactRevision.bind(this);
  deleteSelectedSnapshot = actions_archive.deleteSelectedSnapshot.bind(this);
  resetAllDatabase = actions_archive.resetAllDatabase.bind(this);
  captureNow = actions_archive.captureNow.bind(this);
  importCsv = actions_archive.importCsv.bind(this);
  cancelCapture = actions_archive.cancelCapture.bind(this);
  onResizeStart = actions_columns.onResizeStart.bind(this);
  getColumnLabel = actions_columns.getColumnLabel.bind(this);
  selectColumnForSlot = actions_columns.selectColumnForSlot.bind(this);
  setSortField = actions_columns.setSortField.bind(this);
  toggleSortDirection = actions_columns.toggleSortDirection.bind(this);
  setSortDirection = actions_columns.setSortDirection.bind(this);
  moveColumnSlot = actions_columns.moveColumnSlot.bind(this);
  startPointerDrag = actions_columns.startPointerDrag.bind(this);
  handleColDragStart = actions_columns.handleColDragStart.bind(this);
  handleColDragOver = actions_columns.handleColDragOver.bind(this);
  handleColDrop = actions_columns.handleColDrop.bind(this);
  handleColDragEnd = actions_columns.handleColDragEnd.bind(this);
  toggleColumn = actions_columns.toggleColumn.bind(this);
  moveColumn = actions_columns.moveColumn.bind(this);
  resetColumns = actions_columns.resetColumns.bind(this);
  startSidebarResize = actions_sidebar.startSidebarResize.bind(this);
  resetSidebarWidth = actions_sidebar.resetSidebarWidth.bind(this);
  handleSidebarResizerKeyDown = actions_sidebar.handleSidebarResizerKeyDown.bind(this);
  updateSchedule = actions_preferences.updateSchedule.bind(this);
  toggleSchedule = actions_preferences.toggleSchedule.bind(this);
  exportSelected = actions_downloads.exportSelected.bind(this);
  toggleContactSelection = actions_downloads.toggleContactSelection.bind(this);
  selectAllVisible = actions_downloads.selectAllVisible.bind(this);
  clearContactSelection = actions_downloads.clearContactSelection.bind(this);
  toggleSelectAll = actions_downloads.toggleSelectAll.bind(this);
  triggerFileDownload = actions_downloads.triggerFileDownload.bind(this);
  downloadSelectedCsv = actions_downloads.downloadSelectedCsv.bind(this);
  downloadSelectedVcf = actions_downloads.downloadSelectedVcf.bind(this);
  downloadSelectedJson = actions_downloads.downloadSelectedJson.bind(this);
  sendEmailToSelected = actions_downloads.sendEmailToSelected.bind(this);
  openPhotoExport = actions_photo_export.openPhotoExport.bind(this);
  detailPhotoUrl = actions_photo_export.detailPhotoUrl.bind(this);
  openPhotoQualityMenu = actions_photo_export.openPhotoQualityMenu.bind(this);
  downloadDetailPhoto = actions_photo_export.downloadDetailPhoto.bind(this);
  startPhotoExport = actions_photo_export.startPhotoExport.bind(this);
  backupSelected = actions_accounts.backupSelected.bind(this);
  restoreLocal = actions_accounts.restoreLocal.bind(this);
  disconnectSelected = actions_accounts.disconnectSelected.bind(this);
  connectNewAccount = actions_accounts.connectNewAccount.bind(this);
  handleGlobalKeyDown = actions_keyboard.handleGlobalKeyDown.bind(this);
  formatContactSummary = actions_contact_fields.formatContactSummary.bind(this);
  handleGlobalContextMenu = actions_context_menu.handleGlobalContextMenu.bind(this);

  missingFields = $state<MissingField[]>([]);
  missingFieldMode = $state<'any' | 'all'>('any');
  scopeChoices = $state<ContactScope[]>([]);
  printScope = $state('all');
  photoExportScope = $state('all');
  showPrintDialog = $state(false);
  printContacts = $state<Contact[]>([]);
  printing = $state(false);
  preferences = $state(readPreferences());
  preferenceNotice = $state('');
  settingsTab = $state<'preferences' | 'schedule' | 'about'>('preferences');
  scheduleBusy = $state(false);
  scheduleReady = $state(false);
  settingsError = $state('');
  scheduleConfig = $state<ScheduleConfig>({
    enabled: false,
    interval_days: 7,
    time_of_day: '09:00',
    run_at_logon: true,
    run_daily: true,
  });
  activeFloatingTooltip = $state<{
    text: string;
    x: number;
    y: number;
    pos: 'right' | 'top';
  } | null>(null);
  effectiveCountry = $derived(getEffectiveCountry(this.preferences));
  countryOptions = configuration.countryOptions;
  densityOptions = configuration.densityOptions;
  birthdayFormatOptions = configuration.birthdayFormatOptions;
  sortFieldOptions = configuration.sortFieldOptions;
  sortDirectionOptions = configuration.sortDirectionOptions;
  intervalOptions = configuration.intervalOptions;
  colorScheme = matchMedia('(prefers-color-scheme: dark)');
  appWindow = getCurrentWindow();
  ALL_COLUMNS = configuration.ALL_COLUMNS;
  AVAILABLE_SELECT_COLUMNS = configuration.AVAILABLE_SELECT_COLUMNS;
  accounts: Account[] = $state([]);
  selected: Account | undefined = $state();
  accountProfile = $state<{
    email: string;
    name?: string | null;
    picture?: string | null;
  } | null>(null);
  sidebarCollapsed = $state(false);
  sidebarWidth = $state<number>(SIDEBAR.defaultWidth);
  isResizingSidebar = $state(false);
  captures: Capture[] = $state([]);
  capture: Capture | undefined = $state();
  groups: GroupRow[] = $state([]);
  selectedGroups = $state<string[]>([]);
  selectedGroup = $derived(this.selectedGroups[0] ?? null);
  labelMatchMode = $state<'any' | 'all'>('any');
  allSnapshotContacts: Contact[] = $state([]);
  avatarMap: Record<string, string> = $state({});
  mediaCache = new Map<string, MediaView[]>();
  searchInputEl: HTMLInputElement | null = $state(null);
  searchDropdownEl: HTMLDivElement | null = $state(null);
  searchDropdownOpen = $state(false);
  searchActiveIndex = $state(0);
  contacts: Contact[] = $state([]);
  selectedContactKeys = $state<string[]>([]);
  showSelectionMenu = $state(false);
  showDownloadMenu = $state(false);
  selectedCount = $derived(this.selectedContactKeys.length);
  isAllSelected = $derived(
    this.contacts.length > 0 &&
      this.contacts.every((c) => this.selectedContactKeys.includes(c.resource_name)),
  );
  isIndeterminate = $derived(this.selectedContactKeys.length > 0 && !this.isAllSelected);
  selectedContactsList = $derived(
    this.contacts.filter((c) => this.selectedContactKeys.includes(c.resource_name)),
  );
  detail: Contact | undefined = $state();
  media: MediaView[] = $state([]);
  due: DueStatus | undefined = $state();
  scheduled = $state(false);
  connected = $state(false);
  changes: Change[] = $state([]);
  chosenChange: Change | undefined = $state();
  pageView: Page = $state('onboarding');
  navigationIndex = $state(0);
  navigationMaxIndex = $state(0);
  navigationReady = false;
  restoringNavigation = false;
  navigationQueued = false;
  navigationRequest = 0;
  hasData = $derived(Boolean(this.selected && this.captures.length > 0));
  dateInput = $state('');
  search = $state('');
  clientId = $state('');
  clientSecret = $state('');
  busy = $state(false);
  error = $state('');
  offset = $state(0);
  contactsRequest = 0;
  isMaximized = $state(false);
  showColCustomizer = $state(false);
  showSnapshotDropdown = $state(false);
  showAccountMenu = $state(false);
  showSettingsModal = $state(false);
  showRawDataModal = $state(false);
  showDetailMenu = $state(false);
  showPhotoQualityMenu = $state(false);
  photoQualityInfo: PhotoQualityInfo | null = $state(null);
  photoQualityLoading = $state(false);
  photoQualityError = $state('');
  photoQualitySelection: number | null = $state(null);
  photoDownloadBusy = $state(false);
  photoQualityRequest = 0;
  showStickyName = $state(false);
  isScrolled = $state(false);
  detailViewEl = $state<HTMLElement | null>(null);
  topNavEl = $state<HTMLElement | null>(null);
  heroAvatarEl = $state<HTMLElement | null>(null);
  showPhotosModal = $state(false);
  photoInfoTooltip: {
    text: string;
    x: number;
    y: number;
  } | null = $state(null);
  selectedPhotoUrl: string | null = $state(null);
  showPhotoExportModal = $state(false);
  photoExportFormat = $state<'folder' | 'zip'>('folder');
  photoExportQuality = $state<number | null>(null);
  photoExportImageFormat = $state<'original' | 'jpg' | 'png' | 'webp'>('original');
  photoExportBusy = $state(false);
  photoExportProgress = $state<PhotoExportProgress | null>(null);
  photoExportResult = $state<PhotoExportResult | null>(null);
  photoExportError = $state('');
  compareBaseSeq: number | null = $state(null);
  compareTargetSeq: number | null = $state(null);
  changesTab = $state<'comparison' | 'changelog'>('comparison');
  comparisonSearch = $state('');
  comparisonKindFilter = $state<'all' | 'added' | 'changed' | 'removed'>('all');
  changelogList = $state<ChangelogEntry[]>([]);
  loadingChangelog = $state(false);
  changelogSearch = $state('');
  changelogKindFilter = $state<'all' | 'added' | 'changed' | 'removed'>('all');
  collapsedSnapshots = $state<Set<number>>(new Set());
  copiedFieldKey = $state<string | null>(null);
  copiedTimeout: ReturnType<typeof setTimeout> | undefined;
  contactHistory = $state<ContactHistoryEntry[]>([]);
  originalDetail: Contact | undefined = $state(undefined);
  previewSequence: number | null = $state(null);
  previewBusy = $state(false);
  previewRequest = 0;
  loadingHistory = $state(false);
  expandedHistoryVersions = $state<Set<number>>(new Set());
  captureProgress = $state<CaptureProgress | null>(null);
  toastMessage = $state('');
  deleteSnapshotTarget = $state<Capture | null>(null);
  showResetDatabaseConfirm = $state(false);
  archiveActionBusy = $state(false);
  activeColKeys = $state<ColumnKey[]>([...DEFAULT_COLUMNS]);
  colWidths = $state<Record<ColumnKey, number>>({ ...DEFAULT_COLUMN_WIDTHS });
  openColDropdownSlot = $state<number | null>(null);
  draggedColIndex = $state<number | null>(null);
  dragOverColIndex = $state<number | null>(null);
  pointerDragSlot = $state<number | null>(null);
  pointerOverSlot = $state<number | null>(null);
  nameSortField = $state<'first' | 'last'>('first');
  nameSortDirection = $state<'asc' | 'desc'>('asc');
  showSortMenu = $state(false);
  groupMap = $derived(selectors.groupMap.call(this));
  activeGroups = $derived(selectors.activeGroups.call(this));
  activeGroup = $derived(selectors.activeGroup.call(this));
  hiddenCols = $derived(selectors.hiddenCols.call(this));
  GOOGLE_AVATAR_COLORS = configuration.GOOGLE_AVATAR_COLORS;
  searchResults = $derived(selectors.searchResults.call(this));
  sortedContacts = $derived(selectors.sortedContacts.call(this));
  favouriteContacts = $derived(selectors.favouriteContacts.call(this));
  otherContacts = $derived(selectors.otherContacts.call(this));
  detailLastEdited = $derived(this.getLastEditedInfo(this.detail, this.contactHistory));
  detailFirstSeen = $derived(this.getFirstSeenInfo(this.detail, this.contactHistory));
  filteredComparisonChanges = $derived(selectors.filteredComparisonChanges.call(this));
  comparisonStats = $derived(selectors.comparisonStats.call(this));
  filteredChangelog = $derived(selectors.filteredChangelog.call(this));
  changelogStats = $derived(selectors.changelogStats.call(this));
  changelogSnapshotGroups = $derived(selectors.changelogSnapshotGroups.call(this));
  resizingCol = $state<ColumnKey | null>(null);
  startX = 0;
  startWidth = 0;
  unlistenProgress: UnlistenFn | undefined;

  constructor() {
    registerLifecycle.call(this);
  }
}
