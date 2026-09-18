import { detectSystemCountry } from './phone';

export type BirthdayFormat =
  | 'day-month-year'
  | 'month-day-year'
  | 'short-day-month'
  | 'short-month-day'
  | 'iso'
  | 'eu-numeric'
  | 'us-numeric';

export type Preferences = {
  theme: 'system' | 'light' | 'dark';
  density: 'comfortable' | 'compact';
  reduceMotion: boolean;
  defaultCountry: string; // 'auto' or ISO 2-letter country code
  birthdayFormat: BirthdayFormat;
};

const key = 'contact-history-preferences';

const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export interface BirthdayDateObj {
  day?: number;
  month?: number;
  year?: number;
}

export function formatBirthdayDate(
  date?: BirthdayDateObj | null,
  fallbackText?: string | null,
  format: BirthdayFormat = 'day-month-year'
): string {
  if (!date || (!date.day && !date.month && !date.year)) {
    return fallbackText?.trim() || '';
  }

  const day = date.day;
  const month = date.month;
  const year = date.year;

  const dd = day ? String(day).padStart(2, '0') : '';
  const mm = month ? String(month).padStart(2, '0') : '';
  const yyyy = year ? String(year) : '';

  const mName = (month && month >= 1 && month <= 12) ? MONTHS_FULL[month - 1] : '';
  const mShort = (month && month >= 1 && month <= 12) ? MONTHS_SHORT[month - 1] : '';

  switch (format) {
    case 'month-day-year': {
      if (mName && day && yyyy) return `${mName} ${day}, ${yyyy}`;
      if (mName && day) return `${mName} ${day}`;
      if (mName && yyyy) return `${mName} ${yyyy}`;
      return [mName, day, yyyy].filter(Boolean).join(' ');
    }
    case 'short-day-month': {
      if (day && mShort && yyyy) return `${day} ${mShort} ${yyyy}`;
      if (day && mShort) return `${day} ${mShort}`;
      if (mShort && yyyy) return `${mShort} ${yyyy}`;
      return [day, mShort, yyyy].filter(Boolean).join(' ');
    }
    case 'short-month-day': {
      if (mShort && day && yyyy) return `${mShort} ${day}, ${yyyy}`;
      if (mShort && day) return `${mShort} ${day}`;
      if (mShort && yyyy) return `${mShort} ${yyyy}`;
      return [mShort, day, yyyy].filter(Boolean).join(' ');
    }
    case 'iso': {
      if (yyyy && mm && dd) return `${yyyy}-${mm}-${dd}`;
      if (mm && dd) return `${mm}-${dd}`;
      if (yyyy && mm) return `${yyyy}-${mm}`;
      return [yyyy, mm, dd].filter(Boolean).join('-');
    }
    case 'eu-numeric': {
      if (dd && mm && yyyy) return `${dd}/${mm}/${yyyy}`;
      if (dd && mm) return `${dd}/${mm}`;
      if (mm && yyyy) return `${mm}/${yyyy}`;
      return [dd, mm, yyyy].filter(Boolean).join('/');
    }
    case 'us-numeric': {
      if (mm && dd && yyyy) return `${mm}/${dd}/${yyyy}`;
      if (mm && dd) return `${mm}/${dd}`;
      if (mm && yyyy) return `${mm}/${yyyy}`;
      return [mm, dd, yyyy].filter(Boolean).join('/');
    }
    case 'day-month-year':
    default: {
      if (day && mName && yyyy) return `${day} ${mName} ${yyyy}`;
      if (day && mName) return `${day} ${mName}`;
      if (mName && yyyy) return `${mName} ${yyyy}`;
      return [day, mName, yyyy].filter(Boolean).join(' ');
    }
  }
}

const VALID_BIRTHDAY_FORMATS = new Set<BirthdayFormat>([
  'day-month-year',
  'month-day-year',
  'short-day-month',
  'short-month-day',
  'iso',
  'eu-numeric',
  'us-numeric',
]);

export function readPreferences(): Preferences {
  const defaults: Preferences = {
    theme: 'system',
    density: 'comfortable',
    reduceMotion: false,
    defaultCountry: 'auto',
    birthdayFormat: 'day-month-year',
  };
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}');
    return {
      theme: ['system', 'light', 'dark'].includes(value?.theme) ? value.theme : defaults.theme,
      density: value?.density === 'compact' ? 'compact' : defaults.density,
      reduceMotion: value?.reduceMotion === true,
      defaultCountry: typeof value?.defaultCountry === 'string' ? value.defaultCountry : defaults.defaultCountry,
      birthdayFormat: VALID_BIRTHDAY_FORMATS.has(value?.birthdayFormat) ? value.birthdayFormat : defaults.birthdayFormat,
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
