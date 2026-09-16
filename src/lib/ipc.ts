import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export type Account = { id: string; subject: string; email: string };
export type Capture = { sequence: number; started_at: string; committed_at: string; contact_count: number; group_count: number; media_complete: boolean };
export type Contact = { resource_name: string; display_name: string; payload: Record<string, unknown>; version: number };
export type MediaView = { status: string; data_url: string | null; retrieved_at: string | null };
export type DueStatus = { due: boolean; next_due_at: string | null };
export type Change = { resource_name: string; kind: string; version: number; before: Record<string, unknown> | null; after: Record<string, unknown> | null };
export type CaptureProgress = {
  account_id: string;
  stage: 'contacts' | 'groups' | 'media' | 'indexing' | 'complete';
  message: string;
  current?: number | null;
  total?: number | null;
  percent?: number | null;
};

export const listenCaptureProgress = (cb: (progress: CaptureProgress) => void): Promise<UnlistenFn> => {
  return listen<CaptureProgress>('capture-progress', (event) => cb(event.payload));
};

export const api = {
  accounts: () => invoke<Account[]>('list_accounts'),
  connect: (clientId: string, clientSecret: string) => invoke<Account>('connect_google', { clientId, clientSecret }),
  capture: (accountId: string) => invoke<Capture>('capture_now', { accountId }),
  captures: (accountId: string) => invoke<Capture[]>('list_captures', { accountId }),
  captureAt: (accountId: string, time: string) => invoke<Capture | null>('capture_at_time', { accountId, time }),
  changes: (accountId: string, sequence: number, offset: number) => invoke<Change[]>('list_changes', { accountId, sequence, offset }),
  contacts: (accountId: string, sequence: number, search: string, offset: number) => invoke<Contact[]>('list_contacts', { accountId, sequence, search, offset }),
  health: (accountId: string) => invoke<{ connected: boolean; last_capture: string | null }>('account_health', { accountId }),
  disconnect: (accountId: string) => invoke<void>('disconnect_account', { accountId }),
  media: (accountId: string, sequence: number, resourceName: string) => invoke<MediaView[]>('contact_media', { accountId, sequence, resourceName }),
  due: (accountId: string) => invoke<DueStatus>('due_status', { accountId }),
  captureDue: (accountId: string) => invoke<Capture | null>('capture_if_due', { accountId }),
  retryMedia: (accountId: string) => invoke<number>('retry_media', { accountId }),
  scheduleState: () => invoke<boolean>('schedule_state'),
  enableSchedule: () => invoke<void>('enable_schedule'),
  disableSchedule: () => invoke<void>('disable_schedule'),
  exportCapture: (accountId: string, sequence: number, format: string, destination: string) => invoke<void>('export_capture', { accountId, sequence, format, destination }),
  backupAccount: (accountId: string, destination: string) => invoke<void>('backup_account', { accountId, destination }),
  restoreArchive: (source: string) => invoke<Account>('restore_archive', { source }),
};
