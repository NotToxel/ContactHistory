import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export type Account = { id: string; subject: string; email: string };
export type AccountProfile = { email: string; name: string | null; picture: string | null };
export type Capture = { sequence: number; started_at: string; committed_at: string; contact_count: number; group_count: number; media_complete: boolean };
export type CaptureOutcome = { capture: Capture; is_new: boolean; change_count: number };
export type Contact = { resource_name: string; display_name: string; payload: Record<string, unknown>; version: number };
export type GroupRow = { resource_name: string; name: string; member_count: number | null };
export type ContactHistoryEntry = { sequence: number; committed_at: string; version: number; before: Record<string, unknown> | null; after: Record<string, unknown> | null };
export type ContactSnapshotEntry = { sequence: number; committed_at: string; version: number };
export type MediaView = { source_url: string; status: string; data_url: string | null; retrieved_at: string | null };
export type DueStatus = { due: boolean; next_due_at: string | null };
export type ScheduleConfig = {
  enabled: boolean;
  interval_days: number;
  time_of_day: string;
  run_at_logon: boolean;
  run_daily: boolean;
  is_installed?: boolean;
};
export type Change = { resource_name: string; kind: string; version: number; before: Record<string, unknown> | null; after: Record<string, unknown> | null };
export type ChangelogEntry = {
  capture_sequence: number;
  committed_at: string;
  resource_name: string;
  kind: 'added' | 'changed' | 'removed';
  version: number;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};
export type CaptureProgress = {
  account_id?: string | null;
  stage: 'contacts' | 'groups' | 'media' | 'indexing' | 'complete';
  message: string;
  current?: number | null;
  total?: number | null;
  percent?: number | null;
};

export const listenCaptureProgress = (cb: (progress: CaptureProgress) => void): Promise<UnlistenFn> => {
  return listen<CaptureProgress>('capture-progress', (event) => cb(event.payload));
};

export const listenPhotoExportProgress = (cb: (progress: PhotoExportProgress) => void): Promise<UnlistenFn> => {
  return listen<PhotoExportProgress>('photo-export-progress', (event) => cb(event.payload));
};

export const api = {
  contactHistory: (accountId: string, resourceName: string) => invoke<ContactHistoryEntry[]>('contact_history', { accountId, resourceName }),
  contactAtSnapshot: (accountId: string, sequence: number, resourceName: string) => invoke<Contact | null>('contact_at_snapshot', { accountId, sequence, resourceName }),
  contactSnapshots: (accountId: string, resourceName: string) => invoke<ContactSnapshotEntry[]>('contact_snapshots', { accountId, resourceName }),
  accounts: () => invoke<Account[]>('list_accounts'),
  profile: (accountId: string) => invoke<AccountProfile>('account_profile', { accountId }),
  connect: (clientId: string, clientSecret: string) => invoke<Account>('connect_google', { clientId, clientSecret }),
  capture: (accountId: string) => invoke<CaptureOutcome>('capture_now', { accountId }),
  cancelCapture: (accountId: string) => invoke<boolean>('cancel_capture', { accountId }),
  importCsv: (accountId: string, path: string) => invoke<CaptureOutcome>('import_csv', { accountId, path }),
  captures: (accountId: string) => invoke<Capture[]>('list_captures', { accountId }),
  deleteSnapshot: (accountId: string, sequence: number) => invoke<void>('delete_snapshot', { accountId, sequence }),
  resetDatabase: () => invoke<void>('reset_database'),
  captureAt: (accountId: string, time: string) => invoke<Capture | null>('capture_at_time', { accountId, time }),
  changes: (accountId: string, sequence: number, offset: number) => invoke<Change[]>('list_changes', { accountId, sequence, offset }),
  allChanges: (accountId: string, limit?: number, offset?: number) =>
    invoke<ChangelogEntry[]>('list_all_changes', { accountId, limit, offset }),
  compareSnapshots: (accountId: string, baseSequence: number, targetSequence: number) =>
    invoke<Change[]>('compare_snapshots', { accountId, baseSequence, targetSequence }),
  groups: (accountId: string, sequence: number) => invoke<GroupRow[]>('list_groups', { accountId, sequence }),
  contacts: (accountId: string, sequence: number, search = '', group: string | null = null, offset = 0) =>
    invoke<Contact[]>('list_contacts', { accountId, sequence, search, group, offset }),
  avatars: (accountId: string, sequence: number) => invoke<Record<string, string>>('list_avatars', { accountId, sequence }),
  health: (accountId: string) => invoke<{ connected: boolean; last_capture: string | null }>('account_health', { accountId }),
  disconnect: (accountId: string) => invoke<void>('disconnect_account', { accountId }),
  media: (accountId: string, sequence: number, resourceName: string) => invoke<MediaView[]>('contact_media', { accountId, sequence, resourceName }),
  due: (accountId: string) => invoke<DueStatus>('due_status', { accountId }),
  captureDue: (accountId: string) => invoke<Capture | null>('capture_if_due', { accountId }),
  retryMedia: (accountId: string) => invoke<number>('retry_media', { accountId }),
  scheduleState: () => invoke<boolean>('schedule_state'),
  getScheduleConfig: () => invoke<ScheduleConfig>('get_schedule_config'),
  saveScheduleConfig: (config: ScheduleConfig) => invoke<void>('save_schedule_config', { config }),
  enableSchedule: () => invoke<void>('enable_schedule'),
  disableSchedule: () => invoke<void>('disable_schedule'),
  exportCapture: (accountId: string, sequence: number, format: string, destination: string) => invoke<void>('export_capture', { accountId, sequence, format, destination }),
  saveContactExport: (destination: string, content: string) => invoke<void>('save_contact_export', { destination, content }),
  exportPhotos: (
    accountId: string,
    sequence: number,
    destination: string,
    format: 'folder' | 'zip',
    includeDefault: boolean,
    resourceNames?: string[],
    size?: number | null,
    imageFormat?: 'original' | 'jpg' | 'png' | 'webp'
  ) =>
    invoke<PhotoExportResult>('export_photos', {
      accountId,
      sequence,
      destination,
      format,
      includeDefault,
      resourceNames,
      size,
      imageFormat,
    }),
  exportSinglePhoto: (accountId: string, sequence: number, photoUrl: string, destination: string, size: number | null) =>
    invoke<string>('export_single_photo', { accountId, sequence, photoUrl, destination, size }),
  singlePhotoQuality: (accountId: string, sequence: number, photoUrl: string) =>
    invoke<PhotoQualityInfo>('single_photo_quality', { accountId, sequence, photoUrl }),
  backupAccount: (accountId: string, destination: string) => invoke<void>('backup_account', { accountId, destination }),
  restoreArchive: (source: string) => invoke<Account>('restore_archive', { source }),
  openExternalUrl: (url: string) => invoke<void>('open_external_url', { url }),
  winMinimize: () => invoke<void>('win_minimize'),
  winToggleMaximize: () => invoke<boolean>('win_toggle_maximize'),
  winClose: () => invoke<void>('win_close'),
  winIsMaximized: () => invoke<boolean>('win_is_maximized'),
};

export interface PhotoQualityInfo {
  width: number;
  height: number;
  resizable: boolean;
  extension: string;
}

export interface PhotoExportProgress {
  current: number;
  total: number;
  name: string;
}

export interface PhotoExportResult {
  total_contacts: number;
  exported_photos: number;
  skipped_no_photo: number;
  skipped_default: number;
  destination: string;
}
