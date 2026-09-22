# Code organization

## Frontend boundaries

- `src/App.svelte` composes the application shell, active page, and dialogs.
- `src/app/views/` contains feature views. `ContactRow.svelte` is shared by favourite and regular contacts. `ContactDetail`, `ContactFields`, and `ContactHistory` divide the detail view by responsibility.
- `src/app/model.svelte.ts` owns one window's reactive state and binds feature actions. Construct it during component initialization; its lifecycle belongs to that component. There is no global singleton or copy of the state in each view.
- `src/app/actions/` contains feature operations: accounts, contacts, navigation, search, columns, downloads, photos, printing, and preferences. Each action declares the subset of the model it uses with `Pick<AppModel, ...>`. Pure helpers have no model dependency. Imports of the model in actions are type-only, so they do not introduce runtime import cycles.
- `src/app/selectors.ts` contains derived queries. Model `$derived` properties invoke them, so filtering and sorting remain reactive across views.
- `src/app/context-menu/` contains ordered menu builders. The first matching context handles the event; input, contact, detail, snapshot, change, and label actions are independently editable.
- `src/app/lifecycle.ts` owns window events and initial loading. It releases pending subscriptions, drag handlers, and notification timers when the app unmounts.
- `src/app/layout.ts` defines column metadata, defaults, sidebar constraints, storage keys, and validation. `configuration.ts` contains static UI choices. Account, contact, group, and snapshot data comes from the IPC layer, not from these configuration files.
- `src/lib/` holds reusable components, formatting, diffing, export, preference, and storage utilities. Both single and bulk vCard downloads use the same exporter.

Views receive the reactive model explicitly. Use feature actions for operations involving multiple fields or IPC; keep temporary rendering and event details in the owning view. Do not duplicate state into a view, destructure mutable model properties into nonreactive variables, or add unrelated workflows to the root component.

## Styles

`src/style.css` is an ordered import manifest for `src/styles/`. These remain global styles to preserve existing selectors and the cascade. Change a rule in its owning feature file; retain manifest order unless intentionally changing precedence. Shared colors and typography belong in `base.css` and the theme files.

## Backend capture modules

`src-tauri/src/core/capture.rs` coordinates capture and publication. Its submodules separate snapshot/contact queries (`queries.rs`), history/comparison queries (`history.rs`), label classification (`groups.rs`), and capture regression tests (`tests.rs`). Existing callers use the same public `capture::...` functions through re-exports.

Group classification uses explicit `groupType` metadata, with resource-ID fallback for older archives. Display names are user data and must never determine whether a group is hidden. The frontend consumes the filtered backend result without applying another name-based heuristic.

## Validation

Run all commands from the repository root using Bun:

```powershell
bun run check
bun run test
bun run test:rust
bun run build
```

`bun run format` uses Prettier with the Svelte plugin. Tests cover search/filter behavior, layout validation, single/bulk export consistency, date formatting, and backend group classification in addition to the existing archive tests.

For an isolated browser smoke check, run `bun run dev` and open `http://localhost:1420/tests/browser/index.html`. This test-only entry point mocks Tauri IPC using synthetic contacts. Verify selection, print scope, contact details/history, label filtering, settings, and the changes page. It does not access real accounts, archives, or credentials, and is not included in the production entry point. Native dialogs, printing, OAuth, and real photo downloads still require desktop testing.

## Further maintenance

The refactor does not make the entire repository debt-free. Large archives still render without virtualization, and several older payload parsers use permissive `any` casts. These are separate behavior-sensitive changes: introduce shared validated payload types and benchmark representative archives before changing them. Avoid arbitrary file-size limits; split by responsibility and keep shared behavior covered by tests.
