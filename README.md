# 📊 Deckify

> A cross-platform, local-first React + Electron application for managing projects, tracking tasks, and auto-generating interactive PDF presentations.

Deckify helps individual professionals and teams seamlessly plan their projects, track task progression, and export customizable PDF reports without ever sending their private data to the cloud.

---

## 🚀 Quick Start

Ensure you have Node.js 20+ installed.

```bash
# 1. Clone the repository
git clone <repository-url>
cd deckify

# 2. Install dependencies
npm install

# 3. Start development server (with Electron HMR)
npm run electron:dev
```

### Build for Production

```bash
# Build macOS .dmg
npm run electron:build

# Build Windows .exe
npm run electron:build -- --win --x64
```
Compiled artifacts will be available in the `release/` folder. Alternatively, download the latest pre-compiled executable from our [Releases page](../../releases).

---

## ✨ Features

- **🔒 Local-First Storage**: 100% offline. All your data is saved locally on your device via SQLite. You own your data.
- **📅 Plan vs. Actual Tracking**: Track both your estimated schedule and real execution timelines independently. Visualize deviations directly on the dual-layer roadmap.
- **📈 Interactive Roadmaps**: Switch seamlessly between a classic datagrid task list and a full visual, interactive roadmap timeline.
- **📝 Rich-Text Editing**: Tiptap-powered editor for detailed task descriptions supporting headings, tables, code blocks, and lists.
- **📋 Cross-Project Boards**: Combine tasks from multiple independent projects into unified boards for top-level reporting.
- **🖨️ PDF Template Builder**: Construct your own export templates using a visual block builder. Add 'Team Focus' charts, 'Roadmaps', and 'Task Detail' slides and export to PDF with one click.
- **🤖 AI Assistant Connection (Ollama)**: Connect a local Ollama server or Ollama Cloud, pick a model and test the connection from Settings. The API key is stored encrypted via the OS keychain.
- **🔄 OTA Auto-Updates**: Built-in `electron-updater` delivers silent updates pulled directly from GitHub Releases.

---

## ⚙️ Configuration & Storage

Deckify uses an internal SQLite engine (`better-sqlite3`). On the first launch, you will be prompted to select a path where the `.db` file will securely reside.

| Configuration | Description | Default Path |
|---------------|-------------|--------------|
| **Database Path** | Location for the private database. Can be changed inside User Settings. | `[UserData]/deckify.db` |
| **Language**  | App interface language (English/Russian). | `en` |
| **AI connection** | How the AI assistant reaches Ollama: a local server or Ollama Cloud (API key). Set in Settings → AI assistant. | Local, `http://localhost:11434` |
| **AI model** | Model used by the assistant, remembered separately for each connection mode. | none selected |

*Note: Database schema migrations happen automatically on startup via SQLite `PRAGMA user_version` migrations.*

### AI assistant (Ollama)

Settings → **AI assistant** connects Deckify to [Ollama](https://ollama.com). The chat assistant described below is built on top of it.

- **Local Ollama** — a server on your machine (default `http://localhost:11434`). Cloud models such as `gpt-oss:120b-cloud` also work through it after running `ollama signin` in a terminal.
- **Ollama Cloud** — talks to `https://ollama.com` directly with an API key from [ollama.com/settings/keys](https://ollama.com/settings/keys). Model names have no `-cloud` suffix here (`gpt-oss:120b`), so the chosen model is remembered per mode.
- **API key storage** — the key is kept by the app's main process, encrypted with the OS keychain (Electron `safeStorage`), and is never kept in `localStorage` or sent to the UI. If the system has no secure storage (for example Linux without a keyring) the key is held in memory until the app is closed, and Settings says so. On macOS the app is unsigned, so after an update the Keychain may ask again or the saved key may need to be re-entered. Note that the app window runs with Node integration, so this protects the key from accidental exposure, not from malicious code running inside the app.
- **Model size warning** — models under 20B parameters are marked with ⚠ and produce a warning: in our tests (`docs/plans/2026-10-13-ai-assistant-spike-results.md`) plans from 3–5B models were wrong in roughly 30–60% of requests, while 31B+ models were reliable.
- **Test connection** — checks the server (and its version; structured output needs Ollama 0.5.0 or newer), lists models and confirms the selected one exists. It does not send a prompt, so for Ollama Cloud a wrong API key is only reported on the first real request.
- **Safe edits** — the assistant never writes to the database directly. A model plan is validated, names and relative dates are resolved by the app, and the result is shown as a before → after preview. Confirmed plans run in a single transaction (all or nothing, one screen refresh) and the **last plan can be undone, even after a restart**. Undo is blocked if you edited any of the affected rows afterwards, and a plan is rejected if the data changed between preview and confirmation. The undo state is stored in `<database file>.ai-undo.json` next to your database. New tasks look like tasks created with the “Add task” form (planned dates only); moving tasks changes the actual dates, like dragging them on the roadmap.
- **Using the assistant** — the round ✦ button in the bottom-right corner opens the chat on any screen. Describe what you want (“создай задачу «Подготовить отчёт» в этом проекте, старт сегодня, срок 5 дней”, “сдвинь все задачи в работе на неделю”, “что просрочено?”). The assistant knows which project, task or board is open. It answers with a **plan**; nothing changes until you press **Apply**. Say what to adjust (“нет, срок 10 дней”) and it replaces the pending plan. **Undo** (on the plan card or in the window header) reverts the last applied plan. The conversation lives until you press “New dialog” or close the app. If the task you are editing is affected, its form is reloaded; if it has unsaved edits you are asked first.
- **Privacy** — with Ollama Cloud, your messages and the task data they include are sent to ollama.com. With a local server nothing leaves your machine (except through cloud models you chose to run via `ollama signin`).

---

## 🤖 Model Context Protocol (MCP) Server

Deckify comes with a built-in, autonomous MCP Server. This allows AI clients (like Qwen Desktop, Claude Desktop, Cursor, or Antigravity) to connect to your local Deckify installation and manage your projects, tasks, and boards.

### Setup and Build

Before using the MCP server, you must install its dependencies and compile the TypeScript source code:

```bash
cd mcp
npm install
npm run build
```

### Integration Configuration

Add the following configuration to your AI client's MCP settings file (e.g., `claude_desktop_config.json` or Qwen Desktop settings):

```json
{
  "mcpServers": {
    "deckify": {
      "command": "npx",
      "args": [
        "-y",
        "node",
        "/Users/alexvdovin/Documents/_WORK/app/task_to_pdf/mcp/dist/index.js"
      ],
      "env": {
        "PATH": "/Users/alexvdovin/local/nodejs/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
        "DECKIFY_DB_PATH": "/Users/alexvdovin/Library/Application Support/deckify/deckify.db"
      }
    }
  }
}
```

*Note: Qwen Desktop translates `npx` into `bun x`, which does not support running local directories directly. To bypass this, we configure it to execute `node` and pass the path to the compiled `dist/index.js`.*
*Note: Make sure your `PATH` points to the directory containing the node executable you used to compile the project (e.g. `/Users/alexvdovin/local/nodejs/bin`), and `DECKIFY_DB_PATH` points to your actual database path.*
*Note: If the `DECKIFY_DB_PATH` environment variable is not defined, the server will automatically attempt to find the database in your operating system's default user data path (e.g., `~/Library/Application Support/Deckify/deckify.db` on macOS).*

### Exposed AI Tools

The server registers the following tools with the connected AI agent:

- `list_projects`: List all current projects.
- `create_project`: Create a new project (takes `name`).
- `list_tasks`: List tasks, optionally filtered by `projectId` and `status`.
- `get_task`: Get a specific task by its UUID (takes `id`).
- `create_task`: Create a new task in a project (takes `projectId`, `title`, `startDate`, `duration`, `description`, etc.).
- `update_task`: Modify any parameter of an existing task (takes `id`).
- `delete_task`: Delete a task by UUID.
- `list_task_types`: Get available task categories / color labels.
- `create_task_type`: Create a new color label / category.
- `list_boards`: List Kanban boards.
- `create_board`: Create a new board.
- `add_task_to_board`: Link a task to a board.
- `remove_task_from_board`: Unlink a task from a board.

---

## 📚 Documentation

For deeper dives into the project setup and deployment mechanics, check the following docs:

- [Release & CI/CD Workflow](./RELEASE_INSTRUCTIONS.md) - Details on Semantic Versioning, GitHub Actions, and auto-updates.

---

## 🛠 Architecture & Tech Stack

- **Frontend:** React 19, Vite, TailwindCSS v4, shadcn/ui components
- **Desktop Wrapper:** Electron.js
- **Database:** SQLite (`better-sqlite3`) wrapped in real-time React hooks
- **PDF Engine:** `@react-pdf/renderer`
- **Release Pipeline:** `standard-version` + GitHub Actions

---

## 🤝 Contributing

We welcome outside contributions! To maintain a stable release cycle, please adhere to our contributing protocol:

1. Fork the repository.
2. Create your feature branch (`git checkout -b feature/amazing-feature`).
3. Commit your changes using [Conventional Commits](https://www.conventionalcommits.org/):
   - Example: `feat: add dark mode support`
   - Example: `fix: resolve sidebar rendering bug`
4. Push to the branch (`git push origin feature/amazing-feature`).
5. Open a Pull Request.

> **Important**: Our automated release scripts depend on Conventional Commits to generate the `CHANGELOG.md` and bump the semantic version appropriately.

---

## 📄 License

This project is open-source and licensed under the [MIT License](LICENSE).
