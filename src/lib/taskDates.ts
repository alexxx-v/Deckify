import dayjs from 'dayjs';

export type Timeframe = 'all' | 'month' | 'quarter' | 'year';
export type PeriodTimeframe = Exclude<Timeframe, 'all'>;

/**
 * Minimal shape needed for date maths. Kept structural (not `Task`) so this
 * module stays free of the db layer and its Electron-only side effects.
 */
export interface TaskDates {
    startDate?: string;
    duration?: number;
    plannedStartDate?: string;
    plannedDuration?: number;
}

/**
 * Actual start date, falling back to the planned one.
 * Tasks created from the UI carry only planned dates until work actually starts,
 * so every consumer must use the effective value — see getEffectiveDuration.
 */
export const getEffectiveStartDate = (task: TaskDates): string =>
    task.startDate || task.plannedStartDate || '';

/** Actual duration in days, falling back to the planned one. Never 0, so roadmap bars stay visible. */
export const getEffectiveDuration = (task: TaskDates): number =>
    task.duration || task.plannedDuration || 1;

export const getEffectiveStart = (task: TaskDates): dayjs.Dayjs =>
    dayjs(getEffectiveStartDate(task));

export const getEffectiveEnd = (task: TaskDates): dayjs.Dayjs =>
    getEffectiveStart(task).add(getEffectiveDuration(task), 'day');

/** Start/end of the month, quarter or year containing `base`. */
export function getPeriodRange(timeframe: PeriodTimeframe, base: dayjs.Dayjs) {
    if (timeframe === 'quarter') {
        const rangeStart = base.month(Math.floor(base.month() / 3) * 3).startOf('month');
        return { rangeStart, rangeEnd: rangeStart.add(2, 'month').endOf('month') };
    }
    if (timeframe === 'year') {
        return { rangeStart: base.startOf('year'), rangeEnd: base.endOf('year') };
    }
    return { rangeStart: base.startOf('month'), rangeEnd: base.endOf('month') };
}

/** Same as getPeriodRange, for the `YYYY-MM` strings the views keep in localStorage. */
export function getPeriodRangeForMonthInput(timeframe: PeriodTimeframe, filterDate: string) {
    return getPeriodRange(timeframe, dayjs(filterDate + '-01'));
}

/**
 * Does the task's effective span intersect [rangeStart, rangeEnd]?
 * Tasks with no usable start date are excluded rather than silently compared
 * as Invalid Date (which always answers `false` and hides them everywhere).
 */
export function taskOverlapsRange(task: TaskDates, rangeStart: dayjs.Dayjs, rangeEnd: dayjs.Dayjs): boolean {
    const start = getEffectiveStart(task);
    if (!start.isValid()) return false;
    return start.isBefore(rangeEnd) && getEffectiveEnd(task).isAfter(rangeStart);
}

/** Outer bounds of a task set, for the "all time" roadmap. Falls back to today when empty. */
export function getTasksBounds(tasks: TaskDates[]): { minDate: dayjs.Dayjs; maxDate: dayjs.Dayjs } {
    const dated = tasks.filter(t => getEffectiveStart(t).isValid());
    if (dated.length === 0) {
        const today = dayjs();
        return { minDate: today, maxDate: today };
    }
    let minDate = getEffectiveStart(dated[0]);
    let maxDate = getEffectiveEnd(dated[0]);
    dated.forEach(task => {
        const start = getEffectiveStart(task);
        const end = getEffectiveEnd(task);
        if (start.isBefore(minDate)) minDate = start;
        if (end.isAfter(maxDate)) maxDate = end;
    });
    return { minDate, maxDate };
}
