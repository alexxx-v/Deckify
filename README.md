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
- **📈 Interactive Roadmaps**: Switch seamlessly between a classic datagrid task list and a full visual, interactive roadmap timeline.
- **📝 Rich-Text Editing**: Tiptap-powered editor for detailed task descriptions supporting headings, tables, code blocks, and lists.
- **📋 Cross-Project Boards**: Combine tasks from multiple independent projects into unified boards for top-level reporting.
- **🖨️ PDF Template Builder**: Construct your own export templates using a visual block builder. Add 'Team Focus' charts, 'Roadmaps', and 'Task Detail' slides and export to PDF with one click.
- **🔄 OTA Auto-Updates**: Built-in `electron-updater` delivers silent updates pulled directly from GitHub Releases.

---

## ⚙️ Configuration & Storage

Deckify uses an internal SQLite engine (`better-sqlite3`). On the first launch, you will be prompted to select a path where the `.db` file will securely reside.

| Configuration | Description | Default Path |
|---------------|-------------|--------------|
| **Database Path** | Location for the private database. Can be changed inside User Settings. | `[UserData]/deckify.db` |
| **Language**  | App interface language (English/Russian). | `en` |

*Note: Database schema migrations happen automatically on startup via SQLite `PRAGMA user_version` migrations.*

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
