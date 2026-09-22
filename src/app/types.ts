import { type MissingField } from '../lib/missing-fields';
import { type Capture, type Contact, type ChangelogEntry } from '../lib/ipc';
export type ContactScope = { value: string; label: string; contacts: Contact[] };

export type Page = 'contacts' | 'changes' | 'settings' | 'onboarding';

export type ColumnKey =
  | 'name'
  | 'job'
  | 'email'
  | 'phone'
  | 'birthday'
  | 'labels'
  | 'org'
  | 'title'
  | 'address'
  | 'notes';

export interface ColumnDef {
  key: ColumnKey;
  label: string;
  defaultWidth: number;
}

export type NavigationEntry = {
  contactHistoryNavigation: true;
  index: number;
  accountId: string | null;
  snapshot: number | null;
  page: Page;
  contact: string | null;
  groups: string[];
  missingFields?: MissingField[];
  missingFieldMode?: 'any' | 'all';
  changesTab: 'comparison' | 'changelog';
  compareBase: number | null;
  compareTarget: number | null;
};

export interface ContactLabelItem {
  name: string;
  resourceName: string;
}

export interface SnapshotChangelogGroup {
  sequence: number;
  committed_at: string;
  capture?: Capture;
  changes: ChangelogEntry[];
}
