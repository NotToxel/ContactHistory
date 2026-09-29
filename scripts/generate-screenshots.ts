import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const PORT = 1422;
const CDP_PORT = 9333;
const SCREENSHOTS_DIR = join(process.cwd(), 'docs', 'screenshots');

mkdirSync(SCREENSHOTS_DIR, { recursive: true });

// Check browser path
const edgeCandidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];
const browserPath = edgeCandidates.find(existsSync);
if (!browserPath) {
  console.error('No suitable browser found for screenshot generation.');
  process.exit(1);
}

// 1. Build frontend first to ensure latest styles/components are compiled
console.log('Building frontend before generating screenshots...');
const build = Bun.spawnSync(['bun', 'run', 'build'], { cwd: process.cwd() });
if (build.exitCode !== 0) {
  console.error('Frontend build failed');
  process.exit(1);
}

// 2. Start Bun static server
const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    let path = url.pathname;
    if (path === '/' || path === '') path = '/index.html';
    const filePath = join(process.cwd(), 'dist', path);
    const file = Bun.file(filePath);
    if (await file.exists()) {
      return new Response(file);
    }
    return new Response(Bun.file(join(process.cwd(), 'dist', 'index.html')));
  },
});

console.log(`Static server running on http://127.0.0.1:${PORT}`);

// Rich illustrative profile picture SVGs
function createMargaretPortrait(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="160" height="160">
    <circle cx="80" cy="80" r="80" fill="#d2e3fc"/>
    <circle cx="80" cy="74" r="34" fill="#fcd4b8"/>
    <path d="M46 68 C44 42, 60 30, 80 30 C100 30, 116 42, 114 68 C118 78, 116 94, 112 100 C108 94, 108 84, 108 84 C100 86, 92 86, 80 86 C68 86, 60 86, 52 84 C52 84, 52 94, 48 100 C44 94, 42 78, 46 68 Z" fill="#4a2e18"/>
    <circle cx="80" cy="72" r="32" fill="#fcd4b8"/>
    <path d="M48 64 C55 48, 70 42, 80 44 C90 42, 105 48, 112 64 C104 54, 92 50, 80 52 C68 50, 56 54, 48 64 Z" fill="#4a2e18"/>
    <rect x="56" y="66" width="20" height="14" rx="4" fill="none" stroke="#202124" stroke-width="2.5"/>
    <rect x="84" y="66" width="20" height="14" rx="4" fill="none" stroke="#202124" stroke-width="2.5"/>
    <line x1="76" y1="72" x2="84" y2="72" stroke="#202124" stroke-width="2.5"/>
    <circle cx="66" cy="73" r="2.5" fill="#3c4043"/>
    <circle cx="94" cy="73" r="2.5" fill="#3c4043"/>
    <path d="M72 88 Q80 94 88 88" fill="none" stroke="#ba6548" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M28 156 C28 120, 52 108, 80 108 C108 108, 132 120, 132 156 Z" fill="#1f3a60"/>
    <polygon points="80,108 72,130 88,130" fill="#ffffff"/>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

function createAlanPortrait(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="160" height="160">
    <circle cx="80" cy="80" r="80" fill="#ceead6"/>
    <circle cx="80" cy="70" r="35" fill="#2d231b"/>
    <circle cx="80" cy="76" r="32" fill="#ffd2a8"/>
    <path d="M48 64 C50 42, 70 34, 84 36 C102 38, 114 50, 112 66 C104 50, 88 44, 78 44 C66 44, 54 52, 48 64 Z" fill="#2d231b"/>
    <circle cx="67" cy="74" r="2.5" fill="#202124"/>
    <circle cx="93" cy="74" r="2.5" fill="#202124"/>
    <path d="M62 67 Q68 64 73 67" fill="none" stroke="#2d231b" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M87 67 Q92 64 98 67" fill="none" stroke="#2d231b" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M73 90 Q80 95 87 90" fill="none" stroke="#b05d42" stroke-width="2" stroke-linecap="round"/>
    <path d="M28 156 C28 122, 52 110, 80 110 C108 110, 132 122, 132 156 Z" fill="#3c4043"/>
    <polygon points="80,110 70,140 90,140" fill="#ffffff"/>
    <polygon points="80,118 76,156 84,156" fill="#8b1e1e"/>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

function createKatherinePortrait(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="160" height="160">
    <circle cx="80" cy="80" r="80" fill="#feefc3"/>
    <circle cx="80" cy="70" r="36" fill="#1c1917"/>
    <circle cx="80" cy="76" r="32" fill="#a66a44"/>
    <path d="M46 64 C48 38, 72 32, 86 34 C104 36, 114 48, 114 66 C106 50, 92 44, 80 44 C66 44, 54 50, 46 64 Z" fill="#1c1917"/>
    <path d="M54 66 Q66 62 76 68 Q74 80 62 80 Q52 78 54 66 Z" fill="none" stroke="#262626" stroke-width="2.5"/>
    <path d="M84 68 Q94 62 106 66 Q108 78 98 80 Q86 80 84 68 Z" fill="none" stroke="#262626" stroke-width="2.5"/>
    <line x1="76" y1="68" x2="84" y2="68" stroke="#262626" stroke-width="2.5"/>
    <circle cx="65" cy="73" r="2.5" fill="#171717"/>
    <circle cx="95" cy="73" r="2.5" fill="#171717"/>
    <path d="M72 92 Q80 98 88 92" fill="none" stroke="#e11d48" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M28 156 C28 122, 52 110, 80 110 C108 110, 132 122, 132 156 Z" fill="#6b21a8"/>
    <polygon points="80,110 70,132 90,132" fill="#fef3c7"/>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

function createAdaPortrait(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="160" height="160">
    <circle cx="80" cy="80" r="80" fill="#e8eaed"/>
    <circle cx="52" cy="62" r="16" fill="#3e2723"/>
    <circle cx="108" cy="62" r="16" fill="#3e2723"/>
    <circle cx="80" cy="76" r="32" fill="#fde2d2"/>
    <path d="M52 66 C52 40, 70 34, 80 34 C90 34, 108 40, 108 66 C100 52, 90 46, 80 46 C70 46, 60 52, 52 66 Z" fill="#3e2723"/>
    <circle cx="68" cy="46" r="3" fill="#ffffff" stroke="#d1d5db" stroke-width="0.5"/>
    <circle cx="76" cy="44" r="3" fill="#ffffff" stroke="#d1d5db" stroke-width="0.5"/>
    <circle cx="84" cy="44" r="3" fill="#ffffff" stroke="#d1d5db" stroke-width="0.5"/>
    <circle cx="92" cy="46" r="3" fill="#ffffff" stroke="#d1d5db" stroke-width="0.5"/>
    <circle cx="67" cy="74" r="2.5" fill="#374151"/>
    <circle cx="93" cy="74" r="2.5" fill="#374151"/>
    <path d="M73 90 Q80 95 87 90" fill="none" stroke="#e11d48" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M28 156 C28 122, 52 110, 80 110 C108 110, 132 122, 132 156 Z" fill="#0d652d"/>
    <path d="M68 110 Q80 126 92 110" fill="#f9fafb"/>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

// 4 contacts have realistic profile pictures; others have NO photo (empty string)
const mockAvatars: Record<string, string> = {
  'people/margaret': createMargaretPortrait(),
  'people/ada': createAdaPortrait(),
  'people/alan': createAlanPortrait(),
  'people/katherine': createKatherinePortrait(),
};

// Rich contacts dataset with purposeful mix of complete and missing fields
const mockContacts = [
  // 1. Margaret Hamilton: Full data + portrait photo
  {
    resource_name: 'people/margaret',
    display_name: 'Margaret Hamilton',
    version: 3,
    payload: {
      resourceName: 'people/margaret',
      etag: 'tag-mh-3',
      names: [
        {
          displayName: 'Margaret Hamilton',
          givenName: 'Margaret',
          familyName: 'Hamilton',
          metadata: { primary: true },
        },
      ],
      emailAddresses: [
        { value: 'm.hamilton@apollo.systems', type: 'Work', metadata: { primary: true } },
        { value: 'margaret@alum.mit.edu', type: 'Home' },
      ],
      phoneNumbers: [
        { value: '+1 617 253 1000', type: 'Work', metadata: { primary: true } },
        { value: '+1 617 555 0192', type: 'Mobile' },
      ],
      organizations: [
        {
          name: 'MIT Instrumentation Laboratory',
          title: 'Director of Software Engineering',
          department: 'Apollo Flight Computer Project',
          metadata: { primary: true },
        },
      ],
      addresses: [
        {
          type: 'Work',
          formattedValue: '77 Massachusetts Ave, Cambridge, MA 02139',
          city: 'Cambridge',
          region: 'MA',
          postalCode: '02139',
          country: 'United States',
        },
      ],
      birthdays: [{ date: { year: 1936, month: 8, day: 17 } }],
      userDefined: [
        { key: 'Security Clearance', value: 'Level 5 (Apollo Flight Ops)' },
        { key: 'Preferred Editor', value: 'AGC Assembly' },
      ],
      biographies: [
        {
          value:
            'Pioneered software engineering principles and led the team that developed in-flight software for the Apollo space program.',
        },
      ],
      memberships: [
        { contactGroupMembership: { contactGroupResourceName: 'contactGroups/eng' } },
        { contactGroupMembership: { contactGroupResourceName: 'contactGroups/leadership' } },
        { contactGroupMembership: { contactGroupResourceName: 'contactGroups/starred' } },
      ],
      photos: [{ url: mockAvatars['people/margaret'], metadata: { primary: true } }],
    },
  },
  // 2. Ada Lovelace: Portrait photo, missing address
  {
    resource_name: 'people/ada',
    display_name: 'Ada Lovelace',
    version: 2,
    payload: {
      resourceName: 'people/ada',
      etag: 'tag-al-2',
      names: [
        {
          displayName: 'Ada Lovelace',
          givenName: 'Ada',
          familyName: 'Lovelace',
          metadata: { primary: true },
        },
      ],
      emailAddresses: [
        { value: 'ada@analytical-engine.org', type: 'Work', metadata: { primary: true } },
      ],
      phoneNumbers: [{ value: '+44 20 7946 0912', type: 'Work' }],
      organizations: [
        {
          name: 'Babbage Computing Institute',
          title: 'Chief Algorithm Architect',
          department: 'Mathematical Foundations',
        },
      ],
      birthdays: [{ date: { year: 1815, month: 12, day: 10 } }],
      userDefined: [{ key: 'Note', value: 'Author of the first algorithm for Babbage Engine' }],
      memberships: [
        { contactGroupMembership: { contactGroupResourceName: 'contactGroups/eng' } },
        { contactGroupMembership: { contactGroupResourceName: 'contactGroups/starred' } },
      ],
      photos: [{ url: mockAvatars['people/ada'], metadata: { primary: true } }],
    },
  },
  // 3. Alan Turing: Portrait photo, MISSING PHONE NUMBER
  {
    resource_name: 'people/alan',
    display_name: 'Alan Turing',
    version: 2,
    payload: {
      resourceName: 'people/alan',
      etag: 'tag-at-2',
      names: [
        {
          displayName: 'Alan Turing',
          givenName: 'Alan',
          familyName: 'Turing',
          metadata: { primary: true },
        },
      ],
      emailAddresses: [
        { value: 'a.turing@bletchley.gov.uk', type: 'Work', metadata: { primary: true } },
      ],
      organizations: [
        {
          name: 'Government Code and Cypher School',
          title: 'Lead Cryptanalyst',
          department: 'Hut 8',
        },
      ],
      addresses: [
        {
          type: 'Work',
          formattedValue: 'Sherwood Dr, Bletchley, Milton Keynes MK3 6EB',
          country: 'United Kingdom',
        },
      ],
      birthdays: [{ date: { year: 1912, month: 6, day: 23 } }],
      userDefined: [{ key: 'Project', value: 'Hut 8 Cryptanalysis Project Lead' }],
      memberships: [
        { contactGroupMembership: { contactGroupResourceName: 'contactGroups/eng' } },
        { contactGroupMembership: { contactGroupResourceName: 'contactGroups/starred' } },
      ],
      photos: [{ url: mockAvatars['people/alan'], metadata: { primary: true } }],
    },
  },
  // 4. Katherine Johnson: Full data + portrait photo
  {
    resource_name: 'people/katherine',
    display_name: 'Katherine Johnson',
    version: 2,
    payload: {
      resourceName: 'people/katherine',
      etag: 'tag-kj-2',
      names: [
        {
          displayName: 'Katherine Johnson',
          givenName: 'Katherine',
          familyName: 'Johnson',
          metadata: { primary: true },
        },
      ],
      emailAddresses: [
        { value: 'katherine.johnson@nasa.gov', type: 'Work', metadata: { primary: true } },
      ],
      phoneNumbers: [{ value: '+1 757 864 1000', type: 'Work' }],
      organizations: [
        {
          name: 'NASA Langley Research Center',
          title: 'Senior Aerospace Technologist',
          department: 'Flight Trajectory Research',
        },
      ],
      addresses: [
        {
          type: 'Work',
          formattedValue: '1 NASA Way, Hampton, VA 23666',
          city: 'Hampton',
          region: 'VA',
          postalCode: '23666',
          country: 'United States',
        },
      ],
      birthdays: [{ date: { year: 1918, month: 8, day: 26 } }],
      memberships: [
        { contactGroupMembership: { contactGroupResourceName: 'contactGroups/eng' } },
        { contactGroupMembership: { contactGroupResourceName: 'contactGroups/starred' } },
      ],
      photos: [{ url: mockAvatars['people/katherine'], metadata: { primary: true } }],
    },
  },
  // 5. Grace Hopper: NO PHOTO (renders initial GH), MISSING BIRTHDAY
  {
    resource_name: 'people/grace',
    display_name: 'Grace Hopper',
    version: 1,
    payload: {
      resourceName: 'people/grace',
      etag: 'tag-gh-1',
      names: [
        {
          displayName: 'Grace Hopper',
          givenName: 'Grace',
          familyName: 'Hopper',
          metadata: { primary: true },
        },
      ],
      emailAddresses: [
        { value: 'hopper.grace@navy.mil', type: 'Work', metadata: { primary: true } },
      ],
      phoneNumbers: [{ value: '+1 703 697 5131', type: 'Work' }],
      organizations: [
        {
          name: 'United States Navy',
          title: 'Rear Admiral & Systems Pioneer',
          department: 'Programming Research',
        },
      ],
      memberships: [
        { contactGroupMembership: { contactGroupResourceName: 'contactGroups/eng' } },
        { contactGroupMembership: { contactGroupResourceName: 'contactGroups/leadership' } },
      ],
    },
  },
  // 6. Claude Shannon: NO PHOTO (renders initial CS), MISSING ORG/TITLE
  {
    resource_name: 'people/claude',
    display_name: 'Claude Shannon',
    version: 1,
    payload: {
      resourceName: 'people/claude',
      etag: 'tag-cs-1',
      names: [
        {
          displayName: 'Claude Shannon',
          givenName: 'Claude',
          familyName: 'Shannon',
          metadata: { primary: true },
        },
      ],
      emailAddresses: [
        { value: 'c.shannon@bell-labs.com', type: 'Work', metadata: { primary: true } },
      ],
      phoneNumbers: [{ value: '+1 908 582 3000', type: 'Work' }],
      birthdays: [{ date: { year: 1916, month: 4, day: 30 } }],
      memberships: [{ contactGroupMembership: { contactGroupResourceName: 'contactGroups/eng' } }],
    },
  },
  // 7. John von Neumann: NO PHOTO (renders initial JN), MISSING EMAIL
  {
    resource_name: 'people/john',
    display_name: 'John von Neumann',
    version: 1,
    payload: {
      resourceName: 'people/john',
      etag: 'tag-jn-1',
      names: [
        {
          displayName: 'John von Neumann',
          givenName: 'John',
          familyName: 'von Neumann',
          metadata: { primary: true },
        },
      ],
      phoneNumbers: [{ value: '+1 609 734 8000', type: 'Work' }],
      organizations: [
        {
          name: 'Institute for Advanced Study',
          title: 'Professor of Mathematics',
          department: 'School of Mathematics',
        },
      ],
      addresses: [
        {
          type: 'Work',
          formattedValue: '1 Einstein Dr, Princeton, NJ 08540',
          city: 'Princeton',
          region: 'NJ',
          country: 'United States',
        },
      ],
      birthdays: [{ date: { year: 1903, month: 12, day: 28 } }],
      memberships: [{ contactGroupMembership: { contactGroupResourceName: 'contactGroups/eng' } }],
    },
  },
  // 8. Linus Torvalds: NO PHOTO (renders initial LT), MISSING BIRTHDAY & ADDRESS
  {
    resource_name: 'people/linus',
    display_name: 'Linus Torvalds',
    version: 1,
    payload: {
      resourceName: 'people/linus',
      etag: 'tag-lt-1',
      names: [
        {
          displayName: 'Linus Torvalds',
          givenName: 'Linus',
          familyName: 'Torvalds',
          metadata: { primary: true },
        },
      ],
      emailAddresses: [
        { value: 'torvalds@linux-foundation.org', type: 'Work', metadata: { primary: true } },
      ],
      phoneNumbers: [{ value: '+1 503 555 0144', type: 'Mobile' }],
      organizations: [
        {
          name: 'Linux Foundation',
          title: 'Principal Fellow & Kernel Architect',
          department: 'Core Infrastructure',
        },
      ],
      memberships: [
        { contactGroupMembership: { contactGroupResourceName: 'contactGroups/eng' } },
        { contactGroupMembership: { contactGroupResourceName: 'contactGroups/leadership' } },
      ],
    },
  },
  // 9. Charles Babbage: NO PHOTO, MISSING EMAIL & PHONE
  {
    resource_name: 'people/babbage',
    display_name: 'Charles Babbage',
    version: 1,
    payload: {
      resourceName: 'people/babbage',
      etag: 'tag-cb-1',
      names: [
        {
          displayName: 'Charles Babbage',
          givenName: 'Charles',
          familyName: 'Babbage',
          metadata: { primary: true },
        },
      ],
      organizations: [
        {
          name: 'Royal Astronomical Society',
          title: 'Lucasain Professor of Mathematics',
        },
      ],
      memberships: [{ contactGroupMembership: { contactGroupResourceName: 'contactGroups/eng' } }],
    },
  },
];

const mockCaptures = [
  {
    sequence: 3,
    started_at: '2026-09-29T08:00:00Z',
    committed_at: '2026-09-29T08:02:15Z',
    contact_count: 9,
    group_count: 3,
    media_complete: true,
  },
  {
    sequence: 2,
    started_at: '2026-09-22T08:00:00Z',
    committed_at: '2026-09-22T08:01:40Z',
    contact_count: 8,
    group_count: 3,
    media_complete: true,
  },
  {
    sequence: 1,
    started_at: '2026-09-15T08:00:00Z',
    committed_at: '2026-09-15T08:01:22Z',
    contact_count: 7,
    group_count: 2,
    media_complete: true,
  },
];

const mockGroups = [
  { resource_name: 'contactGroups/starred', name: 'Starred', member_count: 4 },
  {
    resource_name: 'contactGroups/eng',
    name: 'Engineering & Research',
    member_count: 9,
  },
  { resource_name: 'contactGroups/leadership', name: 'Leadership', member_count: 3 },
];

// Clean, realistic, and completely error-free diff changes between Snapshot #2 and #3
const margaretBeforePayload = JSON.parse(JSON.stringify(mockContacts[0].payload));
// Before: Lead Systems Programmer, and only 1 phone
margaretBeforePayload.organizations[0].title = 'Lead Systems Programmer';
margaretBeforePayload.phoneNumbers = [
  { value: '+1 617 253 1000', type: 'Work', metadata: { primary: true } },
];

const alanBeforePayload = JSON.parse(JSON.stringify(mockContacts[2].payload));
alanBeforePayload.userDefined = [{ key: 'Project', value: 'Enigma Analysis Team' }];

const mockChanges = [
  {
    resource_name: 'people/margaret',
    kind: 'changed',
    version: 3,
    before: margaretBeforePayload,
    after: mockContacts[0].payload,
  },
  {
    resource_name: 'people/katherine',
    kind: 'added',
    version: 2,
    before: null,
    after: mockContacts[3].payload,
  },
  {
    resource_name: 'people/alan',
    kind: 'changed',
    version: 2,
    before: alanBeforePayload,
    after: mockContacts[2].payload,
  },
  {
    resource_name: 'people/temp-contractor',
    kind: 'removed',
    version: 1,
    before: {
      resourceName: 'people/temp-contractor',
      names: [{ displayName: 'Archival Sync Record' }],
      emailAddresses: [{ value: 'archived-contractor@sync.internal' }],
      organizations: [{ name: 'Temporary Services', title: 'Consultant' }],
    },
    after: null,
  },
];

const mockAllChanges = [
  {
    capture_sequence: 3,
    committed_at: '2026-09-29T08:02:15Z',
    resource_name: 'people/margaret',
    kind: 'changed' as const,
    version: 3,
    before: mockChanges[0].before,
    after: mockChanges[0].after,
  },
  {
    capture_sequence: 3,
    committed_at: '2026-09-29T08:02:15Z',
    resource_name: 'people/katherine',
    kind: 'added' as const,
    version: 2,
    before: null,
    after: mockChanges[1].after,
  },
  {
    capture_sequence: 3,
    committed_at: '2026-09-29T08:02:15Z',
    resource_name: 'people/alan',
    kind: 'changed' as const,
    version: 2,
    before: mockChanges[2].before,
    after: mockChanges[2].after,
  },
  {
    capture_sequence: 3,
    committed_at: '2026-09-29T08:02:15Z',
    resource_name: 'people/temp-contractor',
    kind: 'removed' as const,
    version: 1,
    before: mockChanges[3].before,
    after: null,
  },
];

const mockContactHistory = [
  {
    sequence: 3,
    committed_at: '2026-09-29T08:02:15Z',
    version: 3,
    before: mockChanges[0].before,
    after: mockContacts[0].payload,
  },
  {
    sequence: 2,
    committed_at: '2026-09-22T08:01:40Z',
    version: 2,
    before: {
      ...margaretBeforePayload,
      organizations: [{ name: 'MIT', title: 'Software Engineer' }],
    },
    after: mockChanges[0].before,
  },
  {
    sequence: 1,
    committed_at: '2026-09-15T08:01:22Z',
    version: 1,
    before: null,
    after: {
      ...margaretBeforePayload,
      organizations: [{ name: 'MIT', title: 'Software Engineer' }],
    },
  },
];

const mockScriptData = JSON.stringify({
  accounts: [{ id: 'acc-demo', subject: '10982347109238', email: 'alex.morgan@workspace.team' }],
  profile: {
    email: 'alex.morgan@workspace.team',
    name: 'Alex Morgan',
    picture: createAlanPortrait(),
  },
  captures: mockCaptures,
  contacts: mockContacts,
  groups: mockGroups,
  avatars: mockAvatars,
  changes: mockChanges,
  allChanges: mockAllChanges,
  contactHistory: mockContactHistory,
});

const injectionScript = `
window.__MOCK_DATA__ = ${mockScriptData};

window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
  unregisterListener: () => {}
};

window.__TAURI_INTERNALS__ = {
  metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
  transformCallback: () => 1,
  invoke: async (cmd, args = {}) => {
    switch (cmd) {
      case 'list_accounts': return window.__MOCK_DATA__.accounts;
      case 'account_profile': return window.__MOCK_DATA__.profile;
      case 'list_captures': return window.__MOCK_DATA__.captures;
      case 'list_contacts': {
        const search = (args.search || '').toLowerCase();
        let list = window.__MOCK_DATA__.contacts;
        if (args.group === 'contactGroups/starred') {
          list = list.filter(c => c.payload.memberships?.some(m => m.contactGroupMembership?.contactGroupResourceName === 'contactGroups/starred'));
        } else if (args.group) {
          list = list.filter(c => c.payload.memberships?.some(m => m.contactGroupMembership?.contactGroupResourceName === args.group));
        }
        if (search) {
          list = list.filter(c => c.display_name.toLowerCase().includes(search));
        }
        return list;
      }
      case 'list_groups': return window.__MOCK_DATA__.groups;
      case 'list_avatars': return window.__MOCK_DATA__.avatars;
      case 'account_health': return { connected: true, last_capture: '2026-09-29T08:02:15Z' };
      case 'due_status': return { due: false, next_due_at: '2026-10-06T08:00:00Z' };
      case 'get_schedule_config': return { enabled: true, interval_days: 7, time_of_day: '09:00', run_at_logon: true, run_daily: true, is_installed: true };
      case 'schedule_state': return true;
      case 'list_changes': return window.__MOCK_DATA__.changes;
      case 'list_all_changes': return window.__MOCK_DATA__.allChanges;
      case 'compare_snapshots': return window.__MOCK_DATA__.changes;
      case 'contact_history': return window.__MOCK_DATA__.contactHistory;
      case 'contact_snapshots': return [{ sequence: 3, committed_at: '2026-09-29T08:02:15Z', version: 3 }, { sequence: 2, committed_at: '2026-09-22T08:01:40Z', version: 2 }, { sequence: 1, committed_at: '2026-09-15T08:01:22Z', version: 1 }];
      case 'contact_at_snapshot': {
        return window.__MOCK_DATA__.contacts.find(c => c.resource_name === args.resourceName) || null;
      }
      case 'contact_media': return [{ source_url: 'https://avatar/mh', status: 'retrieved', data_url: window.__MOCK_DATA__.avatars['people/margaret'], retrieved_at: '2026-09-29T08:01:00Z' }];
      case 'win_is_maximized': return false;
      case 'get_storage_path': return 'C:\\\\Users\\\\Alex\\\\AppData\\\\Roaming\\\\ContactHistory\\\\accounts\\\\acc-demo';
      case 'plugin:event|listen': return 1;
      case 'plugin:event|unlisten': return null;
      default: return null;
    }
  }
};
`;

// CDP client implementation
class ChromeDevToolsClient {
  private ws!: WebSocket;
  private id = 0;
  private pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: unknown) => void }
  >();

  async connect(targetUrl: string) {
    this.ws = new WebSocket(targetUrl);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });

    this.ws.onmessage = (e) => {
      const msg = JSON.parse(e.data as string);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)!;
        this.pending.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    };
  }

  call(method: string, params: Record<string, unknown> = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      const msgId = ++this.id;
      this.pending.set(msgId, { resolve, reject });
      this.ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  async eval(expression: string): Promise<any> {
    const res = await this.call('Runtime.evaluate', { expression, returnByValue: true });
    return res?.result?.value;
  }

  close() {
    this.ws.close();
  }
}

async function run() {
  const tempDir = join('C:\\Windows\\Temp', 'ch-screenshots-' + Date.now());
  const browserProc: ChildProcess = spawn(browserPath!, [
    '--headless=new',
    '--disable-gpu',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${tempDir}`,
    '--window-size=1200,820',
    '--force-device-scale-factor=1',
    'about:blank',
  ]);

  try {
    await Bun.sleep(1500);

    // Get Page-level CDP WebSocket URL
    const targetRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, {
      method: 'PUT',
    });
    const target = await targetRes.json();
    const wsUrl = target.webSocketDebuggerUrl;

    const cdp = new ChromeDevToolsClient();
    await cdp.connect(wsUrl);

    await cdp.call('Page.enable');
    await cdp.call('Runtime.enable');
    await cdp.call('DOM.enable');

    // Add script on new document
    await cdp.call('Page.addScriptToEvaluateOnNewDocument', {
      source: injectionScript,
    });

    console.log('Browser ready. Capturing screenshots...');

    async function capture(fileName: string) {
      await Bun.sleep(600);
      const res = await cdp.call('Page.captureScreenshot', { format: 'png' });
      const buffer = Buffer.from(res.data, 'base64');
      const targetPath = join(SCREENSHOTS_DIR, fileName);
      writeFileSync(targetPath, buffer);
      console.log(`Saved screenshot: ${fileName} (${(buffer.length / 1024).toFixed(1)} KB)`);
    }

    // 1. Contacts Table View (Light Theme)
    await cdp.call('Page.navigate', { url: `http://127.0.0.1:${PORT}` });
    await Bun.sleep(2000);
    await cdp.eval(`
      localStorage.setItem('contact-history-preferences', JSON.stringify({ theme: 'light', density: 'comfortable' }));
      document.documentElement.dataset.theme = 'light';
    `);
    await capture('01-contacts-table.png');

    // 2. Contact Detail View (Margaret Hamilton)
    await cdp.eval(`
      const row = Array.from(document.querySelectorAll('.contact-row')).find(r => r.textContent.includes('Margaret Hamilton')) || document.querySelector('.contact-row');
      if (row) row.click();
    `);
    await Bun.sleep(800);
    await capture('02-contact-detail.png');

    // Close detail view
    await cdp.eval(`
      const backBtn = document.querySelector('.detail-back-btn, .close-detail-btn, button[title="Back"]');
      if (backBtn) backBtn.click();
    `);
    await Bun.sleep(400);

    // 3. Changes / Snapshot Diff View
    await cdp.eval(`
      const changesLink = Array.from(document.querySelectorAll('.sidebar-nav-item, button')).find(el => el.textContent.includes('Changes') || el.textContent.includes('Capture History'));
      if (changesLink) changesLink.click();
    `);
    await Bun.sleep(800);
    // Expand Margaret Hamilton card to show clean, accurate field diffs
    await cdp.eval(`
      const cards = document.querySelectorAll('.contact-change-card');
      if (cards.length > 0) {
        const header = cards[0].querySelector('.change-card-main-header');
        if (header) header.click();
      }
    `);
    await Bun.sleep(600);
    await capture('03-changes-diff.png');

    // Return to Contacts View
    await cdp.eval(`
      const contactsLink = Array.from(document.querySelectorAll('.sidebar-nav-item, button')).find(el => el.textContent.includes('Contacts'));
      if (contactsLink) contactsLink.click();
    `);
    await Bun.sleep(500);

    // 4. Settings & Preferences Dialog
    await cdp.eval(`
      const settingsBtn = document.querySelector('button[title*="Settings"], button[aria-label*="Settings"]');
      if (settingsBtn) settingsBtn.click();
    `);
    await Bun.sleep(800);
    await capture('04-settings-dialog.png');

    // Close Settings
    await cdp.eval(`
      const closeBtn = document.querySelector('button[aria-label="Close settings"], .settings-save-btn, .modal-close-btn');
      if (closeBtn) closeBtn.click();
      else window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    `);
    await Bun.sleep(500);

    // 5. Column Customizer Dialog
    await cdp.eval(`
      const colBtn = document.querySelector('button[aria-label="Change column order"], button[data-tooltip="Change column order"]');
      if (colBtn) colBtn.click();
    `);
    await Bun.sleep(800);
    await capture('05-column-customizer.png');

    // Close column dialog
    await cdp.eval(`
      const doneBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.trim() === 'Done');
      if (doneBtn) doneBtn.click();
      else window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    `);
    await Bun.sleep(600);

    // 6. Dark Theme Contacts View
    await cdp.eval(`
      localStorage.setItem('contact-history-preferences', JSON.stringify({ theme: 'dark', density: 'comfortable' }));
      document.documentElement.dataset.theme = 'dark';
    `);
    await Bun.sleep(800);
    await capture('06-contacts-table-dark.png');

    cdp.close();
    console.log('\nAll updated screenshots captured successfully in docs/screenshots/!');
  } finally {
    browserProc.kill();
    server.stop();
  }
}

run().catch((err) => {
  console.error('Error generating screenshots:', err);
  process.exit(1);
});
