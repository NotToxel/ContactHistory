# Google Contacts Visual System — Contact History

Contact History is styled as a pixel-faithful recreation of Google Contacts (contacts.google.com), while retaining local SQLite timeline snapshot archiving.

## Color Palette

| Role | Hex | Description |
| --- | --- | --- |
| Google Blue | `#1a73e8` | Primary actions, links, active icons |
| Blue Hover | `#1557b0` | Hover state for primary buttons |
| Blue Surface | `#e8f0fe` | Chip and hero action button backgrounds |
| Blue Pill (Active) | `#c2e7ff` | Active navigation pill in sidebar |
| Text Primary | `#202124` | Primary high-emphasis text |
| Text Secondary | `#5f6368` | Subtitles, labels, secondary info |
| Surface Background | `#f6f8fc` | Detail card backgrounds, search input |
| Border | `#dadce0` | Dividers, chip borders, table bottom borders |
| Danger | `#d93025` | Disconnect, cancel button hover, close button hover |

## Typography & Iconography

- **Body & Headings**: Inter (400, 500, 600, 700) matching Google Sans metrics and cleanliness.
- **Icons**: Material Symbols Outlined (`opsz 20..48, wght 100..700, FILL 0..1`), rendered via standard `<span class="material-symbols-outlined">`.

## Window & Navigation Layout

1. **Integrated Frameless Topbar**:
   - Window decorations disabled in `tauri.conf.json`.
   - `data-tauri-drag-region` on the topbar allows native window dragging and double-click maximize/restore.
   - Integrated native window controls (Minimize `─`, Maximize/Restore `□`, Close `✕`) on the far right of the topbar with red hover on close.
   - Centered pill search bar (`#f1f3f4`, 48px height, 720px max width).
   - Snapshot picker chip for traveling back in time.

2. **Sidebar**:
   - 256px wide fixed sidebar with "+ Capture now" elevated pill button.
   - Contacts total count item, Changes diff item, Archive management.
   - **Labels Section**: Displays contact groups with live counts (e.g. `360 (64)`). Clicking a label filters the contact list and highlights with an active pill (`#c2e7ff`), matching Google Contacts.

3. **Table Data Grid**:
   - Sticky table header with 48px row heights.
   - **Default Columns**: Name, Email, Phone number, Birthday, Labels.
   - **Draggable Column Resizers**: `.col-resizer` handle between headers allows drag-resizing with width persistence in `localStorage`.
   - **Column Customizer**: Menu to toggle columns (Name, Email, Phone, Birthday, Labels, Organization, Job title, Address, Notes).
   - Circular avatars with archived photo rendering and initials fallback.
   - Label pills with horizontal scrolling.

4. **Structured Contact Detail**:
   - Large circular 120px profile photo with display name and phonetic/nickname.
   - Circular quick-action buttons (Email, Schedule, Chat, Video).
   - Label membership chips.
   - Two-column cards: "Contact details" and "Archive History" timeline.

5. **Capture Performance & Cancellation**:
   - SQLite cache check avoids re-downloading existing profile photos over HTTP.
   - In-progress capture banner displays percentage and a prominent "Cancel" button.
