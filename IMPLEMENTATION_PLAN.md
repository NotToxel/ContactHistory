# ContactHistory implementation plan

Status: implementation in progress. The desktop app, archive engine, Google ingestion, media retention, scheduler path, historical review, exports, and native backup now have code. Live-account and installed-release validation remain pending.
Date: 16 September 2026.

Implementation checkpoint (16 September 2026): synthetic engine tests cover account isolation, deletions, unchanged revisions, failed media, delta reconstruction, date selection, export serialization, and native backup round trip. `cargo test`, `cargo clippy --all-targets -- -D warnings`, and the frontend build pass on Windows. Remaining acceptance work includes live Google OAuth/page failure validation, importer round trips, schema migration upgrade tests, configured column/label browsing, performance stress runs, scheduler installation and upgrade tests, and a signed installer.

This plan records the agreed product direction and supersedes the original specification where they differ. ARCHITECTURE_AUDIT.md remains a record of the original design review.

## 1. Agreed product and technical decisions

- Tauri v2 desktop shell, Rust application core, SQLite through rusqlite, Svelte + TypeScript + Vite frontend.
- Capture personal Google Contacts approximately once a week. Capture on launch only when overdue; allow an explicit Capture now action.
- Local storage only. No R2, cloud photo hosting, upload service or remote database.
- Separate account archives from the start: one database and media directory per account.
- Preserve every supported field returned by the source, including multi-value fields and their metadata; retain exact retrieved photo bytes.
- Preserve observed history with ordinary application-level append-only behavior. No cryptographic tamper-proof audit system.
- Browse and export historical captures without writing contacts back to Google.
- Retain all captures and referenced media by default. Do not silently prune history.

Implementation assumption: ship and validate Windows first, matching the current development environment. Keep the core portable; macOS/Linux packaging, keychain integration and schedulers are subsequent platform work, not implied by a Windows release.

## 2. Product contract

### What a capture means

A capture is the contact book assembled during one successfully completed observation run. It has a start time, commit time and strictly increasing sequence number. It is not a record of every Google edit or a guarantee of an instantaneous server snapshot.

The historical browser selects a committed capture. A date/time input resolves to the most recent capture committed at or before that time and clearly displays the actual capture time. Before the first capture, no history exists. Source update timestamps are retained separately and never used to invent unobserved revisions.

Every successful capture is recorded, even if there are no semantic changes. Contact revision counts increase only for actual semantic changes. Raw source responses remain available as capture evidence even when etags or temporary URLs change without a semantic revision.

### What “everything” means

Maintain an explicit field-coverage manifest listing every supported People API field requested, its source, normalization and export support. Archive whole returned Person objects without flattening away arrays, metadata or unknown nested properties. Include names, emails, phones, structured addresses, organizations, memberships, birthdays, events, biographies, URLs, relations, custom fields and other supported fields.

The v1 boundary is saved Google Contacts accessible through the authorized People API, including returned profile enrichment with provenance retained. Separate Other Contacts and Workspace directory datasets are not silently included. Document inaccessible or unsupported source data rather than calling the archive a complete Google account backup.

Archive original retrieved media, not re-encoded replacements. Google may serve a resized image; “original” means the exact bytes retrieved, not necessarily the user's original uploaded file. Capture every returned supported photo reference, distinguish generated/default images, and retain cover photos if exposed by the selected field coverage. Thumbnails are disposable derivatives.

CSV/vCard exports can only express fields supported by those formats and importers. The native archive is the full-fidelity recovery format. If a user supplies an existing Google export during validation, retain its original bytes; building a general export-file importer is separate from the initial API ingestion path.

## 3. Architecture and project layout

Svelte invokes narrow application commands. Rust owns authentication, networking, database access, media, scheduling and export. The UI never receives OAuth refresh tokens or runs arbitrary SQL. The same Rust core supports the visible app and headless scheduled captures.

```text
src/
  lib/ipc/                 Typed command wrappers and response contracts
  lib/components/          Contact table, field renderer, diffs, capture picker
  lib/state/               Account, filters and capture selection
  routes/                  Onboarding, contacts, history and settings views
src-tauri/
  capabilities/            Restricted window and plugin permissions
  src/commands/            Tauri adapters with argument validation
  src/core/auth/           OAuth, identity and credential storage
  src/core/storage/        Migrations, account paths and repositories
  src/core/capture/        Pagination, reconciliation, staging and commit
  src/core/media/          Original files, hashing, derivatives and retries
  src/core/history/        Snapshot queries and semantic diffs
  src/core/export/         CSV, vCard and native archive
  src/core/scheduler/      Due checks and platform scheduler adapters
  migrations/             Ordered SQL migrations
tests/fixtures/            Synthetic API responses and export fixtures
```

The routes directory is a UI organization convention, not a SvelteKit dependency. Use a simple single-window application; no SSR or separate JavaScript server.

Store application data beneath the OS application-data directory, not the source checkout:

```text
accounts.json                          Non-secret local account registry
accounts/<local-account-uuid>/
  archive.db
  media/<full-sha256>.<detected-format>
  thumbnails/                          Regenerable
  staging/<run-id>/                     Unpublished work
```

Use a verified stable Google identity to associate sign-ins with local account IDs; do not key archives by an editable email address. Plan minimal OpenID identity scopes alongside contacts.readonly where necessary to establish that binding. Keep identity permissions explicit in onboarding. Store OAuth credentials in the Windows credential store behind a Rust abstraction.

## 4. Data model and consistency rules

Implement versioned migrations with the following responsibilities:

- `account_metadata`: stable provider identity and archive/schema versions; verify on every open and import.
- `capture_runs`: attempts, trigger, start/end, result, errors and requested field/source configuration.
- `captures`: published sequences, observation window, counts, media completeness and coverage version.
- `contact_identities`: stable local identities associated with provider resource names; independent of mutable projections.
- `contact_revisions`: full semantic snapshots, unique contact/version pairs, change kind and first observed capture. Preserve tombstones without deleting earlier revisions.
- `raw_observations`: lossless source payloads associated with runs/captures, separately from normalized semantic snapshots.
- `capture_contacts`: the complete contact-to-revision mapping for each published capture, including deletion state needed for historical queries. Reuse unchanged snapshots rather than duplicating large values.
- `group_revisions` and `capture_groups`: group IDs, names, metadata and historical mappings; contact membership references use IDs.
- `media_objects`, `observation_media` and `media_jobs`: exact-file hashes, MIME types, size, source association, availability and retry state.
- `current_contacts`: indexed, rebuildable search/display projection.
- `sync_state`: cursor, producing full-sync time and exact request configuration.

Use foreign keys, unique constraints, allowed-status checks and deterministic ordering. No cascading deletion from current state into history. Use SQLite WAL with synchronous=FULL, a single writer per account, separate read connections, busy timeouts and short publication transactions. Blocking database/image operations must not block the UI or async executor.

Capture commit protocol:

1. Acquire a cross-process per-account lock and create a run record.
2. Stage all contact and group pages. Preserve the prior published capture while work is incomplete.
3. Build complete snapshots, mappings and semantic changes. Infer missing contacts only after a successful complete full scan under the same source coverage. A changed field/source configuration requires a fresh baseline, not deletion inference across incompatible scopes.
4. Retrieve media with bounded concurrency. Write verified files through temporary paths and atomic renames before inserting available-file references. Missing media gets an explicit pending/failed record.
5. In one SQLite transaction, publish the capture, revisions, mappings, current projection, media jobs and next cursor. Recheck expected predecessor state before committing.
6. Release the lock and notify the UI. Recover abandoned staging on restart; never expose partial captures.

Media failure must not prevent preserving successfully observed contact text. Publish an explicitly incomplete-media capture, retain the old photo only as separately labelled historical evidence, and retry missing media. A later retrieval records its own retrieval time; never pretend it was captured earlier. A native backup may include unresolved references with a completeness manifest; exports requiring an unavailable historical photo must warn explicitly.

## 5. Delivery phases

### Phase 1 — Foundation and account archive

Tasks:
- Scaffold Tauri/Svelte/TypeScript/Vite, select compatible stable dependency versions and commit lockfiles.
- Implement Rust core boundaries, validated IPC contracts and narrow capabilities/CSP.
- Create account directories, schema migrations, repositories and a synthetic fixture loader.
- Implement account locking, atomic publication and ordered capture queries before networking.
- Use CSS variables for Material-inspired light/dark tokens; avoid adding a styling framework until it has a concrete benefit.

Exit criteria: a fixture account can publish two captures, preserve a deleted contact's history, restart safely and query either capture. A second account cannot access the first account's data. Duplicate revisions and invalid references are rejected.

### Phase 2 — Google connection and complete contact capture

Tasks:
- Configure Google OAuth desktop-client prerequisites and read-only contact access.
- Implement system-browser PKCE S256, random state, short-lived loopback listener and actual allocated redirect port.
- Bind credentials to verified account identity; handle cancellation, refresh and reauthorization without losing archives.
- Establish the field-coverage manifest and preserve raw responses. Do not silently reduce coverage when requests fail.
- Implement paginated full contact scans and group scans, normalization and atomic reconciliation.
- Add bounded retries/backoff for transient errors and quota responses, cancellation, redacted diagnostics and progress events.

Exit criteria: a development account with multiple field values, custom labels, Unicode and sparse/deleted records produces a complete text capture. Failure on any contact/group page leaves the previous published state and cursor intact. Repeating an unchanged scan records a capture without invented semantic revisions.

External prerequisite: the user supplies/configures a Google Cloud desktop OAuth client and completes browser consent. Production versus Testing consent status must be documented, including refresh-token limitations. No Google contacts are modified by the application.

### Phase 3 — Original media and efficient repeat captures

Tasks:
- Download every supported returned image with MIME detection, byte/dimension limits, redirect validation and timeouts.
- Keep exact bytes and full SHA-256 filenames. Generate separate local thumbnails.
- Detect photo removal independently from fetch failure; retain historical references permanently by default.
- Implement delta ingestion for early manual captures where a cursor is usable, with complete-current-state reconstruction before publication.
- Use full reconciliation for weekly captures when the token is expired or not safely usable. Avoid needless failed delta attempts at the expiry boundary.
- Refresh groups independently; preserve historical label names.

Exit criteria: changed photos, identical bytes at changed URLs, multiple photos, no photo and unavailable photos are represented correctly. Retry/restart never produces a falsely available file or discards historical media. Delta and full scan paths yield equivalent state for equivalent synthetic inputs.

### Phase 4 — Weekly execution and capture health

Tasks:
- Define next due time as seven days after a successful contact-data capture; manual capture resets it. Media retry state remains separate.
- Add Capture now, overdue-on-launch checking and a due timer while the app remains open.
- Provide a headless `capture --due` entry point using the same core and no WebView.
- Install/update a per-user Windows scheduled task with a due-time trigger and logon catch-up. Run under the same user's credential context, without an administrator service or stored account password.
- While the user is logged out, asleep or powered off, capture can be delayed; catch up after the next eligible session. Do not promise execution while powered off.
- Persist failure and bounded retry timing. Prevent tight retry loops; authentication failures become Needs sign-in rather than repeated browser launches from a background task.
- Keep schedule registration idempotent; handle application updates, scheduling disablement and uninstall cleanup.

Exit criteria: closed-app capture works in an eligible user session; missed runs recover; foreground/background races result in one writer; a newly completed capture prevents another unnecessary scheduled scan. Capturing text successfully with missing media does not create a continuous full-sync loop.

### Phase 5 — Contact browser and historical review

Tasks:
- Build account onboarding/switching, searchable contact list, label filters and configurable columns.
- Implement complete field detail rendering with a generic fallback for preserved fields not given a specialized renderer.
- Provide capture timeline, historical contact-book view, contact revision comparisons and an account-wide change feed.
- Show capture time/window, next due time, failure state and missing media honestly.
- Keep global audit/history scoped to the selected account. Paginate queries and virtualize large lists.
- Support light/dark appearance, keyboard navigation, focus management and accessible labels.

Exit criteria: a user can select an older capture, find a subsequently deleted contact, inspect all retained field values and view its captured photo offline. Switching accounts clears prior-account view state. Primary-only tables never limit stored data.

### Phase 6 — Exports, native backup and restore

Tasks:
- Export a selected committed capture as Google-compatible CSV and vCard 3.0, with explicit field-mapping coverage.
- Preserve repeated values, labels, Unicode, structured names/addresses, escaping, line endings and vCard folding.
- Embed supported-format historical photos in vCard; create a real JPEG/PNG derivative when needed without altering originals. Do not promise CSV photo restoration.
- Produce a native local archive containing a consistent SQLite backup, referenced original media and a format/version/hash/completeness manifest. Exclude tokens, locks and temporary files.
- Restore into a new validated account directory; check archive paths, hashes, schema compatibility and provider identity before activation. Reauthorize separately for future capture.
- Keep existing archives intact during restore. Offer a user-selected destination for local backup copies; no cloud transport.

Exit criteria: native backup/restore preserves accounts, captures, every raw/normalized field and media byte. CSV/vCard fixture tests pass; real importer compatibility is recorded using disposable test contacts, without modifying the user's live contacts during development.

### Phase 7 — Release validation and Windows packaging

Tasks:
- Exercise failure recovery, migrations, account disconnect/reconnect and disk-full/permission errors.
- Ensure disconnect stops scheduling and removes credentials while retaining local history; archive deletion is a separate explicit action.
- Measure startup, search, history queries and archive size with realistic and stress fixture datasets; record results instead of promising arbitrary binary/RAM numbers.
- Build the Windows installer, verify scheduler executable paths through upgrades and document code-signing prerequisites.
- Verify no contact-write API methods, shared secrets, remote photo hosts or unnecessary WebView filesystem/network permissions.
- Document setup, source coverage, offline behavior, backup/restore and observed-history limitations.

Exit criteria: the installed application survives restart and upgrade, captures when due, works offline for all archived data, and restores a native archive into a clean installation. Release notes state the tested OS and importer versions.

## 6. Test strategy

Use deterministic synthetic fixtures first. They must cover all requested field families, multiple values and unknown nested properties. Add selected live-account validation only after read-only ingestion works.

Required engine tests:
- Failure on an intermediate page; expired cursor; repeated page/retry; complete empty scan versus failed scan.
- Crash before and after publication; cursor/state consistency; orphaned temporary files and media retries.
- Added, changed, removed and reappearing contacts; secondary-only changes; reordered arrays and transport-only changes.
- Group rename/removal and historical memberships; source/field coverage changes.
- Clock rollback and equal timestamps; capture selection before first capture.
- Separate account identity, reconnect, switching, and concurrent scheduled/manual attempts.
- Missing media, invalid image bytes, MIME mismatch and late retrieval.
- Backup restore, corrupt manifest, unsafe archive paths and unsupported schema versions.

UI tests focus on behavior: account isolation, accessible capture selection, complete details, before/after inspection and incomplete-media messaging. Export tests include serializer fixtures and documented target-importer round trips. CI runs Rust formatting/lint/tests and frontend type checks/build; integration tests use a temporary archive directory.

## 7. Initial implementation milestone

Deliver Phases 1–2 first: connect one Google account, preserve a complete text capture, restart the app and inspect the stored capture through a minimal UI. This proves the account, transaction and field-retention foundations before building the full visual browser. Full photo retention, weekly closed-app operation and export/restore remain required for the finished v1.

Build dependencies: foundation → complete ingestion → media/deltas → scheduling and historical browser → export/restore → release validation. No R2 work or React migration is needed because no application exists yet.

## 8. Primary implementation references

- [Tauri frontend configuration](https://v2.tauri.app/start/frontend/): Vite-based static frontend integration.
- [People connections API](https://developers.google.com/people/api/rest/v1/people.connections/list): pagination, field/source coverage, cursor compatibility and expiry.
- [Contact groups API](https://developers.google.com/people/api/rest/v1/contactGroups/list): separate group capture.
- [Google desktop OAuth](https://developers.google.com/identity/protocols/oauth2/native-app): system-browser authorization and loopback redirects.
- [SQLite backup API](https://sqlite.org/backup.html): consistent local database backup.

At implementation time, verify exact dependency/plugin and Windows scheduler APIs against current primary documentation. The plan fixes behavior and acceptance criteria without guessing unverified integration details.
