import dayjs from 'dayjs';
import { Marked } from 'marked';

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const REL_RE = /^([+-])(\d+)([dwm])$/;
const DUR_RE = /^(\d+)([dwm])$/;
const UNIT = { d: 'day', w: 'week', m: 'month' } as const;
const fmt = (d: dayjs.Dayjs) => d.format('YYYY-MM-DD');

export const DATE_TOKEN_RE = /^(today|[+-]\d+[dwm]|\d{4}-\d{2}-\d{2})$/;
export const SHIFT_TOKEN_RE = REL_RE;
export const DURATION_TOKEN_RE = DUR_RE;

const inRange = (d: dayjs.Dayjs) => d.isValid() && d.year() >= 2000 && d.year() <= 2100;

/** `today | ±Nd/w/m | YYYY-MM-DD` → `YYYY-MM-DD` relative to `base`. null for anything else or an absurd year. */
export function resolveDate(token: string, base: string): string | null {
    if (token === 'today') return inRange(dayjs(base)) ? fmt(dayjs(base)) : null;
    if (ISO_RE.test(token)) {
        const d = dayjs(token);
        return inRange(d) && fmt(d) === token ? token : null;
    }
    const m = REL_RE.exec(token);
    if (!m) return null;
    const n = Number(m[2]) * (m[1] === '-' ? -1 : 1);
    const d = dayjs(base).add(n, UNIT[m[3] as keyof typeof UNIT]);
    return inRange(d) ? fmt(d) : null;
}

/** `Nd/w/m` → days. Months follow TaskEditView.tsx:191-196: from the task's own start date. */
export function resolveDuration(token: string, startDate: string): number | null {
    const m = DUR_RE.exec(token);
    if (!m) return null;
    const n = Number(m[1]);
    if (m[2] === 'd') return n;
    if (m[2] === 'w') return n * 7;
    return dayjs(startDate).add(n, 'month').diff(dayjs(startDate), 'day');
}

// Descriptions are stored as HTML (Tiptap). Raw HTML from the model is dropped rather than passed through.
const converter = new Marked({ async: false, renderer: { html: () => '' } });

export function markdownToHtml(markdown: string): string {
    return (converter.parse(markdown, { async: false }) as string).trim();
}
