import { useState, useEffect } from 'react';

export interface Project {
    id: string; // UUID
    name: string;
    createdAt: number; // timestamp
}

export type TemplateBlockType = 'TITLE_PAGE' | 'STATS' | 'TASKS_LIST' | 'TASK_DETAIL' | 'ROADMAP' | 'TEXT' | 'TYPE_SUMMARY';

export interface TemplateBlock {
    id: string; // unique block id inside the template
    type: TemplateBlockType;
    props: Record<string, any>;
}

export interface ExportTemplate {
    id: string;
    name: string;
    blocks: string; // JSON string of TemplateBlock[]
    createdAt: number; // timestamp
    updatedAt: number; // timestamp
}

export type TaskStatus = 'backlog' | 'progress' | 'hold' | 'done';

export interface Task {
    id: string; // UUID
    projectId: string; // Foreign key to Project
    title: string;
    description?: string; // Optional description
    startDate: string; // YYYY-MM-DD
    duration: number; // Duration in days
    plannedStartDate?: string; // YYYY-MM-DD
    plannedDuration?: number; // Duration in days
    progress: number; // 0-100
    status?: TaskStatus; // Enum for status
    steps?: string; // JSON string of steps
    taskTypeId?: string; // Foreign key to TaskType
}

export interface TaskType {
    id: string;
    projectId?: string; // Optional for global types
    name: string;
    color: string;
}

export interface TaskStep {
    id: string;
    text: string;
    completed: boolean;
}

export interface Board {
    id: string;
    name: string;
    createdAt: number;
}

export interface BoardTask {
    id: string;
    boardId: string;
    taskId: string;
    addedAt: number;
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
                plannedStartDate TEXT,
                plannedDuration INTEGER,
                progress INTEGER,
                status TEXT
            );

            CREATE TABLE IF NOT EXISTS templates (
                id TEXT PRIMARY KEY,
                name TEXT,
                blocks TEXT,
                createdAt INTEGER,
                updatedAt INTEGER
            );

            CREATE TABLE IF NOT EXISTS boards (
                id TEXT PRIMARY KEY,
                name TEXT,
                createdAt INTEGER
            );

            CREATE TABLE IF NOT EXISTS board_tasks (
                id TEXT PRIMARY KEY,
                boardId TEXT,
                taskId TEXT,
                addedAt INTEGER,
                UNIQUE(boardId, taskId)
            );
        `);

        // Migrations using PRAGMA user_version
        const versionRow = sqliteDb.prepare('PRAGMA user_version').get();
        let dbVersion = versionRow ? versionRow.user_version : 0;

        if (dbVersion < 1) {
            try { sqliteDb.exec(`ALTER TABLE tasks ADD COLUMN steps TEXT`); } catch (e) { }
            try { sqliteDb.exec(`ALTER TABLE tasks ADD COLUMN taskTypeId TEXT`); } catch (e) { }
            sqliteDb.exec(`
                CREATE TABLE IF NOT EXISTS task_types (
                    id TEXT PRIMARY KEY,
                    projectId TEXT, -- Nullable for global types
                    name TEXT,
                    color TEXT
                );
            `);
            sqliteDb.exec('PRAGMA user_version = 1');
            dbVersion = 1;
        }

        if (dbVersion < 2) {
            try { sqliteDb.exec(`ALTER TABLE tasks ADD COLUMN plannedStartDate TEXT`); } catch (e) { }
            try { sqliteDb.exec(`ALTER TABLE tasks ADD COLUMN plannedDuration INTEGER`); } catch (e) { }
            try { sqliteDb.exec(`UPDATE tasks SET plannedStartDate = startDate, plannedDuration = duration WHERE plannedStartDate IS NULL`); } catch (e) { console.error("Migration error", e); }
            sqliteDb.exec('PRAGMA user_version = 2');
            dbVersion = 2;
        }

        // Example of how future migrations would look:
        // if (dbVersion < 3) {
        //     sqliteDb.exec(`ALTER TABLE some_table ADD COLUMN some_col TEXT`);
        //     sqliteDb.exec('PRAGMA user_version = 3');
        //     dbVersion = 3;
        // }

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
                INSERT INTO tasks (id, projectId, title, description, startDate, duration, plannedStartDate, plannedDuration, progress, status, steps, taskTypeId)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(t.id, t.projectId, t.title, t.description || '', t.startDate, t.duration, t.plannedStartDate || null, t.plannedDuration || null, t.progress, t.status || 'backlog', t.steps || '[]', t.taskTypeId || null);
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
    },
    templates: {
        toArray: () => {
            if (!sqliteDb) return [];
            return sqliteDb.prepare(`SELECT * FROM templates ORDER BY createdAt DESC`).all();
        },
        get: (id: string) => {
            if (!sqliteDb) return undefined;
            return sqliteDb.prepare(`SELECT * FROM templates WHERE id = ?`).get(id);
        },
        add: async (t: ExportTemplate) => {
            if (!sqliteDb) return;
            sqliteDb.prepare(`INSERT INTO templates (id, name, blocks, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)`).run(t.id, t.name, t.blocks, t.createdAt, t.updatedAt);
            notifySubscribers();
        },
        update: async (id: string, obj: Partial<ExportTemplate>) => {
            if (!sqliteDb) return;
            const keys = Object.keys(obj);
            if (keys.length === 0) return;
            const setStr = keys.map(k => `${k} = ?`).join(', ');
            const values = keys.map(k => (obj as any)[k]);
            sqliteDb.prepare(`UPDATE templates SET ${setStr} WHERE id = ?`).run(...values, id);
            notifySubscribers();
        },
        delete: async (id: string) => {
            if (!sqliteDb) return;
            sqliteDb.prepare(`DELETE FROM templates WHERE id = ?`).run(id);
            notifySubscribers();
        }
    },
    taskTypes: {
        toArray: () => {
            if (!sqliteDb) return [];
            return sqliteDb.prepare(`SELECT * FROM task_types`).all();
        },
        getGlobal: () => {
            if (!sqliteDb) return [];
            return sqliteDb.prepare(`SELECT * FROM task_types WHERE projectId IS NULL`).all();
        },
        where: (field: string) => ({
            equals: (val: string) => ({
                toArray: () => {
                    if (!sqliteDb) return [];
                    if (field === 'projectId') {
                        // Special case: include global types when fetching for a project
                        return sqliteDb.prepare(`SELECT * FROM task_types WHERE projectId = ? OR projectId IS NULL`).all(val);
                    }
                    return sqliteDb.prepare(`SELECT * FROM task_types WHERE ${field} = ?`).all(val);
                }
            })
        }),
        add: async (tt: TaskType) => {
            if (!sqliteDb) return;
            sqliteDb.prepare(`INSERT INTO task_types (id, projectId, name, color) VALUES (?, ?, ?, ?)`).run(tt.id, tt.projectId || null, tt.name, tt.color);
            notifySubscribers();
        },
        update: async (id: string, obj: Partial<TaskType>) => {
            if (!sqliteDb) return;
            const keys = Object.keys(obj);
            if (keys.length === 0) return;
            const setStr = keys.map(k => `${k} = ?`).join(', ');
            const values = keys.map(k => (obj as any)[k]);
            sqliteDb.prepare(`UPDATE task_types SET ${setStr} WHERE id = ?`).run(...values, id);
            notifySubscribers();
        },
        delete: async (id: string) => {
            if (!sqliteDb) return;
            // Also nullify taskTypeId in tasks using this type
            sqliteDb.prepare(`UPDATE tasks SET taskTypeId = NULL WHERE taskTypeId = ?`).run(id);
            sqliteDb.prepare(`DELETE FROM task_types WHERE id = ?`).run(id);
            notifySubscribers();
        }
    },
    boards: {
        toArray: () => {
            if (!sqliteDb) return [];
            return sqliteDb.prepare(`SELECT * FROM boards ORDER BY createdAt DESC`).all();
        },
        get: (id: string) => {
            if (!sqliteDb) return undefined;
            return sqliteDb.prepare(`SELECT * FROM boards WHERE id = ?`).get(id);
        },
        add: async (b: Board) => {
            if (!sqliteDb) return;
            sqliteDb.prepare(`INSERT INTO boards (id, name, createdAt) VALUES (?, ?, ?)`).run(b.id, b.name, b.createdAt);
            notifySubscribers();
        },
        update: async (id: string, obj: Partial<Board>) => {
            if (!sqliteDb) return;
            const keys = Object.keys(obj);
            if (keys.length === 0) return;
            const setStr = keys.map(k => `${k} = ?`).join(', ');
            const values = keys.map(k => (obj as any)[k]);
            sqliteDb.prepare(`UPDATE boards SET ${setStr} WHERE id = ?`).run(...values, id);
            notifySubscribers();
        },
        delete: async (id: string) => {
            if (!sqliteDb) return;
            sqliteDb.prepare(`DELETE FROM board_tasks WHERE boardId = ?`).run(id);
            sqliteDb.prepare(`DELETE FROM boards WHERE id = ?`).run(id);
            notifySubscribers();
        }
    },
    boardTasks: {
        getByBoard: (boardId: string): BoardTask[] => {
            if (!sqliteDb) return [];
            return sqliteDb.prepare(`SELECT * FROM board_tasks WHERE boardId = ? ORDER BY addedAt DESC`).all(boardId);
        },
        getTasksForBoard: (boardId: string): Task[] => {
            if (!sqliteDb) return [];
            return sqliteDb.prepare(`
                SELECT t.* FROM tasks t
                INNER JOIN board_tasks bt ON bt.taskId = t.id
                WHERE bt.boardId = ?
                ORDER BY t.startDate ASC
            `).all(boardId);
        },
        add: async (bt: BoardTask) => {
            if (!sqliteDb) return;
            try {
                sqliteDb.prepare(`INSERT INTO board_tasks (id, boardId, taskId, addedAt) VALUES (?, ?, ?, ?)`).run(bt.id, bt.boardId, bt.taskId, bt.addedAt);
                notifySubscribers();
            } catch (e) {
                // Ignore unique constraint violation (task already on board)
            }
        },
        remove: async (boardId: string, taskId: string) => {
            if (!sqliteDb) return;
            sqliteDb.prepare(`DELETE FROM board_tasks WHERE boardId = ? AND taskId = ?`).run(boardId, taskId);
            notifySubscribers();
        },
        isTaskOnBoard: (boardId: string, taskId: string): boolean => {
            if (!sqliteDb) return false;
            const row = sqliteDb.prepare(`SELECT id FROM board_tasks WHERE boardId = ? AND taskId = ?`).get(boardId, taskId);
            return !!row;
        }
    }
};
