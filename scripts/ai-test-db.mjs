#!/usr/bin/env node
/*
 * Shared test database for the AI check scripts: the Node build of better-sqlite3 (from mcp/node_modules — the
 * root one is built for Electron's ABI), the schema, and the spike fixtures plus extra rows for cascades.
 * Importing this module SKIPs (exit 0, loudly) when no Node-compatible sqlite is available.
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let Database;
try {
    Database = createRequire(path.join(ROOT, 'mcp', 'package.json'))('better-sqlite3');
    new Database(':memory:').close();
} catch (e) {
    console.log(`SKIP: no Node-compatible better-sqlite3 (${String(e.message).split('\n')[0]})`);
    console.log('      Run `cd mcp && npm install`. NOTHING WAS CHECKED.');
    process.exit(0);
}


export { Database };
export const { createOps, TABLE_COLUMNS } = await import('../src/db/ops.ts');
export const fixtures = await import('./ai-spike/fixtures.mjs');

// Mirrors LATEST_DB_VERSION = 3 in src/db/schema.ts and the DDL in mcp/src/index.ts, plus `templates`.
export const TEST_DDL = `
    CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT, createdAt INTEGER);
    CREATE TABLE tasks (
        id TEXT PRIMARY KEY, projectId TEXT, title TEXT, description TEXT, startDate TEXT, duration INTEGER,
        plannedStartDate TEXT, plannedDuration INTEGER, progress INTEGER, status TEXT, steps TEXT, taskTypeId TEXT
    );
    CREATE TABLE task_types (id TEXT PRIMARY KEY, projectId TEXT, name TEXT, color TEXT);
    CREATE TABLE boards (id TEXT PRIMARY KEY, name TEXT, createdAt INTEGER);
    CREATE TABLE board_tasks (id TEXT PRIMARY KEY, boardId TEXT, taskId TEXT, addedAt INTEGER, UNIQUE(boardId, taskId));
    CREATE TABLE templates (id TEXT PRIMARY KEY, name TEXT, blocks TEXT, createdAt INTEGER, updatedAt INTEGER);
`;

/** Spike fixtures plus a task type scoped to KYC and board links, so cascades have something to do. */
export function freshDb() {
    const sqlite = new Database(':memory:');
    sqlite.exec(TEST_DDL);
    const ops = createOps(sqlite);
    for (const p of fixtures.projects) ops.insert('projects', p);
    for (const t of fixtures.tasks) ops.insert('tasks', t);
    for (const tt of fixtures.taskTypes) ops.insert('task_types', tt);
    const kyc = fixtures.projectByName('KYC');
    ops.insert('task_types', { id: 'tt-kyc-scoped', projectId: kyc.id, name: 'KYC-only', color: '#ef4444' });
    // one task has a description and steps, so "describe the task" needs a get_task query
    ops.update('tasks', fixtures.byTitle('Лендинг').id, {
        description: '<p>Сделать посадочную страницу для весенней кампании</p>',
        steps: JSON.stringify([{ id: 's1', text: 'Макет', completed: true }, { id: 's2', text: 'Вёрстка', completed: false }]),
    });
    // one task already has a type, so "remove the type" is testable
    ops.update('tasks', fixtures.byTitle('Экран логина').id, { taskTypeId: fixtures.taskTypes[1].id });
    for (const b of fixtures.boards) ops.insert('boards', b);
    const board = fixtures.boards[0].id;
    [fixtures.byTitle('Проверка паспортов'), fixtures.byTitle('Интеграция с Госуслугами'), fixtures.byTitle('Экран логина')]
        .forEach((t, i) => ops.insert('board_tasks', { id: `bt-${i + 1}`, boardId: board, taskId: t.id, addedAt: 1000 + i }));
    return { sqlite, ops };
}

/** Canonical dump of every table the registry knows, for byte-identical before/after comparisons. */
export function dump(sqlite) {
    const out = {};
    for (const table of Object.keys(TABLE_COLUMNS)) {
        out[table] = sqlite.prepare(`SELECT * FROM ${table} ORDER BY id`).all();
    }
    return JSON.stringify(out);
}


/**
 * A database whose context cannot show everything: 400 tasks, so the 150-task cap hides most of them.
 * «Задача 377» is a plain backlog task near the end — only a query can find it.
 */
export function bigDb() {
    const sqlite = new Database(':memory:');
    sqlite.exec(TEST_DDL);
    const ops = createOps(sqlite);
    ops.insert('projects', { id: 'big', name: 'Большой', createdAt: 1 });
    const insert = sqlite.prepare(`INSERT INTO tasks (id, projectId, title, description, startDate, duration, plannedStartDate, plannedDuration, progress, status, steps, taskTypeId) VALUES (?, 'big', ?, '', '2026-12-01', 3, '2026-12-01', 3, 0, ?, '[]', NULL)`);
    sqlite.transaction(() => {
        for (let i = 0; i < 400; i++) insert.run(`big-${String(i).padStart(3, '0')}`, `Задача ${i}`, i % 5 === 0 ? 'done' : 'backlog');
    })();
    return { sqlite, ops };
}
