# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run electron:dev      # primary dev loop: Vite (5173) + Electron with HMR
npm run dev               # browser-only Vite; DB layer is inert here (see below)
npm run build             # tsc -b && vite build  — also the typecheck
npm run lint              # eslint .
npm run electron:build    # build + electron-builder → release/
npm run release           # standard-version: bumps version, writes CHANGELOG, tags

cd mcp && npm install && npm run build   # MCP server is a SEPARATE npm project (tsc → mcp/dist)
```

There is no test framework in this repo — no test runner, no test files. Verify changes by running the app.

`tsconfig.app.json` has `strict`, `noUnusedLocals`, `noUnusedParameters` on, so `npm run build` fails on unused imports/vars. `@/*` aliases `./src/*` (set in both `vite.config.ts` and tsconfig).

## Architecture

Local-first Electron app: React renderer ⇄ SQLite file on disk. No server, no network except PDF fonts and the GitHub updater.

### Database layer (`src/db/schema.ts`) — the load-bearing file

`electron/main.cjs` deliberately runs the window with `nodeIntegration: true, contextIsolation: false`, so the **renderer opens SQLite directly** via `window.require('better-sqlite3')`. There is no preload script and no IPC for data — IPC exists only for `get-user-data-path`, `open-folder`, and update checks.

Consequences worth knowing before touching anything data-related:

- `db.*` is a **hand-written Dexie-shaped façade** over raw prepared statements (`db.projects`, `db.tasks`, `db.templates`, `db.taskTypes`, `db.boards`, `db.boardTasks`). Only the method shapes actually used by the UI exist; `where().equals()` etc. are narrow stubs, not a general query builder. Mixed sync/async signatures are intentional (reads sync, writes `async`).
- Reactivity is a homemade `useLiveQuery` backed by a module-level `listeners` Set. **Every mutation must call `notifySubscribers()`** or the UI silently goes stale.
- Migrations run in `initDb()` against `PRAGMA user_version` (currently at 2). Add a new `if (dbVersion < N) { ...; sqliteDb.exec('PRAGMA user_version = N') }` block; never edit an existing one. `CREATE TABLE IF NOT EXISTS` at the top covers fresh installs, so new tables/columns need to be added in *both* places.
- Outside Electron (`npm run dev`), `Database` is `null` and every accessor returns empty — the UI renders but stays blank.
- The DB path lives in `localStorage['sqliteDataPath']`, chosen by the user on first launch (App.tsx setup screen). View preferences use `deckify_*` localStorage keys.

### Second DB consumer: `mcp/src/index.ts`

The MCP server is an independent stdio server (own `package.json`, own TypeScript config, own `better-sqlite3` copy, with a `bun:sqlite` branch for Bun hosts) that opens **the same `.db` file** — path from `DECKIFY_DB_PATH` or an OS-default probe. It re-declares its own `CREATE TABLE` statements. **Any schema change must be mirrored in both `src/db/schema.ts` and `mcp/src/index.ts`**, and `mcp/dist/` must be rebuilt (it is committed). Tool list and client config live in README.md.

### Navigation

No router. `App.tsx` holds `activeTab` plus `selectedProjectId` / `editingTaskId` / `selectedBoardId` / `selectedProjectSettingsId`, and the render is one ordered ternary chain — detail views win over tabs by position in that chain. Feature code lives in `src/features/{projects,boards,dashboard,pdf,settings}/`; `src/components/ui/` is generated shadcn/ui.

### PDF export pipeline

Templates are rows in `templates` whose `blocks` column is a **JSON string of `TemplateBlock[]`** (`{ id, type, props }`).

- `TemplatesView.tsx` — visual builder; `AVAILABLE_BLOCKS` defines the palette and each block type's default props.
- `DynamicPdfRenderer.tsx` — `BlockRenderer` switches on `block.type` and emits `@react-pdf/renderer` primitives; it also contains a hand-rolled HTML/Markdown → react-pdf converter (Tiptap descriptions are stored as HTML) and an SVG donut chart.
- `ProjectPresentation.tsx` — the older fixed layout, still used when no template is selected.
- `ExportModal.tsx` — picks period/template, gathers tasks, calls `pdf(...)`.

Adding a block type touches four places: the `TemplateBlockType` union in `src/db/schema.ts`, `AVAILABLE_BLOCKS`, the `BlockRenderer` switch, and both locale files.

`pdfFonts.ts` registers Roboto **from a CDN**, so PDF export (and Cyrillic glyphs) requires network access at export time.

### Tasks: planned vs actual

Every task carries two independent schedules — `startDate`/`duration` (actual) and `plannedStartDate`/`plannedDuration` (planned, backfilled by migration 2). The roadmap views draw both layers; keep them in sync when adding task-editing code. `steps` is a JSON string of `TaskStep[]`; `status` is `backlog | progress | hold | done`.

### i18n

`react-i18next` with `src/locales/{en,ru}.json`, language in `localStorage['deckify_language']`, dayjs locale kept in sync via the `languageChanged` hook. Both locale files must be updated together. Existing code often passes a Russian string as the `t()` default — follow the surrounding file.

## Release workflow

Commits must follow Conventional Commits — `standard-version` derives the version and CHANGELOG from them. Full flow in `RELEASE_INSTRUCTIONS.md` (Russian): merge to `main` → `npm run release` → `git push --follow-tags`. Pushing a `v*` tag triggers `.github/workflows/release.yml`, which builds macOS/Windows installers and publishes a GitHub Release that `electron-updater` clients pick up. Do **not** run `npm run release` for `docs:`/`chore:` changes — plain push is enough.

## Repo conventions

- `GEMINI.md` (untracked, agent-facing) requires updating `README.md` whenever features, architecture, or configuration change.
- `.agent/` and `.agents/` are a gitignored third-party agent toolkit, not project rules.
- Design notes for larger features live in `docs/plans/`.
