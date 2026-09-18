import { describe, it, expect } from 'bun:test';
import { getContactPhotos, getProfilePhotoSourceEmail } from '../src/lib/photos';
import type { Contact, MediaView } from '../src/lib/ipc';

describe('photos module', () => {
  it('correctly classifies contact photo and Google profile photo with source email', () => {
    const contact: Contact = {
      resource_name: 'people/c12345',
      display_name: 'Jasmine Lim',
      version: 1,
      payload: {
        resourceName: 'people/c12345',
        photos: [
          {
            url: 'https://lh3.googleusercontent.com/contacts/custom-photo',
            metadata: {
              source: { type: 'CONTACT', id: 'c12345' },
              primary: true,
            },
          },
          {
            url: 'https://lh3.googleusercontent.com/a/google-profile-photo',
            metadata: {
              source: { type: 'PROFILE', id: '10987654321' },
            },
          },
        ],
        emailAddresses: [
          {
            value: 'jl@vnwlim.com',
            metadata: {
              source: { type: 'PROFILE', id: '10987654321' },
              primary: true,
            },
          },
        ],
      },
    };

    const mediaList: MediaView[] = [
      {
        source_url: 'https://lh3.googleusercontent.com/contacts/custom-photo',
        status: 'available',
        data_url: 'data:image/jpeg;base64,mockCustomData',
        retrieved_at: '2026-09-01T00:00:00Z',
      },
      {
        source_url: 'https://lh3.googleusercontent.com/a/google-profile-photo',
        status: 'available',
        data_url: 'data:image/jpeg;base64,mockProfileData',
        retrieved_at: '2026-09-01T00:00:00Z',
      },
    ];

    const photos = getContactPhotos(contact, mediaList);
    expect(photos.length).toBe(2);

    // First photo should be Contact photo
    expect(photos[0].type).toBe('contact');
    expect(photos[0].label).toBe('Contact photo');
    expect(photos[0].displayUrl).toBe('data:image/jpeg;base64,mockCustomData');

    // Second photo should be Google profile photo
    expect(photos[1].type).toBe('profile');
    expect(photos[1].label).toBe('Google profile photo');
    expect(photos[1].displayUrl).toBe('data:image/jpeg;base64,mockProfileData');
    expect(photos[1].sourceEmail).toBe('jl@vnwlim.com');
  });

  it('matches profile photo source email via source.id when multiple emails exist', () => {
    const payload = {
      emailAddresses: [
        { value: 'personal@other.com', metadata: { source: { type: 'CONTACT', id: 'c1' } } },
        { value: 'work@google.com', metadata: { source: { type: 'PROFILE', id: 'profile-id-99' } } },
      ],
    };
    const photoObj = {
      metadata: {
        source: { type: 'PROFILE', id: 'profile-id-99' },
      },
    };

    const sourceEmail = getProfilePhotoSourceEmail(payload, photoObj);
    expect(sourceEmail).toBe('work@google.com');
  });

  it('falls back to primary email if source IDs do not match directly', () => {
    const payload = {
      emailAddresses: [
        { value: 'primary@example.com', metadata: { primary: true } },
        { value: 'secondary@example.com' },
      ],
    };
    const photoObj = {
      url: 'https://lh3.googleusercontent.com/a/photo',
    };

    const sourceEmail = getProfilePhotoSourceEmail(payload, photoObj);
    expect(sourceEmail).toBe('primary@example.com');
  });

  it('handles contacts with only a single contact photo', () => {
    const contact: Contact = {
      resource_name: 'people/c1',
      display_name: 'Alice',
      version: 1,
      payload: {
        photos: [
          {
            url: 'https://lh3.googleusercontent.com/contacts/p1',
            metadata: { source: { type: 'CONTACT' } },
          },
        ],
      },
    };

    const photos = getContactPhotos(contact);
    expect(photos.length).toBe(1);
    expect(photos[0].type).toBe('contact');
    expect(photos[0].label).toBe('Contact photo');
  });

  it('returns empty array when contact has no photos and no media', () => {
    const contact: Contact = {
      resource_name: 'people/c2',
      display_name: 'Yue Tang',
      version: 1,
      payload: {
        names: [{ displayName: 'Yue Tang' }],
      },
    };

    const photos = getContactPhotos(contact);
    expect(photos.length).toBe(0);
  });
});
