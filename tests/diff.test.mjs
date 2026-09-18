import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeContactDiff, cleanPayload, extractDisplayName } from '../src/lib/diff.ts';

test('cleanPayload strips noise fields and keeps data intact', () => {
  const payload = {
    resourceName: 'people/123',
    etag: 'xyz789',
    metadata: { sources: [{ type: 'CONTACT', updateTime: '2026-09-01' }] },
    names: [{ displayName: 'Charmaine Neo' }],
    addresses: [{ formattedValue: 'Singapore, GB', country: 'GB' }],
  };
  const cleaned = cleanPayload(payload);
  assert.equal(cleaned.etag, undefined);
  assert.equal(cleaned.metadata, undefined);
  assert.equal(cleaned.resourceName, undefined);
  assert.equal(cleaned.names[0].displayName, 'Charmaine Neo');
  assert.equal(cleaned.addresses[0].formattedValue, 'Singapore, GB');
});

test('extractDisplayName returns highest quality name or fallback', () => {
  assert.equal(extractDisplayName({ names: [{ displayName: 'John Doe' }] }), 'John Doe');
  assert.equal(extractDisplayName({ names: [{ givenName: 'John', familyName: 'Smith' }] }), 'John Smith');
  assert.equal(extractDisplayName({ emailAddresses: [{ value: 'john@example.com' }] }), 'john@example.com');
  assert.equal(extractDisplayName(null), 'Unknown');
});

test('computeContactDiff correctly detects address removal as in the user screenshot', () => {
  const before = {
    resourceName: 'people/c1456332868067425148',
    names: [{ displayName: 'Charmaine Neo' }],
    addresses: [
      {
        country: 'GB',
        countryCode: 'GB',
        formattedType: 'Home',
        formattedValue: 'Singapore\nGB',
      },
    ],
  };

  const after = {
    resourceName: 'people/c1456332868067425148',
    names: [{ displayName: 'Charmaine Neo' }],
    // addresses removed
  };

  const diff = computeContactDiff(before, after);
  assert.equal(diff.displayName, 'Charmaine Neo');
  assert.equal(diff.kind, 'changed');
  assert.equal(diff.hasChanges, true);

  // Address group should be present
  const addrGroup = diff.groups.find((g) => g.key === 'addresses');
  assert.ok(addrGroup, 'addresses group must exist');
  assert.equal(addrGroup.items[0].type, 'removed');
  assert.match(addrGroup.items[0].text, /Singapore/);

  // Badges should include Address removed
  const badge = diff.badges.find((b) => b.label.includes('Address'));
  assert.ok(badge, 'Address badge must exist');
  assert.equal(badge.type, 'removed');
});

test('computeContactDiff correctly identifies added contact', () => {
  const after = {
    resourceName: 'people/fixture-ada',
    names: [{ displayName: 'Ada Lovelace' }],
    phoneNumbers: [{ value: '+44 20 0000 0000', type: 'mobile' }],
    emailAddresses: [{ value: 'ada@example.test' }],
  };
  const diff = computeContactDiff(null, after);
  assert.equal(diff.kind, 'added');
  assert.equal(diff.displayName, 'Ada Lovelace');
  assert.ok(diff.groups.some((g) => g.key === 'names'));
  assert.ok(diff.groups.some((g) => g.key === 'phones'));
  assert.ok(diff.groups.some((g) => g.key === 'emails'));
});

test('computeContactDiff correctly identifies removed contact', () => {
  const before = {
    resourceName: 'people/fixture-grace',
    names: [{ displayName: 'Grace Hopper' }],
    emailAddresses: [{ value: 'grace@example.test' }],
  };
  const diff = computeContactDiff(before, null);
  assert.equal(diff.kind, 'removed');
  assert.equal(diff.displayName, 'Grace Hopper');
  assert.ok(diff.groups.some((g) => g.key === 'names'));
  assert.ok(diff.groups.some((g) => g.key === 'emails'));
});

test('computeContactDiff detects phone additions and updates', () => {
  const before = {
    names: [{ displayName: 'Test User' }],
    phoneNumbers: [{ value: '+1 555 123 4567', type: 'mobile' }],
  };
  const after = {
    names: [{ displayName: 'Test User' }],
    phoneNumbers: [
      { value: '+1 555 123 4567', type: 'mobile' },
      { value: '+1 555 987 6543', type: 'work' },
    ],
  };
  const diff = computeContactDiff(before, after);
  assert.equal(diff.kind, 'changed');
  const phoneGroup = diff.groups.find((g) => g.key === 'phones');
  assert.ok(phoneGroup);
  assert.equal(phoneGroup.items.length, 1);
  assert.equal(phoneGroup.items[0].type, 'added');
});
