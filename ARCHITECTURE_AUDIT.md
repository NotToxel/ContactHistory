# Google Contacts audit engine — architecture review

Reviewed 16 September 2026. Evidence: the supplied brief and SQL. The workspace was empty; there were no Rust/TypeScript sources, dependency manifests, lockfiles, Tauri configuration, or tests to inspect. This is a design audit, not certification of an implementation.

**Verdict: retain Tauri + Rust + SQLite + React. Correct the ingestion and archival guarantees before treating this as a dependable backup.** Antigravity is not assigned a runtime role in the supplied architecture; assess the resulting code, builds and tests independently of the authoring tool.

## Priority findings

### 1. High — the six-day watchdog does not guarantee valid sync tokens

The specification describes expiry after inactivity and perpetual renewal through delta pulls. Google documents expiry seven days after the full sync. Implement full reconciliation as an ordinary recovery path. Recognize the documented `EXPIRED_SYNC_TOKEN` error reason, not only an assumed HTTP 410.

A Rust thread cannot execute after its process exits or while the machine is powered off. A real OS scheduler needs a headless entry point, persisted run times, missed-run handling and access to credentials in the scheduled user's context. Serialize foreground and scheduled runs. Show the last successful capture and stale status.

Source: [People connections API](https://developers.google.com/people/api/rest/v1/people.connections/list).

### 2. High — “any historical millisecond” is not achievable from periodic observations

If a field changes A → B → C between observations, capturing C does not recover B or its lifetime. A contact created and deleted between observations may likewise have no recoverable full snapshot. No pre-installation history is available from this scheme.

Promise reconstruction of **locally observed states**, with capture coverage and gaps. Store source update time separately from observation time and a monotonically ordered committed batch ID. Do not present a multi-page fetch as an exact instantaneous Google snapshot.

The later snapshot-selection design is preferable to the earlier proposal to reverse mutations: retain complete snapshots and use diffs for display. Define the first capture as a baseline, not the actual creation time of every contact.

### 3. High — the SQL contradicts immutable history

`contacts_history` references `contacts_current` with `ON DELETE CASCADE`. A current-row delete destroys its entire audit trail. Also, `(resource_name, version)` has an index but no unique constraint: duplicate revisions are legal and the reconstruction join can return multiple rows for one contact.

**Verified against the supplied schema in isolated in-memory SQLite:** two history rows with version 1 were accepted; deleting their parent left zero history rows. This test checks schema behavior, not WAL durability.

Use a stable contact-identity table independent of the mutable current projection; restrict identity deletion. Add unique account/contact/version constraints, positive version checks and allowed change-type checks. Prevent ordinary application updates/deletes to history. These controls provide application-level append-only behavior, not tamper-proof storage against someone who can edit the database. If adversarial tamper evidence matters, add signed, externally anchored manifests.

### 4. High — atomic ingestion and recovery are underspecified

The five-step flow does not define a transaction across snapshots, current state and cursor advancement. Advancing a cursor before all corresponding data is durable can permanently skip changes; retries can duplicate history. Google returns the next sync cursor only on the final page, and requires consistent request parameters.

Stage all pages under a sync-run ID. On successful completion, atomically publish revisions, current state, the cursor and run status. On a full reconciliation, infer absence only after every page succeeds, under the same account and source/field configuration. Never tombstone contacts after a failed or partial scan. Persist request configuration alongside the cursor. Separate run IDs from sync tokens; initial full-sync requests have no previous token.

Source: [People connections API](https://developers.google.com/people/api/rest/v1/people.connections/list).

### 5. High — normalized primary fields lose historical data

The schema stores a single email, phone, address and organization. The current raw payload does not recover older secondary values if normalized historical snapshots discard them. Preserve full requested arrays, labels/types, source metadata and raw payload per revision; derive primary columns for display/search only. Explicitly define field coverage, including birthdays, notes, URLs and custom fields if “entire contact book” is promised.

Canonicalization must distinguish missing fields from deletion and avoid revisions caused only by array ordering, etags or temporary photo URLs. Keep those source values as evidence while excluding irrelevant transport changes from semantic diffs. Specify the Rust diff format and its schema version; the name “DeepDiff” alone is not an interoperable contract.

Google exposes primary/source metadata for person fields: [Person resource](https://developers.google.com/people/api/rest/v1/people).

### 6. High — photo encoding and archival identity are inconsistent

The design hashes downloaded bytes, names them `.webp`, and exports them with `TYPE=JPEG`. Renaming bytes does not transcode an image. If transcoding happens, the source hash may no longer describe stored bytes.

Preserve original bytes with detected MIME type and full SHA-256. Store derived display images separately with their own hashes and conversion version. Encode the actual format in vCard, or create a real JPEG/PNG export derivative. Avoid the unexplained 16-hex-character truncation; it retains only 64 bits of the digest. Select photos using metadata and a documented source policy, not blindly `photos[0]`.

A failed fetch is not a removed photo. Record present/absent/pending/failed distinctly; retry without discarding the previous captured binary or claiming the new photo is archived. Enforce response-size, decoded-dimension and timeout limits. A hash detects binary equality, not visual equality across resized or recompressed responses.

Source: [vCard 3.0 specification](https://www.rfc-editor.org/rfc/rfc2426.html).

### 7. High — public photo hosting conflicts with a private archive

The proposed public CDN URLs and public cache headers expose contact photographs to anyone holding the URL. Hashing is not authorization. Prefer local-first storage and optional private R2 backup; authenticate remote reads. Never distribute shared bucket-write credentials inside the desktop binary.

SQLite, disk and R2 do not share a transaction. Use durable local files plus an upload outbox, retries and explicit replication status. A revision must retain its photo dependency even after the contact is deleted; garbage collection must consider every historical reference. Durable backups need the database, media and a verifiable manifest, not just the current photos.

An immutable URL/header does not prevent object overwrite/deletion or guarantee indefinite edge residency. R2 public caching requires a configured delivery path; the `workers.dev` example implies a Worker not specified in the architecture. Source: [R2 public bucket delivery](https://developers.cloudflare.com/r2/buckets/public-buckets/).

### 8. High — export compatibility is asserted without evidence

Current Google import guidance documents `Labels` with `:::` separators. Do not assume the legacy `Group Membership` syntax is the only canonical format. The cited guidance does not establish that importing a CSV photo URL restores a photograph; treat that feature as unverified.

Build export fixtures against a current Google export/template. Test multiple values, custom labels, Unicode, quoting/newlines, birthdays, notes and historical photos. For vCard 3.0 implement required fields, escaping, CRLF and folding correctly, and test each target importer. Import creates records; it does not recreate Google resource IDs, audit revisions or necessarily resolve duplicates.

Sources: [Google import guidance](https://support.google.com/contacts/answer/15147365?hl=en-GB), [vCard 3.0](https://www.rfc-editor.org/rfc/rfc2426.html).

### 9. Medium — label history needs its own model

An in-memory ID-to-name map and string labels cannot reliably represent group renames/deletions through time. Persist group IDs, group revisions and membership IDs; resolve names at the chosen historical capture. Do not assume a group rename updates every person's delta record. Group synchronization is a separate API surface. Account-scope identities and cursors, or explicitly enforce one account per database.

Source: [Contact groups API](https://developers.google.com/people/api/rest/v1/contactGroups/list).

### 10. Medium — SQLite durability and temporal ordering need explicit choices

WAL is suitable, but `synchronous=NORMAL` can lose committed transactions after power loss/system crash. Prefer `FULL` for an audit archive unless measured requirements justify that tradeoff. WAL permits readers alongside a writer; it does not provide multiple simultaneous writers. Use one ingestion writer, bounded blocking work outside UI/async executor threads, busy-timeout handling and connection-local PRAGMAs.

The time query assumes versions and timestamps advance together, but wall clocks can move backward. Use an ordered capture sequence with deterministic ties and distinguish source timestamps from local observation timestamps. Standardize time representation. Add an index matching account/contact/capture lookups, then measure on realistic history volumes.

Use SQLite's backup facilities or a coordinated consistent snapshot; copying only the live `.db` can omit WAL data. Test restoration together with retained media. Source: [SQLite synchronous documentation](https://sqlite.org/pragma.html#pragma_synchronous), [SQLite backup API](https://sqlite.org/backup.html).

### 11. Medium — OAuth and IPC security are incompletely specified

Read-only scope and system-browser PKCE are sound. Bind loopback port 0 locally, then put the actual allocated port in the redirect URI; validate state, use S256, limit callback lifetime and handle denial/revocation. External OAuth projects in Testing can receive seven-day refresh tokens for Contacts scope, so the stated six-month inactivity rule is incomplete.

Stronghold is a password-derived encrypted vault; it is not automatically the OS keychain. Choose and document the actual keyring backend or vault key custody, including unattended access. Token protection alone does not encrypt contact databases, photos, backups or exports.

`invoke<T>` is not automatic end-to-end validation. Generate/version command contracts and validate arguments in Rust. Keep tokens and bucket credentials out of the WebView; scope commands, file access and CSP. Tauri documents that registered app commands are available to all app windows/webviews by default unless restricted appropriately. Review custom commands as well as plugin capabilities.

Sources: [Google native OAuth](https://developers.google.com/identity/protocols/oauth2/native-app), [refresh-token lifecycle](https://developers.google.com/identity/protocols/oauth2), [Stronghold](https://v2.tauri.app/plugin/stronghold/), [Tauri capabilities](https://v2.tauri.app/security/capabilities/).

## Stack decisions

- **Keep Tauri v2 and Rust:** appropriate for native credentials, local persistence and a read-only desktop client. Treat the quoted 12 MB/35 MB as unverified targets; benchmark signed release builds, WebView child processes and real datasets.
- **Keep SQLite/rusqlite:** a good embedded fit. A dedicated writer with separate readers is simpler than an unnecessarily elaborate pool. Version migrations and snapshot formats.
- **Keep React/TypeScript:** suitable for the browser and diff UI. Virtualize large lists and page history in Rust/SQL instead of loading the entire archive into React.
- **Tailwind and Lucide are acceptable presentation choices:** neither automatically implements Material 3 or accessibility. Verify focus handling, keyboard navigation, table semantics and readable before/after changes. Dark-mode hex values are not a design system.
- **Make R2 optional:** useful for remote backup, unnecessary for initial local correctness. Measure AWS SDK build/runtime cost before replacing a maintained SDK with handwritten signing.

## Recommended delivery order and acceptance gates

1. Define observed-history semantics, account boundaries and complete snapshot coverage. Amend the schema before building more UI.
2. Implement paginated staging, atomic publication and cursor advancement, serialized runs, full reconciliation and explicit sync health.
3. Add original photo retention and durable retry/outbox state, then proven CSV/vCard serializers.
4. Add secure scheduled execution, private optional replication, consistent backups and restore verification.
5. Package, sign and test on each supported OS; verify narrow Tauri permissions and measure performance.

Required tests: crash/restart at cursor commit boundaries; failure on a middle page; expired cursor; retry idempotency; simultaneous launch/watchdog; clock rollback; rename/delete groups; secondary-field-only change; sparse tombstone; photo fetch failure versus removal; account switch; backup restore; current-target export/import round trips. Live Google/R2 behavior, OS scheduling, performance and imports were not tested in this review.
