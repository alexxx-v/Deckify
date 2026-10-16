import { TABLE_COLUMNS } from '../../../db/ops.ts';
import type { UndoRecord } from './types.ts';

/** Where the undo record of the last plan lives: a JSON file next to the database (no schema migration needed). */
export interface UndoStore {
    /** `null` = nothing stored; `'corrupt'` = a file exists but cannot be trusted (it is left in place). */
    read(): UndoRecord | null | 'corrupt';
    write(record: UndoRecord): void;
    clear(): void;
}

/** The subset of Node's `fs` used here, so tests and the renderer can both provide it. */
export interface FsLike {
    existsSync(path: string): boolean;
    readFileSync(path: string, encoding: 'utf8'): string;
    writeFileSync(path: string, data: string): void;
    renameSync(from: string, to: string): void;
    unlinkSync(path: string): void;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isRowOrNull = (v: unknown) => v === null || isObj(v);

function isUndoRecord(v: unknown): v is UndoRecord {
    if (!isObj(v) || v.version !== 1) return false;
    if (typeof v.planId !== 'string' || typeof v.createdAt !== 'number' || typeof v.dbPath !== 'string') return false;
    if (!Array.isArray(v.summary) || !Array.isArray(v.entries)) return false;
    return v.entries.every(e => isObj(e)
        && typeof e.table === 'string' && Object.prototype.hasOwnProperty.call(TABLE_COLUMNS, e.table)
        && typeof e.id === 'string' && typeof e.label === 'string'
        && isRowOrNull(e.before) && isRowOrNull(e.after));
}

export function createFileUndoStore(fs: FsLike, filePath: string): UndoStore {
    return {
        read() {
            if (!fs.existsSync(filePath)) return null;
            try {
                const parsed: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                return isUndoRecord(parsed) ? parsed : 'corrupt';
            } catch {
                return 'corrupt';
            }
        },
        write(record) {
            // Temp file + rename: a crash mid-write never leaves a half-written record behind.
            const tmp = `${filePath}.tmp`;
            fs.writeFileSync(tmp, JSON.stringify(record));
            fs.renameSync(tmp, filePath);
        },
        clear() {
            try {
                fs.unlinkSync(filePath);
            } catch (err) {
                if ((err as { code?: string }).code !== 'ENOENT') throw err;
            }
        },
    };
}
