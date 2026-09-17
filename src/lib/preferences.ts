export type Preferences = { theme: 'system' | 'light' | 'dark'; density: 'comfortable' | 'compact'; reduceMotion: boolean };
const key = 'contact-history-preferences';
export function readPreferences(): Preferences {
  const defaults: Preferences = { theme: 'system', density: 'comfortable', reduceMotion: false };
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}');
    return {
      theme: ['system', 'light', 'dark'].includes(value?.theme) ? value.theme : defaults.theme,
      density: value?.density === 'compact' ? 'compact' : defaults.density,
      reduceMotion: value?.reduceMotion === true,
    };
  } catch { return defaults; }
}
export function applyPreferences(value: Preferences) {
  const root = document.documentElement;
  root.dataset.theme = value.theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : value.theme;
  root.dataset.density = value.density;
  root.dataset.reduceMotion = String(value.reduceMotion);
}
export function savePreferences(value: Preferences): boolean {
  applyPreferences(value);
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
