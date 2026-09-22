import { type SelectOption } from '../lib/CustomSelect.svelte';
import { getCountryOptions } from '../lib/phone';
export const countryOptions: SelectOption[] = getCountryOptions();
export const densityOptions: SelectOption[] = [
  { value: 'comfortable', label: 'Comfortable', sublabel: 'Spacious contact rows' },
  { value: 'compact', label: 'Compact', sublabel: 'Dense table rows' },
];
export const birthdayFormatOptions: SelectOption[] = [
  { value: 'day-month-year', label: '15 January 1990', sublabel: 'Day Month Year (Long)' },
  { value: 'month-day-year', label: 'January 15, 1990', sublabel: 'Month Day, Year (US Long)' },
  { value: 'short-day-month', label: '15 Jan 1990', sublabel: 'Day Mon Year (Abbreviated)' },
  { value: 'short-month-day', label: 'Jan 15, 1990', sublabel: 'Mon Day, Year (US Abbreviated)' },
  { value: 'iso', label: '1990-01-15', sublabel: 'YYYY-MM-DD (ISO 8601)' },
  { value: 'eu-numeric', label: '15/01/1990', sublabel: 'DD/MM/YYYY (Day first)' },
  { value: 'us-numeric', label: '01/15/1990', sublabel: 'MM/DD/YYYY (Month first)' },
];
export const sortFieldOptions: SelectOption[] = [
  { value: 'first', label: 'First name', sublabel: 'Sort by given name' },
  { value: 'last', label: 'Last name', sublabel: 'Sort by family name' },
];
export const sortDirectionOptions: SelectOption[] = [
  { value: 'asc', label: 'Ascending (A → Z)' },
  { value: 'desc', label: 'Descending (Z → A)' },
];
export const intervalOptions: SelectOption[] = [
  { value: 1, label: 'Every 1 day (Daily)', sublabel: 'Snapshot taken every day' },
  { value: 2, label: 'Every 2 days', sublabel: 'Snapshot taken every 48h' },
  { value: 3, label: 'Every 3 days', sublabel: 'Twice a week' },
  { value: 7, label: 'Every 7 days (Weekly)', sublabel: 'Recommended default' },
  { value: 14, label: 'Every 14 days (Bi-weekly)', sublabel: 'Every two weeks' },
  { value: 30, label: 'Every 30 days (Monthly)', sublabel: 'Monthly archiving' },
];
export { ALL_COLUMNS, AVAILABLE_SELECT_COLUMNS } from './layout';
export const GOOGLE_AVATAR_COLORS = [
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
