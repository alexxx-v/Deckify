# Flexible PDF Export Design

## Overview
This document outlines the design for the new "Flexible PDF Export" feature in the Task-to-PDF app. The goal is to allow users to compose PDF reports from a set of customizable blocks, rather than relying on a single, hard-coded layout.

## 1. Data Architecture (Template Entity)
We will add a new `templates` table to the SQLite database.

**Table Schema (`templates`):**
*   `id`: string (UUID) - Primary Key
*   `name`: string - The name of the template
*   `createdAt`: number (Timestamp)
*   `updatedAt`: number (Timestamp)
*   `blocks`: string - A JSON-stringified array of block definitions.

**Block Definition Structure:**
A block definition in the `blocks` array will look like this:
```json
{
  "id": "unique-block-id",
  "type": "TITLE_PAGE", // Enum of available block types
  "props": {
    // Block-specific configuration options
    "showSubtitle": true,
    "customTitle": "Monthly Review"
  }
}
```

## 2. Template Builder UI
A new dedicated section will be created for managing templates.

*   **Route:** `/settings/templates` (or accessible via a new sidebar item "Templates").
*   **Interface Layout:**
    *   **Left Panel (Block Library):** A list of available block types that can be dragged or clicked to add to the current template (e.g., Cover Page, Statistics, Task Details, Roadmap, Custom Text).
    *   **Center Area (Canvas):** A vertical list representing the current template's layout. Users can drag and drop blocks to reorder them or click to delete them.
    *   **Right Panel (Properties):** When a block in the center canvas is selected, this panel displays the specific configuration options for that block (e.g., toggles for "Include description", "Include checklist steps", color themes, etc.).

## 3. Applying Templates (Export Flow)
The existing export flow will be modified to use these templates.

*   **Export Modal Updates (`ExportModal.tsx`):** Add a dropdown `<select>` component to let the user choose which template to apply. The default will be the first available template or a designated "Default" template.
*   **Data Fetching:** The process of gathering project and task data for the selected period remains the same.
*   **Dynamic Rendering:** Instead of rendering the `<ProjectPresentation />` component, which currently contains the hard-coded layout, we introduce a new `<DynamicPdfRenderer />` component.
*   **Renderer Logic:** The `<DynamicPdfRenderer />` receives the project data, filtered tasks, and the `blocks` JSON from the selected template. It iterates through the `blocks` array and renders the corresponding `@react-pdf/renderer` block components in the specified order, passing down the relevant data and block `props`.

## 4. Initial Block Types
The first iteration will modularize the existing hard-coded presentation into configurable blocks:

1.  **`TitleBlock` (Cover Page):** Project name and period.
2.  **`StatsBlock` (Statistics):** Number of completed tasks, tasks in progress, overall progress percentage.
3.  **`TasksListBlock` (Summary List):** A compact list of tasks with their current statuses.
4.  **`TaskDetailBlock` (Detailed Task Pages):** Detailed pages for tasks, optionally including dates, statuses, descriptions, and checklist steps (configurable via props).
5.  **`RoadmapBlock` (Gantt Chart):** The visual timeline of tasks.

These blocks will form the foundation, allowing users to choose exactly which sections they want in their final PDF report.
