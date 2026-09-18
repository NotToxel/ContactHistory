import { detectSystemCountry } from './phone';

export type Preferences = {
  theme: 'system' | 'light' | 'dark';
  density: 'comfortable' | 'compact';
  reduceMotion: boolean;
  defaultCountry: string; // 'auto' or ISO 2-letter country code
};

const key = 'contact-history-preferences';

export function readPreferences(): Preferences {
  const defaults: Preferences = {
    theme: 'system',
    density: 'comfortable',
    reduceMotion: false,
    defaultCountry: 'auto',
  };
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}');
    return {
      theme: ['system', 'light', 'dark'].includes(value?.theme) ? value.theme : defaults.theme,
      density: value?.density === 'compact' ? 'compact' : defaults.density,
      reduceMotion: value?.reduceMotion === true,
      defaultCountry: typeof value?.defaultCountry === 'string' ? value.defaultCountry : defaults.defaultCountry,
    };
  } catch {
    return defaults;
  }
}

export function getEffectiveCountry(prefs: Preferences): string {
  if (prefs.defaultCountry && prefs.defaultCountry !== 'auto') {
    return prefs.defaultCountry.toUpperCase();
  }
  return detectSystemCountry();
}

export function applyPreferences(value: Preferences) {
  const root = document.documentElement;
  root.dataset.theme =
    value.theme === 'system'
      ? matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : value.theme;
  root.dataset.density = value.density;
  root.dataset.reduceMotion = String(value.reduceMotion);
  root.dataset.country = getEffectiveCountry(value);
}

export function savePreferences(value: Preferences): boolean {
  applyPreferences(value);
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
