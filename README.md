# Deckify

A local-first application built with React, Vite, and Electron that allows users to manage projects and tasks, and export professional PDF presentations of their task roadmaps.

## Architecture & Tech Stack
-   **Frontend Framework**: React (Vite)
-   **Styling**: Tailwind CSS, shadcn/ui components
-   **Desktop Wrapper**: Electron.js
-   **Storage**: Local-First via IndexedDB (Dexie.js). Designed with a Data Access Layer to easily migrate to PostgreSQL later.
-   **PDF Generation**: `@react-pdf/renderer` for declarative, vector-based PDF generation directly in the browser/app.

## Features
- **Sidebar Navigation**: Quickly switch between the Dashboard, Projects List, and Settings.
- **Overview Dashboard**: View high-level statistics of your total projects, task counts, and average completion rate.
- **Project Management**: Create and delete workspaces (projects).
- **Task Tracking**:
  - Add tasks via a dedicated modal interface with title, description, start date, and duration.
  - **Dual Views**: Toggle seamlessly between a tabular 'List' view (with built-in pagination) and a beautiful interactive 'Roadmap' timeline view.
  - Dynamically update real-time progress using interactive sliders from the list.
  - Comprehensive task editing via a dedicated, spacious sub-page for easier text entry.
- **Automated PDF Export**:
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
To create a production-ready application bundle (`.dmg` for Mac or `.exe` for Windows):
```bash
npm run electron:build
```

The output file will be generated in the `release/` directory.

---
*Note: Any new features or architectural changes to this project must be reflected in this README.*
