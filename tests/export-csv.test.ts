import { describe, it, expect } from 'bun:test';
import {
  escapeCsvField,
  formatGoogleCsvBirthday,
  resolveGoogleCsvLabels,
  generateContactCsv,
  generateMultipleContactsCsv,
  contactToVCard,
  generateMultipleContactsVcf,
} from '../src/lib/export-csv';
import type { Contact } from '../src/lib/ipc';

describe('export-csv', () => {
  it('escapeCsvField escapes strings according to RFC 4180', () => {
    expect(escapeCsvField('hello')).toBe('hello');
    expect(escapeCsvField('hello, world')).toBe('"hello, world"');
    expect(escapeCsvField('hello "world"')).toBe('"hello ""world"""');
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
    expect(escapeCsvField('line1\r\nline2')).toBe('"line1\r\nline2"');
    expect(escapeCsvField(null)).toBe('');
    expect(escapeCsvField(undefined)).toBe('');
    expect(escapeCsvField(123)).toBe('123');
  });

  it('formatGoogleCsvBirthday formats dates properly', () => {
    expect(formatGoogleCsvBirthday({ date: { year: 1990, month: 5, day: 20 } })).toBe('1990-05-20');
    expect(formatGoogleCsvBirthday({ date: { month: 12, day: 25 } })).toBe('--12-25');
    expect(formatGoogleCsvBirthday({ text: '1990-05-20' })).toBe('1990-05-20');
    expect(formatGoogleCsvBirthday(null)).toBe('');
  });

  it('resolveGoogleCsvLabels resolves group resource names using groupMap', () => {
    const payload = {
      memberships: [
        { contactGroupMembership: { contactGroupResourceName: 'contactGroups/123' } },
        { contactGroupMembership: { contactGroupResourceName: 'contactGroups/456' } },
      ],
    };
    const groupMap = new Map([
      ['contactGroups/123', 'Friends'],
      ['contactGroups/456', 'Work colleagues'],
    ]);
    expect(resolveGoogleCsvLabels(payload, groupMap)).toBe('Friends ::: Work colleagues');
  });

  it('generateContactCsv produces valid Google Contacts CSV for complete contact', () => {
    const contact: Contact = {
      resource_name: 'people/c1',
      display_name: 'Dr. Jane M. Doe Esq.',
      version: 1,
      payload: {
        names: [
          {
            displayName: 'Dr. Jane M. Doe Esq.',
            givenName: 'Jane',
            middleName: 'M.',
            familyName: 'Doe',
            honorificPrefix: 'Dr.',
            honorificSuffix: 'Esq.',
          },
        ],
        nicknames: [{ value: 'Janie' }],
        birthdays: [{ date: { year: 1985, month: 4, day: 12 } }],
        biographies: [{ value: 'Met at conference.\nKey speaker.' }],
        organizations: [{ name: 'Acme Corp', title: 'VP of Engineering' }],
        memberships: [
          { contactGroupMembership: { contactGroupResourceName: 'contactGroups/vip' } },
        ],
        emailAddresses: [
          { value: 'jane.work@example.com', type: 'Work' },
          { value: 'jane.home@example.com', type: 'Home' },
        ],
        phoneNumbers: [
          { value: '+1-555-0100', type: 'Mobile' },
        ],
        addresses: [
          {
            type: 'Work',
            streetAddress: '100 Main St, Suite 400',
            extendedAddress: 'Building A',
            city: 'Metropolis',
            region: 'NY',
            postalCode: '10001',
            country: 'USA',
            poBox: 'PO 42',
          },
        ],
      },
    };

    const groupMap = new Map([['contactGroups/vip', 'VIP Clients']]);
    const csv = generateContactCsv(contact, groupMap);

    // Should have CRLF line endings
    expect(csv.endsWith('\r\n')).toBe(true);

    const lines = csv.split('\r\n');
    expect(lines.length).toBeGreaterThanOrEqual(2);

    const header = lines[0];
    expect(header).toContain('First Name,Middle Name,Last Name,Name Prefix,Name Suffix,Nickname,Birthday,Notes,Organisation name,Organisation title,Labels');
    expect(header).toContain('Email 1 - Label,Email 1 - Value,Email 2 - Label,Email 2 - Value');
    expect(header).toContain('Phone 1 - Label,Phone 1 - Value');
    expect(header).toContain('Address 1 - Label,Address 1 - Street,Address 1 - Extended address,Address 1 - City,Address 1 - Region,Address 1 - Postcode,Address 1 - Country,Address 1 - PO box');

    // Check data line
    expect(csv).toContain('Jane');
    expect(csv).toContain('Doe');
    expect(csv).toContain('Janie');
    expect(csv).toContain('1985-04-12');
    expect(csv).toContain('"Met at conference.\nKey speaker."');
    expect(csv).toContain('Acme Corp');
    expect(csv).toContain('VP of Engineering');
    expect(csv).toContain('VIP Clients');
    expect(csv).toContain('jane.work@example.com');
    expect(csv).toContain('jane.home@example.com');
    expect(csv).toContain('+1-555-0100');
    expect(csv).toContain('"100 Main St, Suite 400"');
  });

  it('generateContactCsv handles minimal contacts and fallbacks', () => {
    const contact: Contact = {
      resource_name: 'people/c2',
      display_name: 'SingleName',
      version: 1,
      payload: {},
    };

    const csv = generateContactCsv(contact);
    expect(csv).toContain('SingleName');
    expect(csv).toContain('Email 1 - Label');
    expect(csv).toContain('Phone 1 - Label');
    expect(csv).toContain('Address 1 - Label');
  });

  it('generateMultipleContactsCsv generates unified CSV for multiple contacts', () => {
    const c1: Contact = {
      resource_name: 'people/c1',
      display_name: 'Alice Smith',
      version: 1,
      payload: {
        names: [{ givenName: 'Alice', familyName: 'Smith' }],
        emailAddresses: [{ value: 'alice@example.com', type: 'Work' }],
      },
    };
    const c2: Contact = {
      resource_name: 'people/c2',
      display_name: 'Bob Jones',
      version: 1,
      payload: {
        names: [{ givenName: 'Bob', familyName: 'Jones' }],
        emailAddresses: [
          { value: 'bob1@example.com', type: 'Work' },
          { value: 'bob2@example.com', type: 'Home' },
        ],
      },
    };

    const csv = generateMultipleContactsCsv([c1, c2]);
    expect(csv).toContain('Alice');
    expect(csv).toContain('Bob');
    // Header should account for 2 emails because Bob has 2
    expect(csv).toContain('Email 1 - Value,Email 2 - Label,Email 2 - Value');
  });

  it('contactToVCard and generateMultipleContactsVcf produce valid vCard 3.0', () => {
    const contact: Contact = {
      resource_name: 'people/c1',
      display_name: 'Carol Danvers',
      version: 1,
      payload: {
        names: [{ givenName: 'Carol', familyName: 'Danvers' }],
        emailAddresses: [{ value: 'carol@avengers.org', type: 'Work' }],
        phoneNumbers: [{ value: '+1-555-9999', type: 'Cell' }],
        organizations: [{ name: 'Avengers', title: 'Captain' }],
      },
    };

    const vcf = contactToVCard(contact);
    expect(vcf).toContain('BEGIN:VCARD');
    expect(vcf).toContain('VERSION:3.0');
    expect(vcf).toContain('FN:Carol Danvers');
    expect(vcf).toContain('N:Danvers;Carol;;;');
    expect(vcf).toContain('EMAIL;TYPE=WORK:carol@avengers.org');
    expect(vcf).toContain('TEL;TYPE=CELL:+1-555-9999');
    expect(vcf).toContain('ORG:Avengers');
    expect(vcf).toContain('TITLE:Captain');
    expect(vcf).toContain('END:VCARD');

    const multi = generateMultipleContactsVcf([contact, contact]);
    expect(multi.split('BEGIN:VCARD').length - 1).toBe(2);
  });
});
