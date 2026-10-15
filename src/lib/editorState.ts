/*
 * Which task form currently holds unsaved edits. TaskEditView reports its `isDirty` here so code outside it
 * (the AI assistant, before it runs a plan) can warn instead of silently discarding the edits.
 * Same idea as `listeners` in src/db/schema.ts: module-level state, no React involved.
 */

let dirtyTaskId: string | null = null;

/** Only the form of `taskId` can set or clear its own flag, so a stale cleanup never erases a newer form's state. */
export function setTaskEditorDirty(taskId: string, dirty: boolean): void {
    if (dirty) dirtyTaskId = taskId;
    else if (dirtyTaskId === taskId) dirtyTaskId = null;
}

export function getDirtyTaskId(): string | null {
    return dirtyTaskId;
}
