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

`electron/main.cjs` deliberately runs the window with `nodeIntegration: true, contextIsolation: false`, so the **renderer opens SQLite directly** via `window.require('better-sqlite3')`. There is no preload script and no IPC for data — IPC exists only for `get-user-data-path`, `open-folder`, update checks, and the AI assistant's `ai:*` channels (an allow-listed HTTP proxy to Ollama plus the API-key store; see below).

Consequences worth knowing before touching anything data-related:

- `db.*` is a **hand-written Dexie-shaped façade** over raw prepared statements (`db.projects`, `db.tasks`, `db.templates`, `db.taskTypes`, `db.boards`, `db.boardTasks`). Only the method shapes actually used by the UI exist; `where().equals()` etc. are narrow stubs, not a general query builder. Mixed sync/async signatures are intentional (reads sync, writes `async`).
- Reactivity is a homemade `useLiveQuery` backed by a module-level `listeners` Set. **Every mutation must call `notifySubscribers()`** or the UI silently goes stale.
- `dbTransaction(fn)` / `dbRead(fn)` / `getDbPath()` (exported from `schema.ts`) give the AI action registry row-level access (`src/db/ops.ts`) in **one** transaction with **one** `notifySubscribers()`. The `db.*` façade is unchanged. **A schema change (new column or table) must also update `TABLE_COLUMNS` in `src/db/ops.ts`** — `assertSchema()` throws when a listed column is missing or a table is unlisted, so cascades and undo cannot silently miss data; an *extra* column the real database has on a listed table (e.g. added by another build) is tolerated and carried through snapshots and undo untouched.
- Migrations run in `initDb()` against `PRAGMA user_version` (currently at 2). Add a new `if (dbVersion < N) { ...; sqliteDb.exec('PRAGMA user_version = N') }` block; never edit an existing one. `CREATE TABLE IF NOT EXISTS` at the top covers fresh installs, so new tables/columns need to be added in *both* places.
- Outside Electron (`npm run dev`), `Database` is `null` and every accessor returns empty — the UI renders but stays blank.
- The DB path lives in `localStorage['sqliteDataPath']`, chosen by the user on first launch (App.tsx setup screen). View preferences use `deckify_*` localStorage keys (AI connection settings: `deckify_ai_*`; the Ollama Cloud API key is **never** in localStorage).

### Second DB consumer: `mcp/src/index.ts`

The MCP server is an independent stdio server (own `package.json`, own TypeScript config, own `better-sqlite3` copy, with a `bun:sqlite` branch for Bun hosts) that opens **the same `.db` file** — path from `DECKIFY_DB_PATH` or an OS-default probe. It re-declares its own `CREATE TABLE` statements. **Any schema change must be mirrored in both `src/db/schema.ts` and `mcp/src/index.ts`**, and `mcp/dist/` must be rebuilt (it is committed). Tool list and client config live in README.md.

### Navigation

No router. `App.tsx` holds `activeTab` plus `selectedProjectId` / `editingTaskId` / `selectedBoardId` / `selectedProjectSettingsId`, and the render is one ordered ternary chain — detail views win over tabs by position in that chain. Feature code lives in `src/features/{projects,boards,dashboard,pdf,settings,ai}/`; `src/components/ui/` is generated shadcn/ui.

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

### AI assistant (`src/features/ai/`, `electron/ai-bridge.cjs`)

Connection layer for the Ollama-based assistant (design: `.claude/PRPs/prds/ai-task-assistant.prd.md`, model findings: `docs/plans/2026-10-13-ai-assistant-spike-results.md`).

- All Ollama HTTP goes **through the main process** (`ai:request`, `ai:abort`): same path in dev and packaged builds, no CORS, and the Ollama Cloud key (`ai:key-*`, stored with `safeStorage` in `<userData>/ai-key.bin`) never reaches the renderer. The main process only allows `/api/tags`, `/api/version`, `/api/chat`; the cloud URL is a constant and the key is attached only to cloud chat requests.
- `createOllamaProvider(config, transport)` is transport-agnostic; the renderer uses `createIpcTransport()`. It only moves messages — a `format` schema is a decoding constraint the model never sees and Ollama Cloud does not enforce it, so callers must also put the schema in the prompt, parse with `extractJson`, and validate.
- `types.ts`, `ollamaUtils.ts`, `json.ts`, `ollamaProvider.ts` are exercised directly by Node (type stripping), so they import each other with explicit `.ts` extensions and `import type`, and use no enums or constructor parameter properties. Run `node scripts/ai-provider-check.mjs` after touching them or `electron/ai-bridge.cjs` (it fakes Electron for the bridge and also uses a live local Ollama / ollama.com when available). `scripts/ai-spike/` holds the model-evaluation harness.

**Action registry** (`src/features/ai/actions/`): `validatePlan` → `resolvePlan` (names → ids, tokens → dates, cascades expanded into row mutations, diff, preconditions; writes nothing) → `executePlan` (re-checks preconditions, applies in one transaction, writes the undo record after commit) → `undoLastPlan` (only the last plan; blocked if any touched row changed). `runtime.ts` wires it to the real app and the undo file `<db>.ai-undo.json`. Rules decided by the owner (2026-10-15): **create_task mirrors the "Add task" form** (planned layer only, `startDate ''`, `duration 0`); **shift/start/duration write the actual layer like a roadmap drag**, materialised from the effective values, planned stays as the baseline; `done` ⇒ progress 100. Read tools: `readTools.ts`. Model-facing wording and schemas: `specs.ts` (measured in the spike — change only with a spike re-run). Run `node scripts/ai-actions-check.mjs` after touching any of it or `src/db/ops.ts` (needs `cd mcp && npm install`: the root `better-sqlite3` is built for Electron and does not load in Node, so the suite uses `mcp/node_modules`).

**Assistant (agent + UI)**: `src/features/ai/agent/` — `prompt.ts` (the spike's measured system prompt verbatim + one refinement rule; **change it only together with a run of `scripts/ai-agent-live.mjs`**), `context.ts` (budgeted data block with an app-computed `просрочена` marker; descriptions are never sent), `agent.ts` (`runAgentTurn`: chat → `extractJson` → `resolvePlan`, one retry with the rejection text, expected failures returned as values), `conversationState.ts` (pure state + store; messages hold codes, not localized text), `session.ts` (side-effecting glue: `sendMessage`, `confirmPlan`, `undoLast`, `newDialog`, `setDataChangedHandler`). UI: `src/features/assistant/` (`AiAssistant.tsx` floating button + window, `PlanCard.tsx` diff and actions). Model replies are rendered by `Markdown.tsx` from `marked` tokens into React elements — never via `innerHTML` (the renderer has Node integration, so model/task-title HTML must stay inert text). Integration points in `App.tsx`: `<AiAssistant screen=… onDataChanged=…/>` (the `screen` object mirrors the render chain: task > project settings > board > project > tab), the `editorReload` counter in the `TaskEditView` key, and the notification offset (`bottom-24`, above the button). `TaskEditView` reports unsaved edits to `src/lib/editorState.ts`. **Why the editor is remounted after a plan**: the form fills its fields once and `Save` writes every field, so a stale form would silently revert the assistant's change. Views of entities a plan deleted are closed by `handleAiDataChanged` (otherwise they hang on "Loading…"). Checks: `node scripts/ai-agent-check.mjs` (fake model), `node scripts/ai-agent-live.mjs` (needs Ollama; the quality gate).

**Phase 5 additions** (boards, task types, data questions): nine more actions (`create/rename/delete_board`, `add_to_board`, `remove_from_board`, `create/update/delete_task_type`, `set_task_type`) plus an optional `taskType` on `create_task`; all in `specs.ts` (appended after the measured six — `ai-actions-check` asserts the spike's definitions are a byte-identical prefix), `validate.ts`, `resolve.ts`. References are an id or a case-insensitive exact name; a task type is visible to a task when it is global or scoped to its project (`type_scope` / `ambiguous_task_type` errors list ids). Board links are shown in the diff as a `board` change on the **task** item; cascades (links of a deleted board/task, scoped types of a deleted project, tasks that lost a deleted type) are summarised on the parent item (`DiffItem.cascade`) and are not counted in `Counts` (`countEntries` in `execute.ts`; `linked`/`unlinked` only for stand-alone link changes). A UNIQUE(boardId, taskId) race is reported as `stale`. **Data questions**: the plan JSON may carry `queries: [{tool, args}]` (never together with `actions`); `agent.ts` runs them through `runAiReadTool` (max 2 rounds × 3 queries, results capped at 6,000 characters, `queries.ts`), restates the user's request after the results (otherwise the model replays an old plan), and keeps only the final answer in the history. The context lists boards and task types **with ids**; board membership is deliberately not in it. Closing views: `DataChange.removedBoardIds` makes `App` close a deleted board's view. **Ids never reach the user**: the prompt says so, but the model still copies the context's id column in many list answers (≈40 % even with the rule), so `reply.ts` (`stripIds`) removes UUIDs from the displayed reply (history keeps the original; skipped when the user's text asks for an id). **Prompt rules that look harmless but are not**: a rule telling the model to "invent descriptions/steps" made it fabricate answers to data questions (removed); every prompt change must be re-run through `scripts/ai-agent-live.mjs` (original 10 + 12 board/type + 4 data cases + dialogue scenarios). The gate is stochastic (the cloud model drifts day to day), so judge a failure by repeating it (`--runs 12 --cases id`), not by a single run.

### i18n

`react-i18next` with `src/locales/{en,ru}.json`, language in `localStorage['deckify_language']`, dayjs locale kept in sync via the `languageChanged` hook. Both locale files must be updated together. Existing code often passes a Russian string as the `t()` default — follow the surrounding file.

## Release workflow

Commits must follow Conventional Commits — `standard-version` derives the version and CHANGELOG from them. Full flow in `RELEASE_INSTRUCTIONS.md` (Russian): merge to `main` → `npm run release` → `git push --follow-tags`. Pushing a `v*` tag triggers `.github/workflows/release.yml`, which builds macOS/Windows installers and publishes a GitHub Release that `electron-updater` clients pick up. Do **not** run `npm run release` for `docs:`/`chore:` changes — plain push is enough.

## Repo conventions

- `GEMINI.md` (untracked, agent-facing) requires updating `README.md` whenever features, architecture, or configuration change.
- `.agent/` and `.agents/` are a gitignored third-party agent toolkit, not project rules.
- Design notes for larger features live in `docs/plans/`.
