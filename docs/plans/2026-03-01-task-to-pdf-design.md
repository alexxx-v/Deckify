# Task to PDF Generator Design

## Overview
A web application to manage projects and tasks, generating PDF presentations for reporting.

## Architecture & Tech Stack
-   **Frontend Framework**: React (Vite)
-   **Styling**: Tailwind CSS, shadcn/ui components
-   **Storage**: Local-First via IndexedDB (Dexie.js). Designed with a Data Access Layer to easily migrate to PostgreSQL later.
-   **PDF Generation**: `@react-pdf/renderer` for declarative, vector-based PDF generation directly in the browser.

## Data Models
1.  **Project**
    -   `id`: string (UUID)
    -   `name`: string
    -   `createdAt`: timestamp

2.  **Task**
    -   `id`: string (UUID)
    -   `projectId`: string (Foreign Key)
    -   `title`: string
    -   `startDate`: date
    -   `duration`: string (e.g., "5 days") or number (hours/days)
    -   `progress`: number (0-100)

## Features & UI Flow
1.  **Dashboard / Project List**: Create/Select projects.
2.  **Project View (Task Management)**:
    -   Add new tasks (title, start date, duration, initial progress).
    -   Edit existing tasks (update progress).
3.  **Export Presentation**:
    -   Select period (Quarter or Month).
    -   Generate and download PDF.

## PDF Presentation Structure (Fixed Template)
-   **Slide 1**: Title (Service Name, Period: e.g., Q1 January).
-   **Slide 2**: Progress Overview (Overall % completion, tasks completed vs. in progress).
-   **Slide 3-N**: Task Details (One slide per task or grouped if many).
-   **Final Slide**: Roadmap (Visual timeline of tasks based on start date and duration).
