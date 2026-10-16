// Row-level primitives over a SQLite handle, used by the AI action registry (src/features/ai/actions/).
// The handle is injected so this module can run under plain Node (scripts/ai-actions-check.mjs) —
// schema.ts cannot, it needs React and window.require. Node runs this file with type stripping, so it uses
// no enums / parameter properties and only `import type`.

export type TableName = 'projects' | 'tasks' | 'task_types' | 'boards' | 'board_tasks';

export type Row = Record<string, unknown>;

export interface SqliteLike {
    prepare(sql: string): {
        all(...params: unknown[]): unknown[];
        get(...params: unknown[]): unknown;
        run(...params: unknown[]): unknown;
    };
}

/**
 * Every column of every table the registry may touch, `id` first. When the schema changes
 * (new column, new table) this list must change too: assertSchema() fails loudly otherwise, so
 * cascades and undo can never silently miss data. `templates` is intentionally out of scope.
 *
 * Extra columns the real database has on a known table (added by another build or tool) are tolerated: rows are read
 * with SELECT *, so snapshots and undo carry them along unchanged, and the registry never writes them. A column that
 * is MISSING, or a table nobody listed, is still an error.
 */
export const TABLE_COLUMNS: Record<TableName, readonly string[]> = {
    projects: ['id', 'name', 'createdAt'],
    tasks: ['id', 'projectId', 'title', 'description', 'startDate', 'duration', 'plannedStartDate', 'plannedDuration', 'progress', 'status', 'steps', 'taskTypeId'],
    task_types: ['id', 'projectId', 'name', 'color'],
    boards: ['id', 'name', 'createdAt'],
    board_tasks: ['id', 'boardId', 'taskId', 'addedAt'],
};

const OUT_OF_SCOPE_TABLES = ['templates'];

export interface DbOps {
    get(table: TableName, id: string): Row | null;
    /** Equality filters only; a `null` value means `IS NULL`. */
    select(table: TableName, where?: Row, orderBy?: string[]): Row[];
    insert(table: TableName, row: Row): void;
    update(table: TableName, id: string, patch: Row): void;
    /** Insert, or overwrite every given column when the id already exists. */
    upsert(table: TableName, row: Row): void;
    remove(table: TableName, id: string): void;
    /** Throws when the real database no longer matches TABLE_COLUMNS. Runs its queries once per handle. */
    assertSchema(): void;
}

const hasOwn = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key);

function columnsOf(table: string): readonly string[] {
    if (!hasOwn(TABLE_COLUMNS, table)) throw new Error(`ops: unknown table "${table}"`);
    return TABLE_COLUMNS[table as TableName];
}

/** Table and column names reach SQL text only after passing this check; values are always bound. */
function checkColumns(table: string, keys: string[], extra: readonly string[] = []): void {
    const allowed = columnsOf(table);
    const unknown = keys.filter(k => !allowed.includes(k) && !extra.includes(k));
    if (unknown.length > 0) throw new Error(`ops: unknown column(s) for ${table}: ${unknown.join(', ')}`);
}

// better-sqlite3 refuses to bind `undefined`; a cleared optional field is NULL.
const bind = (v: unknown) => (v === undefined ? null : v);

export function createOps(sqlite: SqliteLike): DbOps {
    let schemaChecked = false;
    // Columns found in the real database beyond TABLE_COLUMNS (filled by assertSchema).
    const extraColumns: Partial<Record<TableName, string[]>> = {};
    const extraOf = (table: string) => extraColumns[table as TableName] ?? [];

    const get = (table: TableName, id: string): Row | null => {
        columnsOf(table);
        const row = sqlite.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
        return (row as Row | undefined) ?? null;
    };

    const select = (table: TableName, where: Row = {}, orderBy: string[] = []): Row[] => {
        const keys = Object.keys(where);
        checkColumns(table, [...keys, ...orderBy], extraOf(table));
        const clauses = keys.map(k => (where[k] === null || where[k] === undefined ? `${k} IS NULL` : `${k} = ?`));
        const values = keys.filter(k => where[k] !== null && where[k] !== undefined).map(k => where[k]);
        const sql = `SELECT * FROM ${table}`
            + (clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '')
            + (orderBy.length ? ` ORDER BY ${orderBy.map(c => `${c} ASC`).join(', ')}` : '');
        return sqlite.prepare(sql).all(...values) as Row[];
    };

    const insert = (table: TableName, row: Row): void => {
        const keys = Object.keys(row);
        checkColumns(table, keys, extraOf(table));
        if (!keys.includes('id')) throw new Error(`ops: insert into ${table} needs an id`);
        sqlite
            .prepare(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`)
            .run(...keys.map(k => bind(row[k])));
    };

    const update = (table: TableName, id: string, patch: Row): void => {
        const keys = Object.keys(patch);
        checkColumns(table, keys, extraOf(table));
        if (keys.includes('id')) throw new Error(`ops: cannot change the id of a ${table} row`);
        if (keys.length === 0) return;
        sqlite
            .prepare(`UPDATE ${table} SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`)
            .run(...keys.map(k => bind(patch[k])), id);
    };

    const upsert = (table: TableName, row: Row): void => {
        const keys = Object.keys(row);
        checkColumns(table, keys, extraOf(table));
        if (!keys.includes('id')) throw new Error(`ops: upsert into ${table} needs an id`);
        const others = keys.filter(k => k !== 'id');
        const conflict = others.length
            ? `DO UPDATE SET ${others.map(k => `${k} = excluded.${k}`).join(', ')}`
            : 'DO NOTHING';
        sqlite
            .prepare(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')}) ON CONFLICT(id) ${conflict}`)
            .run(...keys.map(k => bind(row[k])));
    };

    const remove = (table: TableName, id: string): void => {
        columnsOf(table);
        sqlite.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
    };

    const assertSchema = (): void => {
        if (schemaChecked) return;
        const present = (sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).all() as { name: string }[])
            .map(r => r.name);
        const known = [...Object.keys(TABLE_COLUMNS), ...OUT_OF_SCOPE_TABLES];
        const extra = present.filter(n => !known.includes(n));
        if (extra.length) {
            throw new Error(`ops: unknown table(s) ${extra.join(', ')} — update src/db/ops.ts (cascades and undo would miss them)`);
        }
        for (const table of Object.keys(TABLE_COLUMNS) as TableName[]) {
            const actual = (sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(c => c.name);
            const wanted = TABLE_COLUMNS[table];
            const missing = wanted.filter(c => !actual.includes(c));
            if (actual.length === 0 || missing.length) {
                throw new Error(
                    `ops: table ${table} does not match src/db/ops.ts TABLE_COLUMNS`
                    + (actual.length === 0 ? ' (table is missing)' : '')
                    + (missing.length ? `; missing in DB: ${missing.join(', ')}` : ''),
                );
            }
            const added = actual.filter(c => !wanted.includes(c));
            if (added.length) extraColumns[table] = added;
        }
        schemaChecked = true;
    };

    return { get, select, insert, update, upsert, remove, assertSchema };
}
