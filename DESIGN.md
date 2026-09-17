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

- **Body & Headings**: Bundled Inter Variable (400–700) for consistent, offline typography.
- **Icons**: Material Symbols Outlined (`opsz 20..48, wght 100..700, FILL 0..1`), rendered via standard `<span class="material-symbols-outlined">`.

## Window & Navigation Layout

1. **Integrated Frameless Topbar**:
   - Window decorations disabled in `tauri.conf.json`.
   - `data-tauri-drag-region` on the topbar allows native window dragging and double-click maximize/restore.
   - Integrated window controls use matched 16px stroke icons and full-height 46px hit areas; close uses red hover.
   - Centered pill search bar (`#f1f3f4`, 48px height, 720px max width).
   - Snapshot picker chip opens an anchored menu with date, count, and selected state.
   - Profile picture opens the Google-style account switcher; account management stays in Settings.

2. **Sidebar**:
   - 256px wide fixed sidebar with "+ Capture now" elevated pill button.
   - Contacts total count item, Changes diff item, Archive management.
   - **Labels Section**: Displays populated, distinct contact groups with live counts. Clicking a label filters the contact list and highlights with an active pill (`#c2e7ff`). Empty and system groups stay out of navigation.

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

6. **Interaction Finish**:
   - Shared hover, pressed, focus, and disabled states across primary controls.
   - Menus dismiss on outside click or Escape; reduced-motion preference disables decorative transitions.
   - Search waits briefly during typing and ignores out-of-order responses.
