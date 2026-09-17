# Contact History

Windows-first local archive for observed Google Contacts. The app implements read-only account connection, full and early delta scans, historical snapshots, exact retrieved photo bytes, bounded photo retry, a seven-day due check, Windows Task Scheduler registration, a contact/change browser, CSV/vCard exports, and a native local backup/restore directory. See [the implementation plan](IMPLEMENTATION_PLAN.md) and the limitations below.

## Develop

Install Bun (or Node.js) and the Rust/MSVC toolchain with the Windows WebView2/Tauri prerequisites. Then run:

```powershell
bun install
bun run tauri dev
```

For checks:

```powershell
bun run build
cd src-tauri
cargo test
cargo fmt --check
```

The app keeps archives under `%APPDATA%\ContactHistory\accounts\<UUID>`. `accounts.json` is a non-secret registry. Each account has its own SQLite database. Refresh tokens are held in Windows Credential Manager via `keyring`.

## Google setup

1. In Google Cloud, enable the People API and configure an OAuth consent screen.
2. Create a **Desktop app** OAuth client and supply its client ID and client secret in the app's Connect Google form.
3. The app opens the system browser for `openid`, `email`, and `contacts.readonly` consent. It uses PKCE and a local loopback callback. It never requests a contact-write scope.
4. Select the connected account and choose **Capture now**. A successful capture includes all contact and group pages. Earlier captures remain visible offline.

Google projects left in Testing mode can have short-lived refresh tokens for Contacts access; publishing/verification choices are controlled in Google Cloud. Reconnect to renew authorization without deleting the local archive.

No OAuth client, user account, or live API credentials are included in the repo. See [field coverage](FIELD_COVERAGE.md) for the source boundary and current limitations.

## Offline fixture

To inspect two captures without a Google account, import the synthetic files in order:

```powershell
cd src-tauri
cargo run -- import-fixture ..\tests\fixtures\capture-1.json fixture-demo demo@example.test
cargo run -- import-fixture ..\tests\fixtures\capture-2.json fixture-demo demo@example.test
```

Then launch the app. The second capture has a revised Ada record and a deleted Grace record; selecting the first capture still shows Grace.

## Headless due capture and scheduling

The same executable can run `capture --due` without opening a window. It checks each account's last successful contact capture and performs a scan when seven days have elapsed. The foreground app performs the same check on launch and hourly while open. In an installed release build, **Enable background checks** registers per-user Windows tasks for daily and logon checks. A logged-out, sleeping, or powered-off machine catches up later. Schedule registration is intentionally unavailable from a debug build.

## Export and backup

Choose a capture, then use **Export CSV** or **Export vCard**. These formats map only importer-supported fields and cannot preserve the full source payload. [Export mapping](EXPORT_MAPPING.md) records the current mapping and gaps. The vCard export embeds an available historical photo and stops with a clear error if a referenced photo is unavailable.

**Back up this account** creates a `.contacthistory` directory containing a consistent SQLite snapshot, referenced media, and a hash manifest. **Restore local backup** validates the manifest and restores into a new local account ID. It does not restore OAuth credentials; reconnect Google separately for future captures. The backup may explicitly report incomplete media.

CLI equivalents, using an account UUID and capture sequence from the UI:

```powershell
contact-history.exe backup <account-uuid> C:\Backups\account.contacthistory
contact-history.exe restore C:\Backups\account.contacthistory
contact-history.exe export <account-uuid> <sequence> csv C:\Backups\contacts.csv
contact-history.exe export <account-uuid> <sequence> vcf C:\Backups\contacts.vcf
```

## Current validation limits

The Rust fixture tests and frontend production build pass on Windows. A live Google OAuth account and disposable import target were not available, so OAuth consent, current Google CSV import, and vCard importer round trips have not been tested end to end. The UI uses a paginated list but has no virtualization or configurable columns yet. The release installer is unsigned. Other Contacts and Workspace directory datasets are outside the archive source.
