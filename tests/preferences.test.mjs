import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPreferences, applyPreferences, savePreferences, formatBirthdayDate } from '../src/lib/preferences.ts';

test('preferences validate persisted values and tolerate unavailable storage', () => {
  let stored = '{"theme":"dark","density":"compact","reduceMotion":true,"birthdayFormat":"month-day-year"}';
  globalThis.localStorage = { getItem: () => stored, setItem: (_key, value) => { stored = value; } };
  assert.deepEqual(readPreferences(), { theme: 'dark', density: 'compact', reduceMotion: true, defaultCountry: 'auto', birthdayFormat: 'month-day-year' });
  stored = '{"theme":"invalid","density":null,"reduceMotion":"true","birthdayFormat":"invalid-format"}';
  assert.deepEqual(readPreferences(), { theme: 'system', density: 'comfortable', reduceMotion: false, defaultCountry: 'auto', birthdayFormat: 'day-month-year' });
  for (const value of ['null', '{broken']) {
    stored = value;
    assert.equal(readPreferences().theme, 'system');
  }
  globalThis.document = { documentElement: { dataset: {} } };
  let dark = true;
  globalThis.matchMedia = () => ({ matches: dark });
  const settings = { theme: 'system', density: 'compact', reduceMotion: true, defaultCountry: 'auto', birthdayFormat: 'day-month-year' };
  applyPreferences(settings);
  assert.equal(document.documentElement.dataset.theme, 'dark');
  dark = false;
  applyPreferences(settings);
  assert.equal(document.documentElement.dataset.theme, 'light');
  assert.equal(savePreferences({ ...settings, theme: 'dark', birthdayFormat: 'iso' }), true);
  assert.equal(readPreferences().theme, 'dark');
  assert.equal(readPreferences().birthdayFormat, 'iso');
  assert.equal(document.documentElement.dataset.theme, 'dark');
  localStorage.setItem = () => { throw Error('storage denied'); };
  assert.equal(savePreferences(settings), false);
  assert.equal(document.documentElement.dataset.theme, 'light');
  assert.equal(document.documentElement.dataset.density, 'compact');
  assert.equal(document.documentElement.dataset.reduceMotion, 'true');
});

test('formatBirthdayDate correctly formats dates across all options and handles missing years', () => {
  const fullDate = { day: 15, month: 1, year: 1990 };
  assert.equal(formatBirthdayDate(fullDate, '', 'day-month-year'), '15 January 1990');
  assert.equal(formatBirthdayDate(fullDate, '', 'month-day-year'), 'January 15, 1990');
  assert.equal(formatBirthdayDate(fullDate, '', 'short-day-month'), '15 Jan 1990');
  assert.equal(formatBirthdayDate(fullDate, '', 'short-month-day'), 'Jan 15, 1990');
  assert.equal(formatBirthdayDate(fullDate, '', 'iso'), '1990-01-15');
  assert.equal(formatBirthdayDate(fullDate, '', 'eu-numeric'), '15/01/1990');
  assert.equal(formatBirthdayDate(fullDate, '', 'us-numeric'), '01/15/1990');

  const noYearDate = { day: 25, month: 12 };
  assert.equal(formatBirthdayDate(noYearDate, '', 'day-month-year'), '25 December');
  assert.equal(formatBirthdayDate(noYearDate, '', 'month-day-year'), 'December 25');
  assert.equal(formatBirthdayDate(noYearDate, '', 'short-day-month'), '25 Dec');
  assert.equal(formatBirthdayDate(noYearDate, '', 'short-month-day'), 'Dec 25');
  assert.equal(formatBirthdayDate(noYearDate, '', 'iso'), '12-25');
  assert.equal(formatBirthdayDate(noYearDate, '', 'eu-numeric'), '25/12');
  assert.equal(formatBirthdayDate(noYearDate, '', 'us-numeric'), '12/25');

  assert.equal(formatBirthdayDate(null, 'Custom Birthday text'), 'Custom Birthday text');
  assert.equal(formatBirthdayDate(null, null), '');
});
