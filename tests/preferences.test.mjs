import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPreferences, applyPreferences, savePreferences } from '../src/lib/preferences.ts';

test('preferences validate persisted values and tolerate unavailable storage', () => {
  let stored = '{"theme":"dark","density":"compact","reduceMotion":true}';
  globalThis.localStorage = { getItem: () => stored, setItem: (_key, value) => { stored = value; } };
  assert.deepEqual(readPreferences(), { theme: 'dark', density: 'compact', reduceMotion: true });
  stored = '{"theme":"invalid","density":null,"reduceMotion":"true"}';
  assert.deepEqual(readPreferences(), { theme: 'system', density: 'comfortable', reduceMotion: false });
  for (const value of ['null', '{broken']) {
    stored = value;
    assert.equal(readPreferences().theme, 'system');
  }
  globalThis.document = { documentElement: { dataset: {} } };
  let dark = true;
  globalThis.matchMedia = () => ({ matches: dark });
  const settings = { theme: 'system', density: 'compact', reduceMotion: true };
  applyPreferences(settings);
  assert.equal(document.documentElement.dataset.theme, 'dark');
  dark = false;
  applyPreferences(settings);
  assert.equal(document.documentElement.dataset.theme, 'light');
  assert.equal(savePreferences({ ...settings, theme: 'dark' }), true);
  assert.equal(readPreferences().theme, 'dark');
  assert.equal(document.documentElement.dataset.theme, 'dark');
  localStorage.setItem = () => { throw Error('storage denied'); };
  assert.equal(savePreferences(settings), false);
  assert.equal(document.documentElement.dataset.theme, 'light');
  assert.equal(document.documentElement.dataset.density, 'compact');
  assert.equal(document.documentElement.dataset.reduceMotion, 'true');
});
