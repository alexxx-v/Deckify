# 📊 Deckify

**Deckify** is a cross-platform, local-first application built with React, Vite, and Electron. It enables users to efficiently manage projects and tasks, and export professional PDF presentations featuring interactive roadmaps.

---

## 📥 Download

Download the latest release of Deckify for your operating system:

*   🍎 **macOS**
    *   [Apple Silicon (M1/M2/M3) — Deckify-1.0.0-arm64.dmg](./release/Deckify-1.0.0-arm64.dmg)
    *   [Intel — Deckify-1.0.0.dmg](./release/Deckify-1.0.0.dmg)
*   🪟 **Windows**
    *   [Windows 64-bit — Deckify Setup 1.0.0.exe](./release/Deckify%20Setup%201.0.0.exe)

---

## 🚀 Overview

Deckify is designed to simplify planning and reporting for teams and individual professionals:
1.  **Project & Task Management**: Manage your workspaces (projects), and add tasks with detailed descriptions, start dates, durations, and statuses.
2.  **Interactive Views**: Seamlessly switch between a classic paginated list view and a visual, interactive roadmap timeline.
3.  **Progress Tracking**: Adjust task completion progress instantly using sliders. Marking a task as `Done` automatically locks the progress at 100%.
4.  **Powerful Rich Text Editor**: Write detailed task descriptions using the integrated Tiptap editor. Features include headings, lists, blockquotes, code blocks with syntax highlighting, and rich text formatting.
5.  **Built-in PDF Generator**: Turn your task lists into professional PDF reports with a single click. Use the built-in template block constructor (TEXT, flowcharts, statistics) to fully customize your exports.

All data is stored entirely locally on your device using **SQLite** (via `better-sqlite3`), guaranteeing absolute privacy and a seamless offline experience. You can choose any local `.db` file in the Settings to manage multiple workspaces.

---

## 🛠 Architecture & Tech Stack
-   **Frontend Framework**: React (Vite)
-   **Styling**: Tailwind CSS, shadcn/ui components
-   **Desktop Wrapper**: Electron.js
-   **Storage**: Local-First via **SQLite** (`better-sqlite3`). Designed with a flexible Data Access Layer that supports custom database paths.
-   **Rich Text Editor**: Tiptap (ProseMirror-based), with a custom toolbar. Used in both task description editing and in PDF template TEXT blocks. Content is stored as HTML.
-   **PDF Generation**: `@react-pdf/renderer` for declarative, vector-based PDF generation directly in the browser/app.

## ✨ Features
- **Sidebar Navigation**: Quickly switch between the Dashboard, Projects List, and Settings.
- **Overview Dashboard**: View high-level statistics of your total projects, task counts, and average completion rate.
- **Project Management**: Create and delete workspaces (projects). Deleting a project also removes all its tasks; a confirmation prompt is shown before deletion.
- **Task Tracking**:
  - Add tasks via a dedicated modal interface with title, description, start date, and duration.
  - Delete tasks safely via a confirmation prompt within the task edit view.
  - **Dual Views**: Toggle seamlessly between a tabular 'List' view (with built-in pagination) and a beautiful interactive 'Roadmap' timeline view.
  - **Task Sorting & Grouping**: Dynamically sort tasks within lists and roadmap arrays by Start Date (default), Status, or Duration. Sorting preferences, view modes (List/Roadmap), chosen timeframes, and selected reference dates are persistently stored in local storage for a consistent experience across sessions. Users can also enable "Group by Type" to organize tasks into visual swimlanes based on their assigned task type.

  - **Custom Task Types**: Create and manage project-specific task types (e.g., 'Development', 'Design', 'Meeting') via the Project Settings page. Each type can have a unique name and color. Deleting a task type resets the type of all associated tasks to "None".
  - Dynamically update real-time progress using interactive sliders from the list. Setting a task's status to 'Done' automatically locks its progress at 100%.
  - Comprehensive task editing via a dedicated, full-width page featuring a two-column layout that separates the main content (description, steps) from metadata. The description field uses a Tiptap rich-text editor with a custom toolbar (headings, bold, italic, lists, task-list, blockquote, code). The editor auto-resizes to fit content with a minimum height of 256px. Descriptions are stored as HTML and rendered correctly in both the app and PDF exports.
- **Automated PDF Export**:
  - **Custom Export Templates**: Create and modify reusable PDF templates using a block constructor natively within the app. TEXT blocks use the Tiptap rich-text editor (same as task descriptions); content is stored as HTML and rendered in the final PDF.
  - Generates presentations with a Title, Progress Overview stats, and clean Task List slides.
  - **One Slide per Task**: Automatically renders each task on a separate slide containing its timeline, progress status, task type (if assigned), and detailed description.
  - **Robust PDF Engine**: Highly resilient PDF rendering architecture that handles complex HTML formatting, diverse Unicode characters (including full Cyrillic support), and protects against layout crashes from missing or invalid date/duration metadata via automatic sanitization.
  - **Team Focus**: New template block summarizing project tasks by their assigned type. Displays a clear table with task count, total duration, and percentage of total project time for each type (rounded to two decimal places), accompanied by a donut chart visualization.
  - **Roadmap Visualization**: Calculates the min and max dates of all tasks and renders a time-scaled visual roadmap. Dynamically adds a period label (e.g., 'Май 2026', 'Q1 2026', 'Год 2026-2027') to the Roadmap slide title based on the timeframe. Users can choose to render the roadmap based on the export window ('Текущий (по экспорту)'), the actual real-world current time ('Текущий'), or explicitly define custom absolute periods (specific month, quarter, or year) within the template block properties. Features full support for multi-line task titles and an optional "Group by Task Type" mode to organize the timeline into swimlanes.
- **Custom Branding**: App includes a beautiful, flat Material Design 3 icon designed and configured for macOS (`build/icon.png`).

---

## 💻 Running the Application

### Development
To run the application in development mode (opens native Electron window with Hot Module Replacement):
```bash
npm run electron:dev
```

### Production Build
To create a production-ready application bundle:

**For macOS (.dmg):**
```bash
npm run electron:build
```

**For Windows 64-bit (.exe):**
```bash
npm run electron:build -- --win --x64
```
*(Note: electron-builder can compile the Windows application directly from your Mac. It will automatically download the required `win32-x64` binaries for SQLite and build the installer).*

The output file will be generated in the `release/` directory.

---
*Note: Any new features or architectural changes to this project must be reflected in this README.*
