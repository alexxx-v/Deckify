import { useState, useEffect } from 'react';

export interface Project {
    id: string; // UUID
    name: string;
    createdAt: number; // timestamp
}

export type TaskStatus = 'backlog' | 'progress' | 'hold' | 'done';

export interface Task {
    id: string; // UUID
    projectId: string; // Foreign key to Project
    title: string;
    description?: string; // Optional description
    startDate: string; // YYYY-MM-DD
    duration: number; // Duration in days
    progress: number; // 0-100
    status?: TaskStatus; // Enum for status
    steps?: string; // JSON string of steps
}

export interface TaskStep {
    id: string;
    text: string;
    completed: boolean;
}

const Database = typeof window !== 'undefined' && 'require' in (window as any) ? (window as any).require('better-sqlite3') : null;
let sqliteDb: any = null;

const listeners: Set<() => void> = new Set();
const notifySubscribers = () => {
    listeners.forEach(fn => fn());
};

export function initDb(dbPath: string): boolean {
    if (!Database) {
        console.error("SQLite not available. Check nodeIntegration.");
        return false;
    }

    try {
        sqliteDb = new Database(dbPath);

        // Create tables
        sqliteDb.exec(`
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT,
                createdAt INTEGER
            );
            
            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                projectId TEXT,
                title TEXT,
                description TEXT,
                startDate TEXT,
                duration INTEGER,
                progress INTEGER,
                status TEXT
            );
        `);

        // Migration: add steps column if it doesn't exist
        try {
            sqliteDb.exec(`ALTER TABLE tasks ADD COLUMN steps TEXT`);
        } catch (e) {
            // Ignore error if column already exists
        }

        notifySubscribers();
        return true;
    } catch (err) {
        console.error("Failed to init SQLite:", err);
        return false;
    }
}

// Mimic dexie-react-hooks
export function useLiveQuery<T>(querier: () => T, deps: any[] = []): T | undefined {
    const [state, setState] = useState<T | undefined>(() => {
        try { return querier(); } catch { return undefined; }
    });

    useEffect(() => {
        const handler = () => {
            try { setState(querier()); } catch (e) { /* ignore */ }
        };
        // Update immediately inside effect in case it changed
        handler();

        listeners.add(handler);
        return () => {
            listeners.delete(handler);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sqliteDb, ...deps]);

    return state;
}

// Dexie mock API wrappers
export const db = {
    projects: {
        toArray: () => {
            if (!sqliteDb) return [];
            return sqliteDb.prepare(`SELECT * FROM projects`).all();
        },
        orderBy: (field: string) => ({
            reverse: () => ({
                toArray: () => {
                    if (!sqliteDb) return [];
                    return sqliteDb.prepare(`SELECT * FROM projects ORDER BY ${field} DESC`).all();
                }
            })
        }),
        get: (id: string) => {
            if (!sqliteDb) return undefined;
            return sqliteDb.prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
        },
        add: async (p: Project) => {
            if (!sqliteDb) return;
            sqliteDb.prepare(`INSERT INTO projects (id, name, createdAt) VALUES (?, ?, ?)`).run(p.id, p.name, p.createdAt);
            notifySubscribers();
        },
        update: async (id: string, obj: Partial<Project>) => {
            if (!sqliteDb) return;
            const keys = Object.keys(obj);
            if (keys.length === 0) return;
            const setStr = keys.map(k => `${k} = ?`).join(', ');
            const values = keys.map(k => (obj as any)[k]);
            sqliteDb.prepare(`UPDATE projects SET ${setStr} WHERE id = ?`).run(...values, id);
            notifySubscribers();
        },
        delete: async (id: string) => {
            if (!sqliteDb) return;
            sqliteDb.prepare(`DELETE FROM projects WHERE id = ?`).run(id);
            notifySubscribers();
        }
    },
    tasks: {
        toArray: () => {
            if (!sqliteDb) return [];
            return sqliteDb.prepare(`SELECT * FROM tasks`).all();
        },
        get: (id: string) => {
            if (!sqliteDb) return undefined;
            return sqliteDb.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id);
        },
        add: async (t: Task) => {
            if (!sqliteDb) return;
            sqliteDb.prepare(`
                INSERT INTO tasks (id, projectId, title, description, startDate, duration, progress, status, steps)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(t.id, t.projectId, t.title, t.description || '', t.startDate, t.duration, t.progress, t.status || 'backlog', t.steps || '[]');
            notifySubscribers();
        },
        update: async (id: string, obj: Partial<Task>) => {
            if (!sqliteDb) return;
            const keys = Object.keys(obj);
            if (keys.length === 0) return;
            const setStr = keys.map(k => `${k} = ?`).join(', ');
            const values = keys.map(k => (obj as any)[k]);
            sqliteDb.prepare(`UPDATE tasks SET ${setStr} WHERE id = ?`).run(...values, id);
            notifySubscribers();
        },
        delete: async (id: string) => {
            if (!sqliteDb) return;
            sqliteDb.prepare(`DELETE FROM tasks WHERE id = ?`).run(id);
            notifySubscribers();
        },
        where: (field: string) => ({
            equals: (val: string) => ({
                toArray: async () => {
                    if (!sqliteDb) return [];
                    return sqliteDb.prepare(`SELECT * FROM tasks WHERE ${field} = ?`).all(val);
                },
                sortBy: (sortField: string) => {
                    if (!sqliteDb) return [];
                    return sqliteDb.prepare(`SELECT * FROM tasks WHERE ${field} = ? ORDER BY ${sortField} ASC`).all(val);
                }
            })
        }),
        bulkDelete: async (ids: string[]) => {
            if (!sqliteDb || ids.length === 0) return;
            const placeholders = ids.map(() => '?').join(',');
            sqliteDb.prepare(`DELETE FROM tasks WHERE id IN (${placeholders})`).run(...ids);
            notifySubscribers();
        }
    }
};
