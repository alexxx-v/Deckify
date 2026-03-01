import Dexie, { type EntityTable } from 'dexie';

export interface Project {
    id: string; // UUID
    name: string;
    createdAt: number; // timestamp
}

export interface Task {
    id: string; // UUID
    projectId: string; // Foreign key to Project
    title: string;
    description?: string; // Optional description
    startDate: string; // YYYY-MM-DD
    duration: number; // Duration in days
    progress: number; // 0-100
}

export const db = new Dexie('TaskToPdfDatabase') as Dexie & {
    projects: EntityTable<Project, 'id'>;
    tasks: EntityTable<Task, 'id'>;
};

// Schema declaration
db.version(1).stores({
    projects: 'id, createdAt', // Primary key and indexed props
    tasks: 'id, projectId, startDate' // Primary key and indexed props
});
