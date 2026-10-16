import dayjs from 'dayjs';
import type { TFunction } from 'i18next';

/** Labels and values for the "before → after" lines of a plan card. Values are shown as the user sees them elsewhere. */

const STATUS_KEYS: Record<string, string> = {
    backlog: 'taskEdit.backlog',
    progress: 'taskEdit.inProgress',
    hold: 'taskEdit.onHold',
    done: 'taskEdit.done',
};

const FIELD_KEYS: Record<string, string> = {
    title: 'assistant.fields.title',
    name: 'assistant.fields.name',
    status: 'assistant.fields.status',
    progress: 'assistant.fields.progress',
    startDate: 'assistant.fields.startDate',
    duration: 'assistant.fields.duration',
    plannedStartDate: 'assistant.fields.plannedStartDate',
    plannedDuration: 'assistant.fields.plannedDuration',
    description: 'assistant.fields.description',
    steps: 'assistant.fields.steps',
    board: 'assistant.fields.board',
    taskType: 'assistant.fields.taskType',
    color: 'assistant.fields.color',
    scope: 'assistant.fields.scope',
};

export const fieldLabel = (t: TFunction, field: string): string => (FIELD_KEYS[field] ? t(FIELD_KEYS[field]) : field);

const isEmpty = (v: unknown) => v === null || v === undefined || v === '' || v === 0;

export function formatValue(t: TFunction, field: string, value: unknown): string {
    const empty = t('assistant.values.empty');
    switch (field) {
        case 'startDate':
        case 'plannedStartDate':
            return isEmpty(value) ? empty : dayjs(String(value)).format('D MMM YYYY');
        case 'duration':
        case 'plannedDuration':
            return isEmpty(value) ? empty : t('assistant.values.days', { count: Number(value) });
        case 'status':
            return STATUS_KEYS[String(value)] ? t(STATUS_KEYS[String(value)]) : empty;
        case 'progress':
            return value === null || value === undefined ? empty : `${Number(value)}%`;
        case 'description':
            return isEmpty(value) ? empty : t('assistant.values.updated');
        case 'steps':
            return Array.isArray(value) ? t('assistant.values.items', { count: value.length }) : empty;
        case 'scope':
            // null = a global task type
            return value === null || value === undefined || value === '' ? t('assistant.values.global') : String(value);
        default:
            return isEmpty(value) ? empty : String(value);
    }
}
