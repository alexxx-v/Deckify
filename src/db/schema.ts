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
const nodeFs = typeof window !== 'undefined' && 'require' in (window as any) ? (window as any).require('fs') : null;
let sqliteDb: any = null;

/** Schema version this build expects. Bump together with a new migration block below. */
const LATEST_DB_VERSION = 3;

/**
 * Columns each façade may write. The update() helpers build their SET clause from
 * object keys, so anything not listed here must never reach the SQL text.
 */
const UPDATABLE_COLUMNS: Record<string, Set<string>> = {
    projects: new Set(['name', 'createdAt']),
    tasks: new Set(['projectId', 'title', 'description', 'startDate', 'duration', 'plannedStartDate', 'plannedDuration', 'progress', 'status', 'steps', 'taskTypeId']),
    templates: new Set(['name', 'blocks', 'createdAt', 'updatedAt']),
    task_types: new Set(['projectId', 'name', 'color']),
    boards: new Set(['name', 'createdAt']),
};

/**
 * Turn a partial record into a validated `SET a = ?, b = ?` clause plus its values.
 * Returns null when there is nothing to write. Throws on an unknown column rather
 * than dropping it silently, since that would be a caller bug losing data.
 */
function buildUpdate(table: keyof typeof UPDATABLE_COLUMNS, obj: Record<string, any>): { setStr: string; values: any[] } | null {
    const allowed = UPDATABLE_COLUMNS[table];
    const keys = Object.keys(obj);
    const unknown = keys.filter(k => !allowed.has(k));
    if (unknown.length > 0) {
        throw new Error(`Cannot update ${table}: unknown column(s) ${unknown.join(', ')}`);
    }
    if (keys.length === 0) return null;
    return {
        setStr: keys.map(k => `${k} = ?`).join(', '),
        // better-sqlite3 refuses to bind `undefined`; a cleared optional field is NULL.
        values: keys.map(k => (obj[k] === undefined ? null : obj[k])),
    };
}

/** True when `table` already has `column` — used instead of try/catch around ALTER TABLE. */
function hasColumn(table: string, column: string): boolean {
    return sqliteDb.prepare(`PRAGMA table_info(${table})`).all().some((c: any) => c.name === column);
}

function addColumnIfMissing(table: string, column: string, type: string) {
    if (!hasColumn(table, column)) {
        sqliteDb.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    }
}

/**
 * Copy the database file aside before the first migration of a given version.
 * WAL content is folded back into the main file first, so the copy is complete.
 */
function backupBeforeMigration(dbPath: string, fromVersion: number) {
    if (!nodeFs) return;
    const backupPath = `${dbPath}.v${fromVersion}.backup`;
    try {
        if (nodeFs.existsSync(backupPath)) return;
        try { sqliteDb.pragma('wal_checkpoint(TRUNCATE)'); } catch { /* not in WAL yet */ }
        nodeFs.copyFileSync(dbPath, backupPath);
        console.info(`Database backed up before migration: ${backupPath}`);
    } catch (err) {
        console.error('Failed to back up database before migration:', err);
    }
}

/**
 * Run one migration step atomically: the schema change and the user_version bump
 * either both land or neither does, so a failure can never leave the file marked
 * as migrated while the change is missing.
 */
function runMigration(version: number, migrate: () => void) {
    sqliteDb.transaction(() => {
        migrate();
        sqliteDb.exec(`PRAGMA user_version = ${version}`);
    })();
}

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
        // Checked before opening: better-sqlite3 creates the file on open.
        const isNewDatabase = nodeFs ? !nodeFs.existsSync(dbPath) : false;

        sqliteDb = new Database(dbPath);

        // The MCP server opens the same file from another process: WAL lets its reads
        // run alongside our writes, and busy_timeout waits instead of throwing SQLITE_BUSY.
        sqliteDb.pragma('journal_mode = WAL');
        sqliteDb.pragma('busy_timeout = 5000');
        sqliteDb.pragma('foreign_keys = ON');

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

        // Migrations using PRAGMA user_version.
        // Never edit an existing block: add a new one and bump LATEST_DB_VERSION.
        const versionRow = sqliteDb.prepare('PRAGMA user_version').get();
        let dbVersion = versionRow ? versionRow.user_version : 0;

        if (!isNewDatabase && dbVersion < LATEST_DB_VERSION) {
            backupBeforeMigration(dbPath, dbVersion);
        }

        if (dbVersion < 1) {
            runMigration(1, () => {
                addColumnIfMissing('tasks', 'steps', 'TEXT');
                addColumnIfMissing('tasks', 'taskTypeId', 'TEXT');
                sqliteDb.exec(`
                    CREATE TABLE IF NOT EXISTS task_types (
                        id TEXT PRIMARY KEY,
                        projectId TEXT, -- Nullable for global types
                        name TEXT,
                        color TEXT
                    );
                `);
            });
            dbVersion = 1;
        }

        if (dbVersion < 2) {
            runMigration(2, () => {
                addColumnIfMissing('tasks', 'plannedStartDate', 'TEXT');
                addColumnIfMissing('tasks', 'plannedDuration', 'INTEGER');
                sqliteDb.exec(`UPDATE tasks SET plannedStartDate = startDate, plannedDuration = duration WHERE plannedStartDate IS NULL`);
            });
            dbVersion = 2;
        }

        if (dbVersion < 3) {
            // Deleting a task or a project used to leave its board_tasks rows behind,
            // which inflated the task counts shown on board cards. Drop the dangling
            // links once; the delete methods below now clean up as they go.
            runMigration(3, () => {
                sqliteDb.exec(`DELETE FROM board_tasks WHERE taskId NOT IN (SELECT id FROM tasks)`);
                sqliteDb.exec(`DELETE FROM board_tasks WHERE boardId NOT IN (SELECT id FROM boards)`);
            });
            dbVersion = 3;
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
            const update = buildUpdate('projects', obj as Record<string, any>);
            if (!update) return;
            sqliteDb.prepare(`UPDATE projects SET ${update.setStr} WHERE id = ?`).run(...update.values, id);
            notifySubscribers();
        },
        delete: async (id: string) => {
            if (!sqliteDb) return;
            // Cascade by hand: the tables carry no FK constraints, and leaving the
            // project's tasks, board links or scoped task types behind orphans them.
            sqliteDb.transaction((projectId: string) => {
                sqliteDb.prepare(`DELETE FROM board_tasks WHERE taskId IN (SELECT id FROM tasks WHERE projectId = ?)`).run(projectId);
                sqliteDb.prepare(`DELETE FROM tasks WHERE projectId = ?`).run(projectId);
                sqliteDb.prepare(`DELETE FROM task_types WHERE projectId = ?`).run(projectId);
                sqliteDb.prepare(`DELETE FROM projects WHERE id = ?`).run(projectId);
            })(id);
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
            const update = buildUpdate('tasks', obj as Record<string, any>);
            if (!update) return;
            sqliteDb.prepare(`UPDATE tasks SET ${update.setStr} WHERE id = ?`).run(...update.values, id);
            notifySubscribers();
        },
        delete: async (id: string) => {
            if (!sqliteDb) return;
            sqliteDb.transaction((taskId: string) => {
                sqliteDb.prepare(`DELETE FROM board_tasks WHERE taskId = ?`).run(taskId);
                sqliteDb.prepare(`DELETE FROM tasks WHERE id = ?`).run(taskId);
            })(id);
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
            sqliteDb.transaction((taskIds: string[]) => {
                sqliteDb.prepare(`DELETE FROM board_tasks WHERE taskId IN (${placeholders})`).run(...taskIds);
                sqliteDb.prepare(`DELETE FROM tasks WHERE id IN (${placeholders})`).run(...taskIds);
            })(ids);
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
            const update = buildUpdate('templates', obj as Record<string, any>);
            if (!update) return;
            sqliteDb.prepare(`UPDATE templates SET ${update.setStr} WHERE id = ?`).run(...update.values, id);
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
            const update = buildUpdate('task_types', obj as Record<string, any>);
            if (!update) return;
            sqliteDb.prepare(`UPDATE task_types SET ${update.setStr} WHERE id = ?`).run(...update.values, id);
            notifySubscribers();
        },
        delete: async (id: string) => {
            if (!sqliteDb) return;
            sqliteDb.transaction((typeId: string) => {
                // Also nullify taskTypeId in tasks using this type
                sqliteDb.prepare(`UPDATE tasks SET taskTypeId = NULL WHERE taskTypeId = ?`).run(typeId);
                sqliteDb.prepare(`DELETE FROM task_types WHERE id = ?`).run(typeId);
            })(id);
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
            const update = buildUpdate('boards', obj as Record<string, any>);
            if (!update) return;
            sqliteDb.prepare(`UPDATE boards SET ${update.setStr} WHERE id = ?`).run(...update.values, id);
            notifySubscribers();
        },
        delete: async (id: string) => {
            if (!sqliteDb) return;
            sqliteDb.transaction((boardId: string) => {
                sqliteDb.prepare(`DELETE FROM board_tasks WHERE boardId = ?`).run(boardId);
                sqliteDb.prepare(`DELETE FROM boards WHERE id = ?`).run(boardId);
            })(id);
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
