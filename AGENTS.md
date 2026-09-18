# Project Guidelines & Rules

## Package Manager and Runtime
- **Strictly use Bun** for this project.
- **NEVER** use npm, npx, yarn, or pnpm.
- All development, build, test, and dependency commands must use bun:
  - Run build: bun run build
  - Run dev server: bun run tauri dev
  - Install dependencies: bun install
  - Run scripts: bun run <script>
