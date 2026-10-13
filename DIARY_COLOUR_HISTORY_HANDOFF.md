# Diary Colour History — new project handoff

## Instruction to the receiving agent

Create a separate sibling project forked from `C:/Development/ContactHistory` for browsing the history of colours assigned to people in a Diarium diary. This brief is the implementation request. Use `DiaryColourHistory` as a provisional project/directory name unless the user chooses another. Keep the original ContactHistory application intact. Inspect the source and applicable AGENTS.md instructions before editing. Proceed through the stages below; deliver a working application, not just a scaffold.

Use Bun exclusively for dependency, development, build and test commands. Never use npm, npx, yarn or pnpm. Retain the existing Tauri 2, Rust, Svelte 5 and TypeScript stack. Run Rust tests through `bun run test:rust`. Preserve the inherited licence and attribution; the source package declares AGPL-3.0-only.

Do not copy node_modules, dist, src-tauri/target, credentials, local archives or the source project's .git directory into the new project. Create an independent repository. Give the fork distinct package/crate names, Tauri application identifier, title, storage directories, backup extension and preferences keys. Audit hardcoded ContactHistory names so the applications can coexist without sharing or overwriting state. Do not modify or restore the source diary or its cloud versions.

## Purpose and scope

The user assigns colours to people in Diarium, usually changing them only every few years. They want a searchable people list, current colours, individual colour timelines and a view of assignments at a chosen historical observation. Historical copies exist in OneDrive Version history; automatic import is a core requirement.

Reuse ContactHistory's desktop layout, search patterns, person detail/history presentation, theme/settings, archive concepts, secure credential handling patterns and backup infrastructure where appropriate. Replace the Google Contacts provider, contact-field diffs, photo/media archive and contact exports with a focused diary reader and Microsoft OneDrive history importer. Avoid carrying unused provider-specific features into the product.

## Verified source database

Path: `C:/Users/cl/OneDrive/Life/Diary/Diarium.diary`.

Read-only inspection on 13 October 2026 found a SQLite database of 296,394,752 bytes. Relevant schema:

```sql
CREATE TABLE Tags(
  DiaryTagId integer primary key autoincrement not null,
  Value varchar not null,
  Type integer not null,
  Color varchar,
  Icon varchar
);
```

The user's existing `data_loader.py` identifies Type 1 as people and Type 0 as ordinary tags. There are 1,789 Type 1 records, 961 with non-null Color. Other tables are Entries, EntryTags, Events, Media and Templates. The inspected schema contains no colour audit table or colour assignment date. Do not read diary text, media or other unrelated content for this feature.

Colours include eight-digit strings such as `#FF6600CC`. Preserve exact source values. Verify the alpha/channel convention before converting them to CSS; do not assume eight-digit source strings use CSS's RGBA order. Distinguish null, empty, invalid and explicit colours in storage and present them intelligibly. Do not invent palette meanings or silently replace unassigned colours with an assigned default.

Use DiaryTagId for identity within a particular source diary. Preserve names at each observation and track renames. Validate identity continuity across older versions and handle a different diary, restored database or reused ID without silently merging unrelated people. Names alone are not reliable identity keys.

## History semantics

Version timestamps establish observations, not exact colour assignment times. Show “First seen” and, when useful, “Changed between [previous observation] and [next observation]”. The oldest imported colour is a baseline, not a known assignment event. Never backdate an assignment using diary entries mentioning the person. A missing person is an absence in that observation, not proof of intentional deletion.

Store observations and their complete, small people/colour state so historical views remain reproducible. Deduplicate identical states and derive transitions from observations ordered by source timestamp. Importing older observations later must recompute affected transitions rather than append them to the end of history. Track both source observation time and import time, source/version identifiers, content/state hash and import status. Distinguish the latest chronological source observation from the latest import.

Suggested conceptual entities: source diaries; import/check runs; observations; people identities; reusable person states; observation-to-state membership. Choose a simple schema based on requirements rather than copying the entire ContactHistory schema. Make imports transactional and idempotent. Preserve observations even when the colour state is unchanged; store shared states rather than duplicate large data.

## Reading the local diary

Read strictly read-only. Obtain a consistent SQLite snapshot using SQLite backup/read transaction facilities appropriate to the source's journalling mode; account for WAL files and concurrent writes. Do not blindly copy only the main file while it is being modified. Handle locks, partially synced files, unavailable OneDrive placeholders and failed integrity/schema checks with actionable errors. Work against a private temporary snapshot when appropriate. Hash/extract only the required tag state after a successful read. No full diary copies in the normal application archive.

## Automatic OneDrive history import

Use Microsoft Graph v1.0 with delegated authentication and the minimum required read permissions. Official references, verified during planning:

- List versions: https://learn.microsoft.com/en-us/graph/api/driveitem-list-versions?view=graph-rest-1.0
- Download version content: https://learn.microsoft.com/en-us/graph/api/driveitemversion-get-contents?view=graph-rest-1.0

Both document delegated `Files.Read` support for personal and work/school accounts. Re-check current Microsoft documentation when implementing authentication, account support, pagination, throttling and downloads.

The app needs a Microsoft application registration and an interactive user sign-in. Configure the client ID and document setup. Never embed a client secret in the desktop app. Use a supported public-client authentication flow and protect tokens using OS credential storage. If registration/sign-in is unavailable, complete and test the local reader and importer using fixtures, document the remaining setup and accurately report that live OneDrive verification is pending.

Resolve/select the cloud file, then retain its drive ID and item ID. Do not assume the local Windows path is the Graph path. Enumerate all available versions, following pagination if returned, and preserve version IDs and source timestamps. Download each version into private temporary storage, validate it as the expected SQLite schema, extract tag states and commit the observation. Process with low bounded concurrency, support cancellation, retry/backoff and throttling, and persist a resume checkpoint. Re-list on subsequent runs and skip already imported versions. Handle expired download URLs without logging signed URLs or credentials. Validate Graph redirect/download authentication handling against current docs.

Process versions chronologically where possible, with stable handling of timestamp ties. Reconcile how Graph includes the current version so it is neither omitted nor duplicated. Failed versions must remain visible as gaps and must not generate false person removals. Remove app-created temporary files after each processed version and recover safely after crashes.

Only retained OneDrive versions can be recovered. Do not promise complete lifetime history. A current-size estimate is roughly 30 GB for 100 versions; actual sizes vary. Show available version count, estimated download total when metadata allows, progress, failures and remaining work before/during the import. Extracted history should stay small. A resumable automatic import must not require manually downloading or restoring versions.

## User experience

- Onboarding: select local diary; optional connect OneDrive and select matching cloud file.
- People list: search, name, current colour swatch and textual value, latest observed change; filters for colour and unassigned people.
- Person detail: current assignment and chronological colour timeline, historical names, provenance and honest date labels. Accessible labels must convey meaning without relying on colour alone.
- Historical view: select a saved observation/date; explain that it reflects the latest known observation at or before that date and warn about gaps.
- Import screen: version inventory, download estimate, progress, pause/cancel/resume, retry failed versions and completion summary.
- Settings: source paths/cloud identity, capture-on-open and optional periodic local checks, account disconnect, portable backup/restore.

Keep normal operation offline after import. Store the working archive in the fork's own local application-data directory. Support backing up a consistent archive to a user-selected location such as OneDrive; do not put the live working SQLite archive there by default.

## Delivery stages

1. Create the separate fork and isolate its identifiers/storage. Remove unrelated Google/photo functionality. Implement read-only local capture, archive schema, searchable people list and person timeline. Support importing dated local copies for fixtures and recovery.
2. Implement Microsoft sign-in, cloud-file selection and resumable historical-version import. Ensure out-of-order import produces the correct timeline and historical states.
3. Add historical observation navigation, automatic local capture, gap visibility, backup/restore and polish. Document installation and Microsoft registration/setup.

## Acceptance and validation

Use synthetic SQLite fixtures for deterministic tests; do not commit the user's diary, names or tokens. Test unchanged colours, colour-to-null changes, renames, absence/reappearance, returning to an earlier colour, older imports arriving late, repeated version imports, failed/cancelled/resumed imports and source isolation. Check alpha/channel conversion using verified examples. Mock Graph version enumeration/download, pagination and throttling, then verify against the user's live account when configured.

Run `bun run check`, relevant `bun run test`, `bun run test:rust` and `bun run build`. Verify the fork starts and coexists with ContactHistory. Confirm the original database is untouched and no diary text/media is retained in the new archive. Report completed functionality, validation results and any remaining live-authentication/setup limitation clearly.

## Name suggestions

- ColourTrail — recommended; directly describes a history of colour assignments.
- Palette History — clear and descriptive.
- People Palette — emphasises people and their assigned colours.
- ColourChronicle — a more distinctive history-focused name.
- HueHistory — compact, with an obvious colour/history connection.
- Diary Colours — ties the app directly to its source.
- ColourLedger — suggests a durable record of assignments.
- PaletteTrace — suggests following colours through time.

These are creative suggestions; availability and trademark status have not been checked.
