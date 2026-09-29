# Contact History

[![Platform: Windows](https://img.shields.io/badge/Platform-Windows-0078D6?style=flat-square&logo=windows)](https://github.com/NotToxel/ContactHistory)
[![Tauri: 2.0](https://img.shields.io/badge/Tauri-2.0-24C8DB?style=flat-square&logo=tauri)](https://v2.tauri.app)
[![Svelte: 5](https://img.shields.io/badge/Svelte-5-FF3E00?style=flat-square&logo=svelte)](https://svelte.dev)
[![Rust: 2021](https://img.shields.io/badge/Rust-2021-000000?style=flat-square&logo=rust)](https://www.rust-lang.org)
[![Runtime: Bun](https://img.shields.io/badge/Runtime-Bun-fbf0df?style=flat-square&logo=bun&logoColor=black)](https://bun.sh)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blueviolet?style=flat-square)](LICENSE)

**Never lose a contact, photo, or revision again.**

**Contact History** is a Windows-first, offline-first desktop utility that turns your Google Contacts into a **version-controlled personal archive**. It continuously captures point-in-time snapshots, detects exact field-level modifications, archives original high-resolution photo bytes, provides side-by-side forensic comparisons, and enables portable exports—**operating strictly with read-only permissions and zero cloud telemetry**.

---

## Visual Showcase

<div align="center">

### Main Contacts Workspace
![Contacts Table View](docs/screenshots/01-contacts-table.png)
*Configurable contact table with sortable columns, label filtering, search, and snapshot time-travel.*

<br/>

### Field-Level Visual Diff Engine
![Changes & Diff View](docs/screenshots/03-changes-diff.png)
*Side-by-side and inline visual diffing highlighting additions, modifications, and removals across snapshots.*

<br/>

### Contact Profile Inspector
![Contact Detail View](docs/screenshots/02-contact-detail.png)
*Deep contact inspection with multiple emails/phones, formatted birthdays, custom fields, and snapshot provenance.*

<br/>

### Native Dark Theme
![Contacts Table Dark Mode](docs/screenshots/06-contacts-table-dark.png)
*Complete dark mode support adhering to system preferences or manual customization.*

<br/>

### Column Customizer & Settings
| Column Customization | Preferences & Schedules |
| :---: | :---: |
| ![Column Customizer](docs/screenshots/05-column-customizer.png) | ![Settings Dialog](docs/screenshots/04-settings-dialog.png) |
| *Reorderable, selectable table column slots.* | *Capture schedules, theme, and archive tools.* |

</div>

---

## Why Contact History?

Google Contacts syncs in real-time, but it provides **no revision history, point-in-time snapshots, or audit trails**. When contacts are silently deleted, overwritten by third-party sync apps, or merged incorrectly, Google offers only a blunt 30-day "Undo" that rewrites your entire address book.

**Contact History gives you total control:**
- **Immutable History**: Every capture is permanently preserved in a local SQLite database per account.
- **Forensic Diffs**: Pinpoints exactly what changed—phone numbers, emails, addresses, job titles, photos, notes—between any two captures.
- **100% Read-Only Safety**: Uses OAuth 2.0 PKCE with `contacts.readonly`. It is technically impossible for the application to modify or delete contacts on Google.
- **Offline First**: All data, search indexing, diffs, and exports function entirely offline under `%APPDATA%\ContactHistory`.

---

## Key Features

- **🔒 True Read-Only Security** — Connects via OAuth 2.0 PKCE (`contacts.readonly`). Refresh tokens are encrypted in Windows Credential Manager. Zero external telemetry.
- **⏱️ Point-in-Time Snapshots** — Full initial scan followed by delta syncs. Time-travel to any historical capture sequence.
- **🔍 Granular Visual Diffing** — Highlights additions (green), modifications (amber), and deletions (red) with side-by-side field diffs and JSON patch exports.
- **🖼️ Exact Photo Preservation** — Retrieves, deduplicates (SHA-256), and stores full-resolution contact photo bytes locally.
- **📋 Customizable Workspace** — Reorderable table columns, missing-field auditing, international phone formatting (`libphonenumber-js`), and typo-tolerant search.
- **📦 Universal Export & Backup** — Export any snapshot to Google CSV, vCard 3.0 (with embedded photos), batch photo ZIPs, or self-contained `.contacthistory` archives.
- **⏰ Background Automation** — Headless CLI mode (`capture --due`) with optional Windows Task Scheduler integration for automatic periodic backups.

---

## Installation & Development

### Prerequisites
- [Bun](https://bun.sh) (v1.1+)
- [Rust & Cargo](https://www.rust-lang.org) (MSVC toolchain)
- Windows 10/11 with WebView2 Runtime

> [!IMPORTANT]
> This project strictly uses **Bun**. Do not use npm, npx, yarn, or pnpm.

### Setup & Run
```powershell
# Install frontend dependencies
bun install

# Run desktop application in development mode
bun run tauri dev
```

### Quality & Verification
```powershell
# Run frontend unit tests (Bun test runner)
bun run test

# Run Rust backend test suite
bun run test:rust

# TypeScript and Svelte syntax validation
bun run check

# Format frontend code
bun run format

# Build production bundle
bun run build
```

---

## Google Cloud OAuth Setup

To connect a Google account:

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (e.g. `Contact History Archive`).
3. Under **APIs & Services** > **Library**, search for and enable the **Google People API**.
4. Configure the **OAuth consent screen**:
   - User Type: **External** (or Internal for Google Workspace organizations).
   - Scopes: Add `.../auth/contacts.readonly`, `.../auth/userinfo.email`, and `openid`.
5. Under **Credentials**, click **Create Credentials** > **OAuth client ID**:
   - Application type: **Desktop app**.
   - Name: `Contact History Desktop Client`.
6. Copy the generated **Client ID** and **Client Secret**.
7. Launch Contact History, paste the credentials into the **Connect Google** screen, and authorize via your browser.

---

## CLI & Headless Reference

Contact History compiles to a dual-mode native executable supporting GUI and CLI commands:

```powershell
# Run automated due capture in headless mode (scheduled task target)
contact-history.exe capture --due

# Create a full portable backup of an account archive
contact-history.exe backup <account-uuid> C:\Backups\account.contacthistory

# Restore a .contacthistory archive into a new local account ID
contact-history.exe restore C:\Backups\account.contacthistory

# Export a specific capture sequence to CSV or vCard
contact-history.exe export <account-uuid> <sequence> csv C:\Backups\contacts.csv
contact-history.exe export <account-uuid> <sequence> vcf C:\Backups\contacts.vcf

# Import synthetic fixture files for offline testing
bun run native import-fixture tests\fixtures\capture-1.json fixture-demo demo@example.test
bun run native import-fixture tests\fixtures\capture-2.json fixture-demo demo@example.test
```

---

## Storage & Security Architecture

| Item | Location / Implementation | Description |
| :--- | :--- | :--- |
| **Account Metadata** | `%APPDATA%\ContactHistory\accounts.json` | Non-sensitive account list and display profiles |
| **Account Databases** | `%APPDATA%\ContactHistory\accounts\<UUID>\archive.db` | Independent SQLite database per account |
| **Media Cache** | `%APPDATA%\ContactHistory\accounts\<UUID>\media\` | Cached contact photo bytes with SHA-256 file keys |
| **OAuth Credentials** | Windows Credential Manager (`keyring`) | Client secret and refresh tokens encrypted by Windows DPAPI |
| **Task Schedule** | Windows Task Scheduler (`schtasks`) | Per-user background trigger for headless sync |

---

## Disclaimers & Legal Notice

### Google LLC Trademark & Service Disclaimer
> [!NOTE]
> **Contact History is an independent open-source project and is NOT affiliated with, sponsored by, authorized by, or endorsed by Google LLC or Alphabet Inc.**
> "Google", "Google Contacts", "Google Cloud", and related trademarks and logos are the property of Google LLC. All API usage adheres to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy).

### Data Privacy & Security Notice
> [!IMPORTANT]
> - All contact data, snapshots, profile photos, and credentials reside **exclusively on your local machine**.
> - The application does **NOT** transmit telemetry, error reports, or contact records to any third-party server or developer endpoint.
> - The application operates strictly with **read-only** Google API permissions (`contacts.readonly`). It does not have technical permission to create, edit, or delete contacts in your Google account.
> - Users are solely responsible for protecting their local backup files (`.contacthistory`) and safeguarding their device access.

---

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0).
