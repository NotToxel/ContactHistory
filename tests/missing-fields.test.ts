import { describe, expect, test } from 'bun:test';
import { isMissingField, matchesMissingFields, missingFieldOptions } from '../src/lib/missing-fields';
import type { Contact } from '../src/lib/ipc';

const contact = (payload: Record<string, unknown>): Contact => ({ resource_name: 'people/test', display_name: 'Fallback', version: 1, payload });

describe('missing contact fields', () => {
  test('absent fields and blank entries are missing', () => {
    for (const field of missingFieldOptions) expect(isMissingField(contact({}), field.key)).toBe(true);
    expect(isMissingField(contact({ emailAddresses: [null, {}, { value: '  ', type: 'home' }] }), 'email')).toBe(true);
    expect(isMissingField(contact({ phoneNumbers: [{ value: '' }, { value: '123' }] }), 'phone')).toBe(false);
  });
  test('default avatars do not count, real photos do even without cached media', () => {
    expect(isMissingField(contact({ photos: [{ url: 'avatar', default: true }] }), 'photo')).toBe(true);
    expect(isMissingField(contact({ photos: [{ url: 'photo', default: false }] }), 'photo')).toBe(false);
  });
  test('partial and textual birthdays count, empty dates do not', () => {
    for (const birthday of [{ date: { month: 6, day: 12 } }, { text: 'June 12' }]) {
      expect(isMissingField(contact({ birthdays: [birthday] }), 'birthday')).toBe(false);
    }
    expect(isMissingField(contact({ birthdays: [{ date: { year: 0, month: 0, day: 0 } }] }), 'birthday')).toBe(true);
  });
  test('system memberships do not count as labels; custom and unresolved labels do', () => {
    const membership = (id: string) => ({ contactGroupMembership: { contactGroupResourceName: `contactGroups/${id}` } });
    expect(isMissingField(contact({ memberships: [membership('myContacts'), membership('starred')] }), 'labels')).toBe(true);
    expect(isMissingField(contact({ memberships: [membership('custom123')] }), 'labels')).toBe(false);
  });
  test('checks content rather than metadata and distinguishes organization from title', () => {
    const c = contact({ organizations: [{ title: 'Engineer' }], addresses: [{ type: 'home' }], biographies: [{ value: 'Note' }] });
    expect(isMissingField(c, 'organization')).toBe(true);
    expect(isMissingField(c, 'title')).toBe(false);
    expect(isMissingField(c, 'address')).toBe(true);
    expect(isMissingField(c, 'notes')).toBe(false);
    expect(isMissingField(c, 'name')).toBe(true);
  });
  test('any/all composition and clearing filters', () => {
    const c = contact({ emailAddresses: [{ value: 'a@example.com' }] });
    expect(matchesMissingFields(c, ['email', 'phone'], 'any')).toBe(true);
    expect(matchesMissingFields(c, ['email', 'phone'], 'all')).toBe(false);
    expect(matchesMissingFields(c, [], 'all')).toBe(true);
    expect(matchesMissingFields(c, [], 'any')).toBe(true);
  });
});
