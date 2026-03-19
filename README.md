# Deckify

A local-first application built with React, Vite, and Electron that allows users to manage projects and tasks, and export professional PDF presentations of their task roadmaps.

## Architecture & Tech Stack
-   **Frontend Framework**: React (Vite)
-   **Styling**: Tailwind CSS, shadcn/ui components
-   **Desktop Wrapper**: Electron.js
-   **Storage**: Local-First via IndexedDB (Dexie.js). Designed with a Data Access Layer to easily migrate to PostgreSQL later.
-   **Rich Text Editor**: Tiptap (ProseMirror-based), with a custom toolbar. Task descriptions are stored as HTML.
-   **PDF Generation**: `@react-pdf/renderer` for declarative, vector-based PDF generation directly in the browser/app.

## Features
- **Sidebar Navigation**: Quickly switch between the Dashboard, Projects List, and Settings.
- **Overview Dashboard**: View high-level statistics of your total projects, task counts, and average completion rate.
- **Project Management**: Create and delete workspaces (projects).
- **Task Tracking**:
  - Add tasks via a dedicated modal interface with title, description, start date, and duration.
  - **Dual Views**: Toggle seamlessly between a tabular 'List' view (with built-in pagination) and a beautiful interactive 'Roadmap' timeline view.
  - Dynamically update real-time progress using interactive sliders from the list.
  - Comprehensive task editing via a dedicated, full-width page featuring a two-column layout that separates the main content (description, steps) from metadata. The description field uses a Tiptap rich-text editor with a custom toolbar (headings, bold, italic, lists, task-list, blockquote, code). The editor auto-resizes to fit content with a minimum height of 256px. Descriptions are stored as HTML and rendered correctly in both the app and PDF exports.
- **Automated PDF Export**:
  - **Custom Export Templates**: Create and modify reusable PDF templates using a drag-and-drop block constructor natively within the app.
  - Generates presentations with a Title, Progress Overview stats.
  - **One Slide per Task**: Automatically renders each task on a separate slide containing its timeline, progress status, and detailed description.
  - **Roadmap Visualization**: Calculates the min and max dates of all tasks and renders a time-scaled visual roadmap.
- **Custom Branding**: App includes a beautiful, flat Material Design 3 icon designed and configured for macOS (`build/icon.png`).

## Running the Application

### Development
To run the application in development mode (opens native Electron window with Hot Module Replacement):
```bash
npm run electron:dev
```

### Production Build
To create a production-ready application bundle:

**Для Mac (.dmg):**
```bash
npm run electron:build
```

**Для Windows 64-bit (.exe):**
```bash
npm run electron:build -- --win --x64
```
*(Прим: electron-builder может собрать приложение для Windows прямо с вашего Mac, он автоматически скачает нужные `win32-x64` бинарники для SQLite и скомпилирует установщик).*

The output file will be generated in the `release/` directory.

---
*Note: Any new features or architectural changes to this project must be reflected in this README.*
