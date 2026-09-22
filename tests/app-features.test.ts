import { describe, expect, it } from 'bun:test';
import {
  normalizeSearchText,
  levenshtein,
  matchesToken,
  updateDisplayedContacts,
} from '../src/app/actions/search';
import { downloadContactVcf } from '../src/app/actions/downloads';
import { getAllEvents, isFavourite } from '../src/app/actions/contact-fields';
import { generateMultipleContactsVcf } from '../src/lib/export-csv';
import type { Contact } from '../src/lib/ipc';

function contact(id: string, labels: string[], payload: Record<string, unknown> = {}): Contact {
  return {
    resource_name: id,
    display_name: id,
    version: 1,
    payload: {
      memberships: labels.map((label) => ({
        contactGroupMembership: { contactGroupResourceName: label },
      })),
      ...payload,
    },
  };
}

describe('extracted contact features', () => {
  it('does not mistake a custom label containing starred for the favourites group', () => {
    expect(isFavourite(contact('custom', ['contactGroups/not-starred']))).toBe(false);
    expect(isFavourite(contact('favourite', ['contactGroups/starred']))).toBe(true);
  });
  it('keeps accent-insensitive, typo-tolerant, and numeric search behavior', () => {
    expect(normalizeSearchText('  Éléonore  ')).toBe('eleonore');
    const matches = matchesToken.bind({ levenshtein });
    expect(matches('eleonre', ['eleonore'], 'eleonore', '', '')).toBe(true);
    expect(matches('2044', [], '', '2044', '442044567890')).toBe(true);
    expect(matches('zz', ['eleonore'], 'eleonore', '', '')).toBe(false);
  });

  it('combines label aliases, any/all matching, and missing-field filters', () => {
    const first = contact('first', ['friends-old'], {
      emailAddresses: [{ value: 'a@example.test' }],
    });
    const second = contact('second', ['friends-new', 'work']);
    const third = contact('third', ['work']);
    const ctx: ThisParameterType<typeof updateDisplayedContacts> = {
      allSnapshotContacts: [first, second, third],
      contacts: [],
      groups: [
        { resource_name: 'friends-old', name: 'Friends', member_count: 1 },
        { resource_name: 'friends-new', name: 'Friends', member_count: 1 },
        { resource_name: 'work', name: 'Work', member_count: 2 },
      ],
      groupMap: new Map(),
      selectedGroups: ['friends-new', 'work'],
      labelMatchMode: 'all',
      missingFields: [],
      missingFieldMode: 'any',
    };
    updateDisplayedContacts.call(ctx);
    expect(ctx.contacts.map((c) => c.resource_name)).toEqual(['second']);
    ctx.labelMatchMode = 'any';
    updateDisplayedContacts.call(ctx);
    expect(ctx.contacts).toEqual([first, second, third]);
    ctx.missingFields = ['email'];
    updateDisplayedContacts.call(ctx);
    expect(ctx.contacts).toEqual([second, third]);
    ctx.selectedGroups = [];
    ctx.missingFields = [];
    updateDisplayedContacts.call(ctx);
    expect(ctx.contacts).toEqual([first, second, third]);
  });

  it('exports a single vCard with the same repeated fields and escaping as bulk export', () => {
    const person = contact('person', [], {
      names: [{ displayName: 'Alex Example' }],
      emailAddresses: [{ value: 'first@example.test' }, { value: 'second@example.test' }],
      phoneNumbers: [{ value: '+442012345678' }, { value: '+33123456789' }],
      biographies: [{ value: 'Line one\nLine two' }],
    });
    let downloaded = '';
    downloadContactVcf.call(
      {
        getDisplayName: () => 'Alex Example',
        showToast: () => {},
        triggerFileDownload(content, filename, mime) {
          downloaded = content;
          expect(filename).toBe('contact-alex_example.vcf');
          expect(mime).toBe('text/vcard');
        },
      },
      person,
    );
    expect(downloaded).toBe(generateMultipleContactsVcf([person]));
    expect(downloaded).toContain('second@example.test');
    expect(downloaded).toContain('+33123456789');
    expect(downloaded).toContain('Line one\\nLine two');
  });

  it('formats contact events using the chosen date format, including yearless dates', () => {
    const events = getAllEvents.call(
      {
        preferences: {
          theme: 'system',
          density: 'comfortable',
          reduceMotion: false,
          defaultCountry: 'auto',
          birthdayFormat: 'iso',
        },
      },
      {
        events: [
          { date: { year: 2020, month: 3, day: 4 }, type: 'anniversary' },
          { date: { month: 2, day: 29 } },
          { text: 'Every spring' },
        ],
      },
    );
    expect(events.map((event) => event.date)).toEqual(['2020-03-04', '02-29', 'Every spring']);
  });
});
