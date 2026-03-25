import React from 'react';
import { Document, Page, Text, View, StyleSheet, Svg, Path, G } from '@react-pdf/renderer';
import { Project, Task, TaskStatus, TemplateBlock, TaskType } from '@/db/schema';
import dayjs from 'dayjs';
import i18n from '@/i18n';

const getPdfStatusColor = (status?: TaskStatus) => {
    switch (status) {
        case 'done': return { text: '#166534', bg: '#DCFCE7', border: '#86EFAC', bar: '#22C55E' };
        case 'progress': return { text: '#1E40AF', bg: '#DBEAFE', border: '#93C5FD', bar: '#3B82F6' };
        case 'hold': return { text: '#854D0E', bg: '#FEF9C3', border: '#FDE047', bar: '#EAB308' };
        case 'backlog':
        default: return { text: '#374151', bg: '#F3F4F6', border: '#D1D5DB', bar: '#6B7280' };
    }
};

const getRoadmapPeriodLabel = (minDate: dayjs.Dayjs, maxDate: dayjs.Dayjs): string => {
    const diffDays = maxDate.diff(minDate, 'day');
    if (diffDays <= 45) {
        const monthRu = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'][minDate.month()];
        return `${monthRu} ${minDate.year()}`;
    }
    if (diffDays <= 100) {
        const q = Math.floor(minDate.month() / 3) + 1;
        return `Q${q} ${minDate.year()}`;
    }
    const startYear = minDate.year();
    const endYear = maxDate.year();
    return startYear === endYear ? `Год ${startYear}` : `Год ${startYear}-${endYear}`;
};

const DonutChart = ({ data }: { data: { percent: number, color: string }[] }) => {
    const size = 280;
    const center = size / 2;
    const radius = size * 0.45;
    const thickness = 60;
    const innerRadius = radius - thickness;
    
    let currentAngle = 0;
    
    return (
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <G transform={`translate(${center}, ${center})`}>
                {data.map((item, idx) => {
                    const angle = (item.percent / 100) * 360;
                    if (angle <= 0) return null;
                    if (angle >= 360) {
                        return (
                            <G key={idx}>
                                <Path d={`M 0 -${radius} A ${radius} ${radius} 0 1 1 -0.01 -${radius} Z`} fill={item.color} />
                                <Path d={`M 0 -${innerRadius} A ${innerRadius} ${innerRadius} 0 1 1 -0.01 -${innerRadius} Z`} fill="#FFFFFF" />
                                <Text
                                    x={0}
                                    y={4}
                                    textAnchor="middle"
                                    style={{ fontSize: 16, fontWeight: 'bold', fill: '#111827' }}
                                >
                                    100%
                                </Text>
                            </G>
                        );
                    }
                    
                    const startAngle = currentAngle;
                    const endAngle = currentAngle + angle;
                    currentAngle += angle;
                    
                    const startRad = (startAngle - 90) * (Math.PI / 180);
                    const endRad = (endAngle - 90) * (Math.PI / 180);
                    
                    const x1 = radius * Math.cos(startRad);
                    const y1 = radius * Math.sin(startRad);
                    const x2 = radius * Math.cos(endRad);
                    const y2 = radius * Math.sin(endRad);
                    
                    const ix1 = innerRadius * Math.cos(startRad);
                    const iy1 = innerRadius * Math.sin(startRad);
                    const ix2 = innerRadius * Math.cos(endRad);
                    const iy2 = innerRadius * Math.sin(endRad);
                    
                    const largeArcFlag = angle > 180 ? 1 : 0;
                    
                    const d = [
                        `M ${x1} ${y1}`,
                        `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
                        `L ${ix2} ${iy2}`,
                        `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${ix1} ${iy1}`,
                        'Z'
                    ].join(' ');

                    const midRad = (radius + innerRadius) / 2;
                    const midAngleRad = (startAngle + angle / 2 - 90) * (Math.PI / 180);
                    const tx = midRad * Math.cos(midAngleRad);
                    const ty = midRad * Math.sin(midAngleRad);
                    
                    return (
                        <G key={idx}>
                            <Path d={d} fill={item.color} />
                            {angle > 12 && (
                                <Text
                                    x={tx}
                                    y={ty + 3}
                                    textAnchor="middle"
                                    style={{ fontSize: 11, fontWeight: 'bold', fill: '#FFFFFF' }}
                                >
                                    {Math.round(item.percent)}%
                                </Text>
                            )}
                        </G>
                    );
                })}
            </G>
        </Svg>
    );
};

import { registerFonts } from './pdfFonts';

registerFonts();

const styles = StyleSheet.create({
    page: { flexDirection: 'column', backgroundColor: '#FAFAFA', padding: 40, fontFamily: 'Roboto' },
    titlePageDetails: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    mainTitle: { fontSize: 48, fontWeight: 'bold', color: '#111827', marginBottom: 16, textAlign: 'center' },
    subtitle: { fontSize: 24, color: '#6B7280', textAlign: 'center' },
    header: { fontSize: 28, fontWeight: 'bold', color: '#111827', marginBottom: 24, borderBottomWidth: 2, borderBottomColor: '#E5E7EB', paddingBottom: 10 },
    statsContainer: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 10, marginBottom: 20, padding: 20, backgroundColor: '#FFFFFF', borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB' },
    statBox: { alignItems: 'center' },
    statNumber: { fontSize: 48, fontWeight: 'bold', color: '#4F46E5' },
    statLabel: { fontSize: 16, color: '#6B7280', marginTop: 8 },
    roadmapContainer: { marginTop: 20, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, padding: 12, backgroundColor: '#FFFFFF' },
    roadmapRow: { flexDirection: 'row', marginBottom: 8, alignItems: 'center', minHeight: 24 },
    roadmapTaskTitle: { width: 180, paddingRight: 8 },
    roadmapTaskTitleText: { fontSize: 9, color: '#374151' },
    roadmapTaskStatus: { width: 85, paddingRight: 8 },
    roadmapTimeline: { width: 465, height: 16, backgroundColor: '#F3F4F6', borderRadius: 4, position: 'relative', overflow: 'hidden' },
    roadmapBar: { position: 'absolute', height: 10, top: 3, borderRadius: 4 },
    roadmapGroupHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, marginTop: 8, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', gap: 6 },
    roadmapGroupTitle: { fontSize: 8, fontWeight: 'bold', color: '#6B7280', textTransform: 'uppercase' },
});

// ─── HTML → react-pdf renderer ───────────────────────────────────────────────
// Uses DOMParser (available in Electron) to build a proper DOM tree, then
// recursively converts it to @react-pdf/renderer primitives.
// Falls back to legacy markdown parsing for old tasks that still contain Markdown text.

const isHtmlContent = (text: string): boolean => /^\s*<[a-z][\s\S]*>/i.test(text);

interface RenderCtx { fontSize: number; indent?: number }

/** Render inline child nodes of an element (text, strong, em, s, code) */
function renderInlineChildren(node: Element, ctx: RenderCtx): React.ReactNode[] {
    const result: React.ReactNode[] = [];
    node.childNodes.forEach((child, i) => {
        if (child.nodeType === Node.TEXT_NODE) {
            const t = child.textContent || '';
            if (t) result.push(<React.Fragment key={i}>{t}</React.Fragment>);
            return;
        }
        if (child.nodeType !== Node.ELEMENT_NODE) return;
        const el = child as Element;
        const tag = el.tagName.toLowerCase();
        if (tag === 'strong') result.push(<Text key={i} style={{ fontWeight: 'bold', color: '#111827' }}>{renderInlineChildren(el, ctx)}</Text>);
        else if (tag === 'em') result.push(<Text key={i} style={{ fontStyle: 'italic' }}>{renderInlineChildren(el, ctx)}</Text>);
        else if (tag === 's') result.push(<Text key={i} style={{ textDecoration: 'line-through', opacity: 0.65 }}>{renderInlineChildren(el, ctx)}</Text>);
        else if (tag === 'code') result.push(<Text key={i} style={{ fontFamily: 'Courier', fontSize: ctx.fontSize - 1 }}>{renderInlineChildren(el, ctx)}</Text>);
        else result.push(<React.Fragment key={i}>{renderInlineChildren(el, ctx)}</React.Fragment>);
    });
    return result;
}

/** Render a list (ul / ol) element, supports nesting */
function renderList(el: Element, ctx: RenderCtx, outerKey: number): React.ReactNode {
    const isOl = el.tagName.toLowerCase() === 'ol';
    const isTask = el.getAttribute('data-type') === 'taskList';
    const indent = ctx.indent ?? 0;
    const items: React.ReactNode[] = [];
    let counter = 0;

    el.children && Array.from(el.children).forEach((li, i) => {
        if (li.tagName.toLowerCase() !== 'li') return;
        counter++;

        // Extraction for inline content: just use nodeType comparison instead of span
        const directNodesContent: React.ReactNode[] = [];
        const nestedLists: Element[] = [];
        li.childNodes.forEach((c, idx) => {
            if (c.nodeType === Node.TEXT_NODE) {
                const t = c.textContent || '';
                if (t) directNodesContent.push(<React.Fragment key={`li-t-${idx}`}>{t}</React.Fragment>);
            } else if (c.nodeType === Node.ELEMENT_NODE) {
                const elChild = c as Element;
                const tag = elChild.tagName.toLowerCase();
                if (tag === 'ul' || tag === 'ol') {
                    nestedLists.push(elChild);
                } else {
                    // Render other elements inline if they are not lists
                    directNodesContent.push(<React.Fragment key={`li-e-${idx}`}>{renderBlockEl(elChild, ctx, idx)}</React.Fragment>);
                }
            }
        });

        if (isTask) {
            const checked = li.getAttribute('data-checked') === 'true';
            items.push(
                <View key={i} style={{ flexDirection: 'row', marginBottom: ctx.fontSize * 0.1, paddingLeft: indent * 12 + 4 }}>
                    <Text style={{ width: 16, fontSize: ctx.fontSize, color: checked ? '#4F46E5' : '#9CA3AF' }}>{checked ? '☑' : '☐'}</Text>
                    <Text style={{ flex: 1, fontSize: ctx.fontSize, color: checked ? '#9CA3AF' : '#4B5563', lineHeight: 1.2, textDecoration: checked ? 'line-through' : 'none' }}>{directNodesContent}</Text>
                </View>
            );
        } else {
            const bullet = isOl ? `${counter}.` : '•';
            const bulletWidth = isOl ? 20 : 12;
            items.push(
                <View key={i}>
                    <View style={{ flexDirection: 'row', marginBottom: ctx.fontSize * 0.05, paddingLeft: indent * 12 + 8 }}>
                        <Text style={{ width: bulletWidth, fontSize: ctx.fontSize, color: '#4B5563' }}>{bullet}</Text>
                        <Text style={{ flex: 1, fontSize: ctx.fontSize, color: '#4B5563', lineHeight: 1.2 }}>
                            {directNodesContent}
                        </Text>
                    </View>
                    {nestedLists.map((nested, j) => (
                        <React.Fragment key={`n-${j}`}>
                            {renderList(nested, { ...ctx, indent: (indent || 0) + 1 }, j)}
                        </React.Fragment>
                    ))}
                </View>
            );
        }
    });
    return <View key={outerKey}>{items}</View>;
}

/** Render a single block element */
function renderBlockEl(el: Element, ctx: RenderCtx, key: number): React.ReactNode | null {
    const tag = el.tagName.toLowerCase();

    if (tag === 'h1') return (
        <Text key={key} style={{ fontSize: ctx.fontSize + 8, fontWeight: 'bold', color: '#111827', marginTop: ctx.fontSize * 0.5, marginBottom: ctx.fontSize * 0.2 }}>
            {renderInlineChildren(el, ctx)}
        </Text>
    );
    if (tag === 'h2') return (
        <Text key={key} style={{ fontSize: ctx.fontSize + 4, fontWeight: 'bold', color: '#111827', marginTop: ctx.fontSize * 0.4, marginBottom: ctx.fontSize * 0.2 }}>
            {renderInlineChildren(el, ctx)}
        </Text>
    );
    if (tag === 'h3') return (
        <Text key={key} style={{ fontSize: ctx.fontSize + 1, fontWeight: 'bold', color: '#1f2937', marginTop: ctx.fontSize * 0.3, marginBottom: ctx.fontSize * 0.2 }}>
            {renderInlineChildren(el, ctx)}
        </Text>
    );
    if (tag === 'p') {
        if (!el.textContent?.trim()) return <View key={key} style={{ height: ctx.fontSize * 0.3 }} />;
        return (
            <Text key={key} style={{ fontSize: ctx.fontSize, color: '#4B5563', lineHeight: 1.25, marginBottom: ctx.fontSize * 0.2 }}>
                {renderInlineChildren(el, ctx)}
            </Text>
        );
    }
    if (tag === 'ul' || tag === 'ol') return renderList(el, ctx, key);
    if (tag === 'blockquote') return (
        <View key={key} style={{ borderLeftWidth: 2, borderLeftColor: '#D1D5DB', paddingLeft: 8, marginVertical: ctx.fontSize * 0.2 }}>
            <Text style={{ fontSize: ctx.fontSize - 1, color: '#6B7280', fontStyle: 'italic' }}>{renderInlineChildren(el, ctx)}</Text>
        </View>
    );
    if (tag === 'pre') return (
        <View key={key} style={{ backgroundColor: '#F3F4F6', padding: 6, borderRadius: 4, marginVertical: ctx.fontSize * 0.2 }}>
            <Text style={{ fontSize: ctx.fontSize - 2, fontFamily: 'Courier', color: '#374151' }}>{el.textContent}</Text>
        </View>
    );
    if (tag === 'hr') return <View key={key} style={{ borderBottomWidth: 1, borderBottomColor: '#E5E7EB', marginVertical: ctx.fontSize * 0.3 }} />;

    // Fallback: try to render as paragraph
    const text = el.textContent?.trim();
    if (text) return <Text key={key} style={{ fontSize: ctx.fontSize, color: '#4B5563', lineHeight: 1.25 }}>{text}</Text>;
    return null;
}

/** Parse HTML string via DOMParser and render to react-pdf nodes */
function renderHtmlNodes(html: string, ctx: RenderCtx): React.ReactNode[] {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const nodes: React.ReactNode[] = [];
    let key = 0;
    doc.body.childNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
            const result = renderBlockEl(node as Element, ctx, key++);
            if (result) nodes.push(result);
        } else if (node.nodeType === Node.TEXT_NODE) {
            const t = node.textContent?.trim();
            if (t) nodes.push(<Text key={key++} style={{ fontSize: ctx.fontSize, color: '#4B5563' }}>{t}</Text>);
        }
    });
    return nodes;
}

// Legacy Markdown parser (kept for backward compatibility with old tasks)
const renderMarkdownContent = (text: string, baseFontSize = 14) => {
    if (!text) return null;
    if (isHtmlContent(text)) return renderHtmlNodes(text, { fontSize: baseFontSize });
    const lines = text.split('\n');
    return lines.map((line, lineIdx) => {
        const trimmed = line.trim();
        if (!trimmed) return <View key={lineIdx} style={{ height: baseFontSize * 0.3 }} />;

        // Headers
        if (trimmed.startsWith('# ')) return <Text key={lineIdx} style={{ fontSize: baseFontSize + 8, fontWeight: 'bold', color: '#111827', marginTop: baseFontSize * 0.5, marginBottom: baseFontSize * 0.2 }}>{trimmed.substring(2)}</Text>;
        if (trimmed.startsWith('## ')) return <Text key={lineIdx} style={{ fontSize: baseFontSize + 4, fontWeight: 'bold', color: '#111827', marginTop: baseFontSize * 0.4, marginBottom: baseFontSize * 0.2 }}>{trimmed.substring(3)}</Text>;
        if (trimmed.startsWith('### ')) return <Text key={lineIdx} style={{ fontSize: baseFontSize + 1, fontWeight: 'bold', color: '#1f2937', marginTop: baseFontSize * 0.3, marginBottom: baseFontSize * 0.2 }}>{trimmed.substring(4)}</Text>;

        // Lists
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            const listContent = trimmed.substring(2);
            const parts = listContent.split(/(\*\*.*?\*\*)/g).filter(Boolean);

            return (
                <View key={lineIdx} style={{ flexDirection: 'row', marginBottom: baseFontSize * 0.1, paddingLeft: 12 }}>
                    <Text style={{ width: 12, fontSize: baseFontSize, color: '#4B5563', paddingTop: 0 }}>•</Text>
                    <Text style={{ flex: 1, fontSize: baseFontSize, color: '#4B5563', lineHeight: 1.2 }}>
                        {parts.map((p, i) => {
                            if (p.startsWith('**') && p.endsWith('**')) return <Text key={i} style={{ fontWeight: 'bold', color: '#111827' }}>{p.slice(2, -2)}</Text>;
                            return p;
                        })}
                    </Text>
                </View>
            );
        }

        // Paragraphs with Bold
        const parts = line.split(/(\*\*.*?\*\*)/g).filter(Boolean);
        return (
            <Text key={lineIdx} style={{ fontSize: baseFontSize, color: '#4B5563', lineHeight: 1.25, marginBottom: baseFontSize * 0.2 }}>
                {parts.map((part, pIdx) => {
                    if (part.startsWith('**') && part.endsWith('**')) {
                        return <Text key={pIdx} style={{ fontWeight: 'bold', color: '#111827' }}>{part.slice(2, -2)}</Text>;
                    }
                    return part;
                })}
            </Text>
        );
    });
};

interface BlockRendererProps {
    block: TemplateBlock;
    project: Project;
    tasks: Task[];
    allProjectTasks?: Task[];
    taskTypes?: TaskType[];
    period: string;
    startDate?: string;
    endDate?: string;
    key: string;
}

const getBlockRangeDates = (block: TemplateBlock, baseStartDate?: string, baseEndDate?: string, allTasks: Task[] = []) => {
    const dateRange = block.props.dateRange || 'export';
    let minDate: dayjs.Dayjs;
    let maxDate: dayjs.Dayjs;

    if (dateRange === 'export') {
        minDate = baseStartDate ? dayjs(baseStartDate) : dayjs(Math.min(...allTasks.map(t => dayjs(t.startDate).valueOf())));
        maxDate = baseEndDate ? dayjs(baseEndDate) : dayjs(Math.max(...allTasks.map(t => dayjs(t.startDate).add(t.duration, 'day').valueOf())));
    } else if (dateRange === 'month') {
        const base = baseStartDate ? dayjs(baseStartDate) : dayjs();
        const y = block.props.specificYear === 'current' ? dayjs().year() : (block.props.specificYear !== undefined && block.props.specificYear !== '' ? parseInt(block.props.specificYear) : base.year());
        const m = block.props.specificMonth === 'current' ? dayjs().month() : (block.props.specificMonth !== undefined && block.props.specificMonth !== '' ? parseInt(block.props.specificMonth) : base.month());
        minDate = dayjs(new Date(y, m, 1)).startOf('month');
        maxDate = minDate.clone().endOf('month');
    } else if (dateRange === 'quarter') {
        const base = baseStartDate ? dayjs(baseStartDate) : dayjs();
        const y = block.props.specificYear === 'current' ? dayjs().year() : (block.props.specificYear !== undefined && block.props.specificYear !== '' ? parseInt(block.props.specificYear) : base.year());
        let quarterStartMonth: number;
        if (block.props.specificQuarter === 'current') {
            quarterStartMonth = Math.floor(dayjs().month() / 3) * 3;
        } else if (block.props.specificQuarter !== undefined && block.props.specificQuarter !== '') {
            quarterStartMonth = (parseInt(block.props.specificQuarter) - 1) * 3;
        } else {
            quarterStartMonth = Math.floor(base.month() / 3) * 3;
        }
        minDate = dayjs(new Date(y, quarterStartMonth, 1)).startOf('month');
        maxDate = minDate.clone().add(2, 'month').endOf('month');
    } else if (dateRange === 'year') {
        const base = baseStartDate ? dayjs(baseStartDate) : dayjs();
        const y = block.props.specificYear === 'current' ? dayjs().year() : (block.props.specificYear !== undefined && block.props.specificYear !== '' ? parseInt(block.props.specificYear) : base.year());
        minDate = dayjs(new Date(y, 0, 1)).startOf('year');
        maxDate = dayjs(new Date(y, 0, 1)).endOf('year');
    } else {
        minDate = baseStartDate ? dayjs(baseStartDate) : dayjs(Math.min(...allTasks.map(t => dayjs(t.startDate).valueOf())));
        maxDate = baseEndDate ? dayjs(baseEndDate) : dayjs(Math.max(...allTasks.map(t => dayjs(t.startDate).add(t.duration, 'day').valueOf())));
    }

    return { minDate, maxDate };
};

const BlockRenderer = ({ block, project, tasks, allProjectTasks, taskTypes, period, startDate, endDate }: BlockRendererProps) => {
    if (block.type === 'TITLE_PAGE') {
        const { showSubtitle } = block.props;
        return (
            <Page size="A4" orientation="landscape" style={styles.page}>
                <View style={styles.titlePageDetails}>
                    <Text style={styles.mainTitle}>{project.name}</Text>
                    {showSubtitle && <Text style={styles.subtitle}>{period}</Text>}
                </View>
            </Page>
        );
    }

    if (block.type === 'STATS') {
        const { showCompleted = true, showProgress = true, showTotalTasks = true, showInProgress = true, showHoldTasks = true } = block.props;

        const totalTasks = tasks.length;
        const completedTasks = tasks.filter(t => t.progress === 100 || t.status === 'done').length;
        const holdTasks = tasks.filter(t => t.status === 'hold').length;
        const inProgressTasks = totalTasks - completedTasks - holdTasks;
        const overallProgress = totalTasks === 0 ? 0 : Math.round(tasks.reduce((sum, t) => sum + t.progress, 0) / totalTasks);

        return (
            <Page size="A4" orientation="landscape" style={styles.page}>
                <Text style={styles.header}>{i18n.t('pdf.progressOverview')}</Text>
                <View style={styles.statsContainer}>
                    {showTotalTasks && (
                        <View style={styles.statBox}>
                            <Text style={styles.statNumber}>{totalTasks}</Text>
                            <Text style={styles.statLabel}>{i18n.t('pdf.totalTasks')}</Text>
                        </View>
                    )}
                    {showProgress && (
                        <View style={styles.statBox}>
                            <Text style={styles.statNumber}>{overallProgress}%</Text>
                            <Text style={styles.statLabel}>{i18n.t('pdf.overallCompletion')}</Text>
                        </View>
                    )}
                    {showCompleted && (
                        <View style={styles.statBox}>
                            <Text style={styles.statNumber}>{completedTasks}</Text>
                            <Text style={styles.statLabel}>{i18n.t('pdf.tasksCompleted')}</Text>
                        </View>
                    )}
                    {showInProgress && (
                        <View style={styles.statBox}>
                            <Text style={styles.statNumber}>{inProgressTasks}</Text>
                            <Text style={styles.statLabel}>{i18n.t('pdf.tasksInProgress')}</Text>
                        </View>
                    )}
                    {showHoldTasks && (
                        <View style={styles.statBox}>
                            <Text style={styles.statNumber}>{holdTasks}</Text>
                            <Text style={styles.statLabel}>{i18n.t('pdf.tasksOnHold')}</Text>
                        </View>
                    )}
                </View>
            </Page>
        );
    }

    if (block.type === 'TASKS_LIST') {
        const groups: Record<string, Task[]> = { 'no-type': [] };
        taskTypes?.forEach(tt => groups[tt.id] = []);
        tasks.forEach(t => {
            if (t.taskTypeId && groups[t.taskTypeId]) groups[t.taskTypeId].push(t);
            else groups['no-type'].push(t);
        });

        const entries = Object.entries(groups).filter(([_, gt]) => gt.length > 0);

        return (
            <Page size="A4" orientation="landscape" style={styles.page}>
                <Text style={styles.header}>{i18n.t('pdf.progressOverview')}</Text>
                <View style={{ marginTop: 10, flex: 1 }}>
                    {entries.map(([typeId, groupTasks]) => {
                        const taskType = taskTypes?.find(tt => tt.id === typeId);
                        return (
                            <View key={typeId} style={{ marginBottom: 15 }}>
                                <View style={{ backgroundColor: '#F3F4F6', paddingHorizontal: 10, paddingVertical: 4, borderLeftWidth: 3, borderLeftColor: taskType?.color || '#94a3b8', marginBottom: 5 }}>
                                    <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#4B5563', textTransform: 'uppercase' }}>
                                        {taskType?.name || i18n.t('taskEdit.noType', 'Без типа')} ({groupTasks.length})
                                    </Text>
                                </View>
                                {groupTasks.map((task) => (
                                    <View key={task.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#E5E7EB', alignItems: 'center', marginLeft: 10, minHeight: 32 }}>
                                        <Text style={{ fontSize: 13, color: '#374151', flex: 1, paddingRight: 10 }}>
                                            {task.title.replace(/^Задача\s*№?\s*\d+\s*:\s*/i, '')}
                                        </Text>
                                        <View style={{ backgroundColor: getPdfStatusColor(task.status).bg, borderColor: getPdfStatusColor(task.status).border, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, width: 90, alignItems: 'center' }}>
                                            <Text style={{ fontSize: 9, fontWeight: 'bold', color: getPdfStatusColor(task.status).text, textTransform: 'uppercase' }}>
                                                {task.status ? i18n.t(`pdf.${task.status}`) : i18n.t('pdf.backlog')}
                                            </Text>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        );
                    })}
                </View>
            </Page>
        );
    }

    if (block.type === 'TASK_DETAIL') {
        const { includeDescription, includeSteps } = block.props;
        const { minDate, maxDate } = getBlockRangeDates(block, startDate, endDate, allProjectTasks || tasks);
        const filteredTasks = (allProjectTasks || tasks).filter((t: Task) => {
            const tStart = dayjs(t.startDate);
            const tEnd = dayjs(t.startDate).add(t.duration, 'day');
            return tStart.isBefore(maxDate) && tEnd.isAfter(minDate);
        });

        return (
            <>
                {filteredTasks.map((task) => (
                    <Page key={task.id} size="A4" orientation="landscape" style={styles.page}>
                        <View style={{ borderBottomWidth: 1, borderBottomColor: '#E5E7EB', paddingBottom: 10, marginBottom: 12 }}>
                            <Text style={{ fontSize: 20, color: '#111827', fontWeight: 'bold' }}>
                                {task.title.replace(/^Задача\s*№?\s*\d+\s*:\s*/i, '')}
                            </Text>
                            {(() => {
                                const taskType = taskTypes?.find(tt => tt.id === task.taskTypeId);
                                if (!taskType) return null;
                                return (
                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                                        <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: taskType.color, marginRight: 4 }} />
                                        <Text style={{ fontSize: 9, color: '#6B7280', fontWeight: 'medium' }}>
                                            {taskType.name}
                                        </Text>
                                    </View>
                                );
                            })()}
                        </View>

                        <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10, paddingRight: 40 }}>
                                <View>
                                    <Text style={{ fontSize: 10, color: '#6B7280', marginBottom: 2 }}>{i18n.t('pdf.startDate')}</Text>
                                    <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#111827' }}>{dayjs(task.startDate).format('MMMM D, YYYY')}</Text>
                                </View>
                                <View>
                                    <Text style={{ fontSize: 10, color: '#6B7280', marginBottom: 2 }}>{i18n.t('pdf.duration')}</Text>
                                    <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#111827' }}>{task.duration} {task.duration === 1 ? i18n.t('pdf.durationDay') : i18n.t('pdf.durationDays')}</Text>
                                </View>
                                <View>
                                    <Text style={{ fontSize: 10, color: '#6B7280', marginBottom: 2 }}>{i18n.t('pdf.targetDate')}</Text>
                                    <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#111827' }}>{dayjs(task.startDate).add(task.duration, 'day').format('MMMM D, YYYY')}</Text>
                                </View>
                                <View>
                                    <Text style={{ fontSize: 10, color: '#6B7280', marginBottom: 2 }}>{i18n.t('pdf.status')}</Text>
                                    <View style={{ backgroundColor: getPdfStatusColor(task.status).bg, borderColor: getPdfStatusColor(task.status).border, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                        <Text style={{ fontSize: 10, fontWeight: 'bold', color: getPdfStatusColor(task.status).text, textTransform: 'uppercase' }}>
                                            {task.status ? i18n.t(`pdf.${task.status}`) : i18n.t('pdf.backlog')}
                                        </Text>
                                    </View>
                                </View>
                            </View>

                            <View style={{ marginBottom: 16, backgroundColor: '#FFFFFF', padding: 8, paddingHorizontal: 12, borderRadius: 6, borderWidth: 1, borderColor: '#E5E7EB', flexDirection: 'row', alignItems: 'center' }}>
                                <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#374151', marginRight: 12 }}>{i18n.t('pdf.progressStatus')}: <Text style={{ color: '#4F46E5' }}>{task.progress}%</Text></Text>
                                <View style={{ flex: 1, height: 6, backgroundColor: '#E5E7EB', borderRadius: 3 }}>
                                    <View style={{ height: '100%', backgroundColor: getPdfStatusColor(task.status).bar, borderRadius: 3, width: `${task.progress}%` }} />
                                </View>
                            </View>

                            {(() => {
                                let steps: any[] = [];
                                try { steps = task.steps ? JSON.parse(task.steps) : []; } catch (e) { }
                                const showSteps = includeSteps && steps.length > 0;
                                const hasDesc = includeDescription && !!task.description;

                                if (!hasDesc && !showSteps) return null;

                                // --- Dynamic font size for description ---
                                // A4 landscape: 842×595pt, page padding 40pt each side → available height ~515pt
                                // Fixed UI above description: title ~32pt + meta ~28pt + progress ~28pt + gaps ~16pt ≈ 104pt
                                // Section header "Описание" + padding ≈ 24pt, description box padding 20pt
                                // So available for description text lines ≈ 515 - 104 - 44 = ~367pt
                                const AVAILABLE_HEIGHT_FOR_TEXT = 367;

                                // Estimate effective line count of the description
                                const estimateLines = (text: string, fSize: number): number => {
                                    // Approximate chars per line based on available column width.
                                    // A4 landscape content width ≈ 762pt; with steps col taking ~40%, desc col ~60% → ~457pt
                                    // At fSize pt, approx chars per line = 457 / (fSize * 0.55)
                                    const colWidth = showSteps ? 457 : 762;
                                    const charsPerLine = Math.max(20, Math.floor(colWidth / (fSize * 0.55)));
                                    let lineCount = 0;
                                    (text || '').split('\n').forEach(rawLine => {
                                        const trimmed = rawLine.trim();
                                        if (!trimmed) { lineCount += 0.4; return; } // blank line = small gap
                                        // Headers are bigger, so they count a bit more
                                        const isH1 = trimmed.startsWith('# ');
                                        const isH2 = trimmed.startsWith('## ');
                                        const isH3 = trimmed.startsWith('### ');
                                        const sizeMultiplier = isH1 ? 1.7 : isH2 ? 1.4 : isH3 ? 1.15 : 1;
                                        const effectiveChars = trimmed.length;
                                        const wrappedLines = Math.ceil(effectiveChars / (charsPerLine / sizeMultiplier));
                                        lineCount += Math.max(1, wrappedLines) * sizeMultiplier;
                                    });
                                    return lineCount;
                                };

                                // Binary-search for the largest font size that fits
                                let bestFontSize = 7;
                                for (let fs = 12; fs >= 7; fs--) {
                                    // lineHeight multiplier matches rendering (1.25 for text, 1.2 for lists)
                                    const lineHeight = fs * 1.25;
                                    const totalHeight = estimateLines(task.description || '', fs) * lineHeight;
                                    if (totalHeight <= AVAILABLE_HEIGHT_FOR_TEXT) {
                                        bestFontSize = fs;
                                        break;
                                    }
                                }
                                const descFontSize = bestFontSize;

                                return (
                                    <View style={{ flexDirection: 'row', width: '100%' }}>
                                        {hasDesc && (
                                            <View style={{ flex: showSteps ? 3 : 1, paddingRight: showSteps ? 20 : 0 }}>
                                                <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#111827', marginBottom: 6 }}>{i18n.t('pdf.description')}</Text>
                                                <View style={{ backgroundColor: '#FFFFFF', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB' }}>
                                                    {renderMarkdownContent(task.description || '', descFontSize)}
                                                </View>
                                            </View>
                                        )}
                                        {showSteps && (
                                            <View style={{ flex: hasDesc ? 2 : 1 }}>
                                                <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#111827', marginBottom: 6 }}>{i18n.t('pdf.steps')}</Text>
                                                <View style={{ marginLeft: 30 }}>
                                                    {steps.map((step, stepIdx) => {
                                                        const isCompleted = step.completed;
                                                        const hasCompletedAfter = steps.slice(stepIdx + 1).some((s: any) => s.completed);
                                                        const isMissed = !isCompleted && hasCompletedAfter;
                                                        const currentStepIndex = steps.findIndex((s: any) => !s.completed);
                                                        const isCurrent = stepIdx === currentStepIndex && !hasCompletedAfter;
                                                        const isLast = stepIdx === steps.length - 1;

                                                        const dotBgColor = isMissed ? '#EF4444' : (isCompleted || isCurrent ? '#111827' : '#FFFFFF');
                                                        const dotBorderColor = isMissed ? '#EF4444' : (isCompleted || isCurrent ? '#111827' : '#D1D5DB');
                                                        const textColor = isMissed ? '#EF4444' : (isCompleted || isCurrent ? '#111827' : '#6B7280');
                                                        const numColor = isMissed ? '#EF4444' : (isCompleted || isCurrent ? '#111827' : '#9CA3AF');

                                                        return (
                                                            <View key={step.id || stepIdx} style={{ flexDirection: 'row' }} wrap={false}>
                                                                <View style={{ width: 20, alignItems: 'center', position: 'relative' }}>
                                                                    <Text style={{ position: 'absolute', left: -25, top: 0, fontSize: 11, fontWeight: 'bold', color: numColor }}>{(stepIdx + 1).toString().padStart(2, '0')}</Text>
                                                                    {!isLast && <View style={{ position: 'absolute', top: 16, bottom: -4, width: 2, backgroundColor: isCompleted ? '#111827' : '#E5E7EB', zIndex: 0 }} />}
                                                                    <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: dotBgColor, borderColor: dotBorderColor, borderWidth: 2, zIndex: 1, marginTop: 2 }} />
                                                                </View>
                                                                <View style={{ flex: 1, paddingLeft: 10, paddingBottom: 12, flexDirection: 'row', alignItems: 'flex-start' }}>
                                                                    <Text style={{ fontSize: 12, color: textColor, fontWeight: isCurrent || isMissed ? 'bold' : 'normal' }}>{step.text}</Text>
                                                                </View>
                                                            </View>
                                                        );
                                                    })}
                                                </View>
                                            </View>
                                        )}
                                    </View>
                                );
                            })()}
                        </View>
                    </Page>
                ))}
            </>
        );
    }

    if (block.type === 'ROADMAP') {
        const sortedTasks = allProjectTasks || tasks;
        if (sortedTasks.length === 0) return null;

        const { minDate, maxDate } = getBlockRangeDates(block, startDate, endDate, sortedTasks);

        let totalDays = maxDate.diff(minDate, 'day');
        if (isNaN(totalDays) || totalDays < 1) totalDays = 1;
        const edgeLabelFormat = totalDays > 180 ? 'MMM D' : 'MMM D, YYYY';

        const timelineMarkers: Array<{ label: string, percent: number }> = [];
        let currentMarker = minDate.clone().startOf('month');
        if (currentMarker.isBefore(minDate) || currentMarker.isSame(minDate, 'day')) {
            currentMarker = currentMarker.add(1, 'month');
        }

        while (currentMarker.isBefore(maxDate)) {
            const daysOffset = currentMarker.diff(minDate, 'day');
            const percent = isNaN(daysOffset) || isNaN(totalDays) ? 0 : (daysOffset / totalDays) * 100;
            if (percent > 2 && percent < 98) {
                const labelFormat = totalDays > 180 ? 'MMM' : 'MMM YYYY';
                const labelText = percent > 88 ? '' : currentMarker.format(labelFormat);
                timelineMarkers.push({ label: labelText, percent: percent });
            }
            currentMarker = currentMarker.add(1, 'month');
        }

        // Only render tasks that overlap with the calculated min/max of the roadmap block
        const roadmapTasks = sortedTasks.filter((t: Task) => {
            const tStart = dayjs(t.startDate);
            const tEnd = dayjs(t.startDate).add(t.duration, 'day');
            return tStart.isBefore(maxDate) && tEnd.isAfter(minDate);
        });

        return (
            <Page size="A4" orientation="landscape" style={styles.page}>
                <Text style={styles.header}>{i18n.t('pdf.projectRoadmap')} - {getRoadmapPeriodLabel(minDate, maxDate)}</Text>
                <View style={styles.roadmapContainer}>
                    <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', paddingBottom: 6, marginBottom: 12, alignItems: 'flex-end' }}>
                        <View style={{ width: 180 }}>
                            <Text style={{ fontSize: 7, color: '#9CA3AF', fontWeight: 'bold', textTransform: 'uppercase' }}>{i18n.t('taskEdit.title')}</Text>
                        </View>
                        <View style={{ width: 85 }}>
                            <Text style={{ fontSize: 7, color: '#9CA3AF', fontWeight: 'bold', textTransform: 'uppercase' }}>{i18n.t('pdf.status')}</Text>
                        </View>
                        <View style={{ width: 465, position: 'relative', height: 16, overflow: 'hidden' }}>
                            <Text style={{ position: 'absolute', left: 4, bottom: 2, fontSize: 8, color: '#9CA3AF' }}>{minDate.format(edgeLabelFormat)}</Text>
                            <Text style={{ position: 'absolute', right: 4, bottom: 2, fontSize: 8, color: '#9CA3AF' }}>{maxDate.format(edgeLabelFormat)}</Text>

                            {timelineMarkers.map((m, idx) => (
                                <View key={idx} style={{ position: 'absolute', left: `${m.percent}%`, top: 0, paddingLeft: 4, borderLeftWidth: 1, borderLeftColor: '#D1D5DB', height: 16 }}>
                                    <Text style={{ fontSize: 10, color: '#6B7280', paddingTop: 2 }}>{m.label}</Text>
                                </View>
                            ))}
                        </View>
                    </View>

                    {(() => {
                        const groupByType = block.props.groupByType ?? false;
                        
                        const renderTaskRow = (task: Task) => {
                            const startOffset = dayjs(task.startDate).diff(minDate, 'day');
                            const leftPercentRaw = isNaN(totalDays) ? 0 : (startOffset / totalDays) * 100;
                            const widthPercentRaw = isNaN(totalDays) ? 0 : (task.duration / totalDays) * 100;

                            const endPercentRaw = leftPercentRaw + widthPercentRaw;
                            const absoluteProgressEndPercent = leftPercentRaw + widthPercentRaw * (task.progress / 100);

                            const startPercent = Math.max(0, Math.min(100, leftPercentRaw || 0));
                            const endPercent = Math.max(0, Math.min(100, endPercentRaw || 0));
                            const clampedWidthPercent = endPercent - startPercent;

                            const progressEndPercent = Math.max(0, Math.min(100, absoluteProgressEndPercent || 0));
                            const clampedProgressWidthPercent = Math.max(0, progressEndPercent - startPercent);

                            if (clampedWidthPercent <= 0) return null;

                            const isCutLeft = leftPercentRaw < 0;
                            const isCutRight = endPercentRaw > 100;
                            const isProgressCutRight = absoluteProgressEndPercent > 100;

                            const bgBorderRadii = {
                                borderTopLeftRadius: isCutLeft ? 0 : 4,
                                borderBottomLeftRadius: isCutLeft ? 0 : 4,
                                borderTopRightRadius: isCutRight ? 0 : 4,
                                borderBottomRightRadius: isCutRight ? 0 : 4,
                            };

                            const fgBorderRadii = {
                                borderTopLeftRadius: isCutLeft ? 0 : 4,
                                borderBottomLeftRadius: isCutLeft ? 0 : 4,
                                borderTopRightRadius: isProgressCutRight ? 0 : 4,
                                borderBottomRightRadius: isProgressCutRight ? 0 : 4,
                            };

                            return (
                                <View key={task.id} style={styles.roadmapRow} wrap={false}>
                                    <View style={styles.roadmapTaskTitle}>
                                        <Text style={styles.roadmapTaskTitleText}>{task.title.replace(/^Задача\s*№?\s*\d+\s*:\s*/i, '')}</Text>
                                    </View>
                                    <View style={styles.roadmapTaskStatus}>
                                        <View style={{ backgroundColor: getPdfStatusColor(task.status).bg, borderColor: getPdfStatusColor(task.status).border, borderWidth: 1, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 2, alignSelf: 'flex-start' }}>
                                            <Text style={{ fontSize: 7, fontWeight: 'bold', color: getPdfStatusColor(task.status).text, textTransform: 'uppercase' }}>
                                                {task.status ? i18n.t(`pdf.${task.status}`) : i18n.t('pdf.backlog')}
                                            </Text>
                                        </View>
                                    </View>
                                    <View style={styles.roadmapTimeline}>
                                        {timelineMarkers.map((m, idx) => (
                                            <View key={`grid-${idx}`} style={{ position: 'absolute', left: `${m.percent}%`, top: 0, height: '100%', width: 1, backgroundColor: '#E5E7EB', zIndex: 0 }} />
                                        ))}
                                        <View style={[styles.roadmapBar, { left: `${startPercent}%`, width: `${Math.max(1, clampedWidthPercent)}%`, backgroundColor: getPdfStatusColor(task.status).bar, ...bgBorderRadii }]} />
                                        {clampedProgressWidthPercent > 0 && (
                                            <View style={[styles.roadmapBar, { left: `${startPercent}%`, width: `${Math.max(1, clampedProgressWidthPercent)}%`, backgroundColor: 'rgba(0,0,0,0.2)', ...fgBorderRadii }]} />
                                        )}
                                    </View>
                                </View>
                            );
                        };

                        if (groupByType) {
                            const groups: Record<string, Task[]> = { 'no-type': [] };
                            taskTypes?.forEach(tt => groups[tt.id] = []);
                            roadmapTasks.forEach(t => {
                                if (t.taskTypeId && groups[t.taskTypeId]) {
                                    groups[t.taskTypeId].push(t);
                                } else {
                                    groups['no-type'].push(t);
                                }
                            });

                            const activeEntries = Object.entries(groups).filter(([_, g]) => g.length > 0);
                            return activeEntries.map(([typeId, groupTasks]) => {
                                const type = taskTypes?.find(tt => tt.id === typeId);
                                return (
                                    <View key={typeId} style={{ marginBottom: 16 }}>
                                        <View style={styles.roadmapGroupHeader}>
                                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: type?.color || '#94a3b8' }} />
                                            <Text style={styles.roadmapGroupTitle}>{type?.name || i18n.t('taskEdit.noType')}</Text>
                                        </View>
                                        {groupTasks.map(t => renderTaskRow(t))}
                                    </View>
                                );
                            });
                        }

                        return roadmapTasks.map(t => renderTaskRow(t));
                    })()}
                </View>
            </Page>
        );
    }

    if (block.type === 'TEXT') {
        const { title, content } = block.props;

        return (
            <Page size="A4" orientation="landscape" style={styles.page}>
                {title && <Text style={styles.header}>{title}</Text>}
                <View style={{ flex: 1, backgroundColor: '#FFFFFF', padding: 24, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB' }}>
                    {renderMarkdownContent(content)}
                </View>
            </Page>
        );
    }

    if (block.type === 'TYPE_SUMMARY') {
        const typeStats: Record<string, { count: number, duration: number, color: string, name: string }> = {};

        // Initialize with all types for this project
        taskTypes?.forEach(tt => {
            typeStats[tt.id] = { count: 0, duration: 0, color: tt.color, name: tt.name };
        });
        typeStats['no-type'] = { count: 0, duration: 0, color: '#94a3b8', name: i18n.t('taskEdit.noType') };

        let totalDuration = 0;
        tasks.forEach(t => {
            const tid = t.taskTypeId && typeStats[t.taskTypeId] ? t.taskTypeId : 'no-type';
            typeStats[tid].count += 1;
            typeStats[tid].duration += t.duration || 0;
            totalDuration += t.duration || 0;
        });

        const activeStats = Object.values(typeStats).filter(s => s.count > 0);
        // Sort by duration descending
        activeStats.sort((a, b) => b.duration - a.duration);

        return (
            <Page size="A4" orientation="landscape" style={styles.page}>
                <Text style={styles.header}>{i18n.t('pdf.typeSummaryTitle')}</Text>
                
                <View style={{ flexDirection: 'row', gap: 20, flex: 1, alignItems: 'flex-start' }}>
                    {/* Table (Left side) */}
                    <View style={{ flex: 1, backgroundColor: '#FFFFFF', borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB', overflow: 'hidden' }}>
                        {/* Table Header */}
                        <View style={{ flexDirection: 'row', backgroundColor: '#F9FAFB', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', padding: 8, borderTopLeftRadius: 7, borderTopRightRadius: 7 }}>
                            <Text style={{ flex: 3, fontSize: 10, fontWeight: 'bold', color: '#374151' }}>{i18n.t('pdf.typeColumn')}</Text>
                            <Text style={{ flex: 1, fontSize: 10, fontWeight: 'bold', color: '#374151', textAlign: 'center' }}>{i18n.t('pdf.countColumn')}</Text>
                            <Text style={{ flex: 1, fontSize: 10, fontWeight: 'bold', color: '#374151', textAlign: 'right' }}>{i18n.t('pdf.timePercentColumn')}</Text>
                        </View>

                        {/* Table Body */}
                        {activeStats.map((stat, idx) => {
                            const percent = totalDuration === 0 ? 0 : (stat.duration / totalDuration) * 100;
                            return (
                                <View key={idx} style={{ flexDirection: 'row', borderBottomWidth: idx === activeStats.length - 1 ? 0 : 1, borderBottomColor: '#F3F4F6', padding: 8, alignItems: 'center' }}>
                                    <View style={{ flex: 3, flexDirection: 'row', alignItems: 'center' }}>
                                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: stat.color, marginRight: 8 }} />
                                        <Text style={{ fontSize: 10, color: '#111827' }}>{stat.name}</Text>
                                    </View>
                                    <Text style={{ flex: 1, fontSize: 10, color: '#4B5563', textAlign: 'center' }}>{stat.count}</Text>
                                    <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' }}>
                                        <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#111827' }}>{percent.toFixed(2)}%</Text>
                                    </View>
                                </View>
                            );
                        })}
                    </View>

                    {/* Chart (Right side) */}
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB', padding: 20, height: '100%' }}>
                        <DonutChart data={activeStats.map(s => ({
                            percent: totalDuration === 0 ? 0 : (s.duration / totalDuration) * 100,
                            color: s.color
                        }))} />
                        
                        <View style={{ marginTop: 20, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 }}>
                            {activeStats.map((stat, idx) => {
                                const percent = totalDuration === 0 ? 0 : (stat.duration / totalDuration) * 100;
                                return (
                                    <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: stat.color }} />
                                        <Text style={{ fontSize: 8, color: '#6B7280' }}>{stat.name} ({percent.toFixed(1)}%)</Text>
                                    </View>
                                );
                            })}
                        </View>
                    </View>
                </View>
            </Page>
        );
    }

    return null;
}

interface DynamicPdfRendererProps {
    project: Project;
    tasks: Task[];
    allProjectTasks?: Task[];
    taskTypes?: TaskType[];
    period: string; // e.g. "Q1 January"
    startDate?: string;
    endDate?: string;
    blocksJson: string; // The templates' JSON blocks string
}

export const DynamicPdfRenderer = ({ project, tasks, allProjectTasks, taskTypes, period, startDate, endDate, blocksJson }: DynamicPdfRendererProps) => {
    let parsedBlocks: TemplateBlock[] = [];
    try {
        parsedBlocks = JSON.parse(blocksJson);
    } catch (e) {
        console.error("Failed to parse blocks config", e);
    }

    // Default basic layout if parsing fails or blocks are empty
    if (parsedBlocks.length === 0) {
        parsedBlocks = [
            { id: '1', type: 'TITLE_PAGE', props: { showSubtitle: true } },
            { id: '2', type: 'STATS', props: { showCompleted: true, showProgress: true } },
            { id: '3', type: 'TASKS_LIST', props: {} }
        ];
    }

    return (
        <Document>
            {parsedBlocks.map((block, idx) => (
                <BlockRenderer
                    key={`${block.id}-${idx}`}
                    block={block}
                    project={project}
                    tasks={tasks}
                    allProjectTasks={allProjectTasks}
                    taskTypes={taskTypes}
                    period={period}
                    startDate={startDate}
                    endDate={endDate}
                />
            ))}
        </Document>
    );
};
