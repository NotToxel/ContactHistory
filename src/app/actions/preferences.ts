import { savePreferences, applyPreferences, type Preferences } from '../../lib/preferences';
import { api, type ScheduleConfig } from '../../lib/ipc';
import type { AppModel } from '../model.svelte';
export function showTooltip(
  this: Pick<AppModel, 'activeFloatingTooltip'>,
  e: MouseEvent | FocusEvent,
  text: string,
  pos: 'right' | 'top' = 'right',
): void {
  const target = e.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  if (pos === 'right') {
    const estimatedWidth = text.length * 7 + 24;
    if (rect.right + estimatedWidth + 12 > window.innerWidth) {
      this.activeFloatingTooltip = {
        text,
        x: rect.left + rect.width / 2,
        y: rect.top - 6,
        pos: 'top',
      };
    } else {
      this.activeFloatingTooltip = {
        text,
        x: rect.right + 8,
        y: rect.top + rect.height / 2,
        pos: 'right',
      };
    }
  } else {
    this.activeFloatingTooltip = {
      text,
      x: rect.left + rect.width / 2,
      y: rect.top - 6,
      pos: 'top',
    };
  }
}

export function hideTooltip(this: Pick<AppModel, 'activeFloatingTooltip'>): void {
  this.activeFloatingTooltip = null;
}

export function syncSystemTheme(this: Pick<AppModel, 'preferences'>): void {
  applyPreferences(this.preferences);
}

export function updatePreferences(
  this: Pick<AppModel, 'preferenceNotice' | 'preferences'>,
  patch: Partial<Preferences>,
): void {
  this.preferences = { ...this.preferences, ...patch };
  this.preferenceNotice = savePreferences(this.preferences)
    ? ''
    : 'Applied for this session; storage is unavailable';
}

// Settings Actions
export async function updateSchedule(
  this: Pick<
    AppModel,
    | 'due'
    | 'scheduleBusy'
    | 'scheduleConfig'
    | 'scheduleReady'
    | 'scheduled'
    | 'selected'
    | 'settingsError'
  >,
  patch: Partial<ScheduleConfig>,
): Promise<void> {
  if (this.scheduleBusy || !this.scheduleReady) return;
  this.scheduleBusy = true;
  this.settingsError = '';
  const updated = { ...this.scheduleConfig, ...patch };
  this.scheduleConfig = updated;
  this.scheduled = updated.enabled;
  try {
    await api.saveScheduleConfig(updated);
    if (this.selected) {
      this.due = await api.due(this.selected.id);
    }
  } catch (e) {
    this.settingsError = 'Failed to update schedule: ' + String(e);
  } finally {
    this.scheduleBusy = false;
  }
}

export async function toggleSchedule(
  this: Pick<AppModel, 'scheduleConfig' | 'updateSchedule'>,
): Promise<void> {
  await this.updateSchedule({ enabled: !this.scheduleConfig.enabled });
}
