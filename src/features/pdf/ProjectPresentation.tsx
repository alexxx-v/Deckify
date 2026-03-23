import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import { Project, Task, TaskStatus } from '@/db/schema';
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

// Register fonts
Font.register({
    family: 'Roboto',
    fonts: [
        { src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-regular-webfont.ttf' },
        { src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-bold-webfont.ttf', fontWeight: 'bold' }
    ]
});

const styles = StyleSheet.create({
    page: {
        flexDirection: 'column',
        backgroundColor: '#FAFAFA',
        padding: 40,
        fontFamily: 'Roboto',
    },
    titlePageDetails: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    mainTitle: {
        fontSize: 48,
        fontWeight: 'bold',
        color: '#111827',
        marginBottom: 16,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 24,
        color: '#6B7280',
        textAlign: 'center',
    },
    header: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#111827',
        marginBottom: 24,
        borderBottomWidth: 2,
        borderBottomColor: '#E5E7EB',
        paddingBottom: 10,
    },
    section: {
        margin: 10,
        padding: 10,
        flexGrow: 1
    },
    statsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginTop: 10,
        marginBottom: 20,
        padding: 20,
        backgroundColor: '#FFFFFF',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    statBox: {
        alignItems: 'center',
    },
    statNumber: {
        fontSize: 48,
        fontWeight: 'bold',
        color: '#4F46E5', // Indigo-600
    },
    statLabel: {
        fontSize: 16,
        color: '#6B7280',
        marginTop: 8,
    },
    taskRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
        paddingVertical: 12,
        alignItems: 'center',
    },
    taskTitleContainer: {
        flex: 2,
        paddingRight: 8,
    },
    taskTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#374151',
    },
    taskDescription: {
        fontSize: 10,
        color: '#6B7280',
        marginTop: 4,
    },
    taskDates: {
        flex: 1,
        fontSize: 12,
        color: '#6B7280',
    },
    taskProgressContainer: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
    },
    progressBarBg: {
        flex: 1,
        height: 8,
        backgroundColor: '#E5E7EB',
        borderRadius: 4,
        marginRight: 8,
    },
    progressBarFill: {
        height: '100%',
        backgroundColor: '#4F46E5',
        borderRadius: 4,
    },
    progressText: {
        fontSize: 12,
        width: 30,
        textAlign: 'right',
    },
    roadmapContainer: {
        marginTop: 20,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 8,
        padding: 16,
        backgroundColor: '#FFFFFF',
    },
    roadmapHeader: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
        paddingBottom: 8,
        marginBottom: 8,
    },
    roadmapHeaderCell: {
        flex: 1,
        fontSize: 10,
        color: '#6B7280',
        textAlign: 'center',
    },
    roadmapRow: {
        flexDirection: 'row',
        marginBottom: 8,
        alignItems: 'center',
        height: 24,
    },
    roadmapTaskTitle: {
        width: 180,
        fontSize: 10,
        paddingRight: 8,
    },
    roadmapTimeline: {
        flex: 1,
        height: 20,
        backgroundColor: '#F3F4F6',
        borderRadius: 4,
        position: 'relative',
    },
    roadmapBar: {
        position: 'absolute',
        height: 12,
        top: 4,
        backgroundColor: '#4F46E5',
        borderRadius: 4,
    }
});

interface PdfDocumentProps {
    project: Project;
    tasks: Task[];
    period: string; // e.g. "Q1 January"
    startDate?: string;
    endDate?: string;
}

export const ProjectPresentation = ({ project, tasks, period, startDate, endDate }: PdfDocumentProps) => {
    const completedTasks = tasks.filter(t => t.progress === 100).length;
    const totalTasks = tasks.length;
    const overallProgress = totalTasks === 0 ? 0 :
        Math.round(tasks.reduce((sum, t) => sum + t.progress, 0) / totalTasks);

    // Roadmap logic
    const sortedTasks = tasks;
    const minDate = startDate ? dayjs(startDate) : (sortedTasks.length > 0 ? dayjs(Math.min(...sortedTasks.map(t => dayjs(t.startDate).valueOf()))) : dayjs());
    const maxDate = endDate ? dayjs(endDate) : (sortedTasks.length > 0
        ? dayjs(Math.max(...sortedTasks.map(t => dayjs(t.startDate).add(t.duration, 'day').valueOf())))
        : dayjs().add(30, 'day'));

    const totalDays = Math.max(1, maxDate.diff(minDate, 'day'));
    const edgeLabelFormat = totalDays > 180 ? 'MMM D' : 'MMM D, YYYY';

    const timelineMarkers: Array<{ label: string, percent: number }> = [];
    let currentMarker = minDate.clone().startOf('month');
    if (currentMarker.isBefore(minDate) || currentMarker.isSame(minDate, 'day')) {
        currentMarker = currentMarker.add(1, 'month');
    }

    while (currentMarker.isBefore(maxDate)) {
        const daysOffset = currentMarker.diff(minDate, 'day');
        const percent = (daysOffset / totalDays) * 100;
        if (percent > 2 && percent < 98) {
            const labelFormat = totalDays > 180 ? 'MMM' : 'MMM YYYY';
            const labelText = percent > 88 ? '' : currentMarker.format(labelFormat);
            timelineMarkers.push({
                label: labelText,
                percent: percent
            });
        }
        currentMarker = currentMarker.add(1, 'month');
    }

    return (
        <Document>
            {/* Slide 1: Title */}
            <Page size="A4" orientation="landscape" style={styles.page}>
                <View style={styles.titlePageDetails}>
                    <Text style={styles.mainTitle}>{project.name}</Text>
                    <Text style={styles.subtitle}>{period}</Text>
                </View>
            </Page>

            {/* Slide 2: Overview */}
            <Page size="A4" orientation="landscape" style={styles.page}>
                <Text style={styles.header}>{i18n.t('pdf.progressOverview')}</Text>
                <View style={styles.statsContainer}>
                    <View style={styles.statBox}>
                        <Text style={styles.statNumber}>{totalTasks}</Text>
                        <Text style={styles.statLabel}>{i18n.t('pdf.totalTasks')}</Text>
                    </View>
                    <View style={styles.statBox}>
                        <Text style={styles.statNumber}>{overallProgress}%</Text>
                        <Text style={styles.statLabel}>{i18n.t('pdf.overallCompletion')}</Text>
                    </View>
                    <View style={styles.statBox}>
                        <Text style={styles.statNumber}>{completedTasks}</Text>
                        <Text style={styles.statLabel}>{i18n.t('pdf.tasksCompleted')}</Text>
                    </View>
                    <View style={styles.statBox}>
                        <Text style={styles.statNumber}>{totalTasks - completedTasks - tasks.filter(t => t.status === 'hold').length}</Text>
                        <Text style={styles.statLabel}>{i18n.t('pdf.tasksInProgress')}</Text>
                    </View>
                    <View style={styles.statBox}>
                        <Text style={styles.statNumber}>{tasks.filter(t => t.status === 'hold').length}</Text>
                        <Text style={styles.statLabel}>{i18n.t('pdf.tasksOnHold')}</Text>
                    </View>
                </View>
                <View style={{ marginTop: 10, flex: 1 }}>
                    {tasks.map((task, idx) => (
                        <View key={task.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#E5E7EB', alignItems: 'center' }}>
                            <Text style={{ fontSize: 14, color: '#374151', flex: 1, paddingRight: 10 }}>
                                {idx + 1}. {task.title.replace(/^Задача\s*№?\s*\d+\s*:\s*/i, '')}
                            </Text>
                            <View style={{
                                backgroundColor: getPdfStatusColor(task.status).bg,
                                borderColor: getPdfStatusColor(task.status).border,
                                borderWidth: 1,
                                paddingHorizontal: 8,
                                paddingVertical: 4,
                                borderRadius: 4,
                                width: 100,
                                alignItems: 'center'
                            }}>
                                <Text style={{
                                    fontSize: 10,
                                    fontWeight: 'bold',
                                    color: getPdfStatusColor(task.status).text,
                                    textTransform: 'uppercase'
                                }}>
                                    {task.status ? i18n.t(`pdf.${task.status}`) : i18n.t('pdf.backlog')}
                                </Text>
                            </View>
                        </View>
                    ))}
                </View>
            </Page>

            {/* Task Detail Slides - One Page Per Task */}
            {tasks.map((task) => (
                <Page key={task.id} size="A4" orientation="landscape" style={styles.page}>
                    <View style={{ borderBottomWidth: 1, borderBottomColor: '#E5E7EB', paddingBottom: 16, marginBottom: 24 }}>
                        <Text style={{ fontSize: 26, color: '#111827', fontWeight: 'bold' }}>
                            {task.title.replace(/^Задача\s*№?\s*\d+\s*:\s*/i, '')}
                        </Text>
                    </View>

                    <View style={{ flex: 1 }}>
                        {/* Timeline Information */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24, paddingRight: 40 }}>
                            <View>
                                <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 6 }}>{i18n.t('pdf.startDate')}</Text>
                                <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#111827' }}>
                                    {dayjs(task.startDate).format('MMMM D, YYYY')}
                                </Text>
                            </View>
                            <View>
                                <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 6 }}>{i18n.t('pdf.duration')}</Text>
                                <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#111827' }}>
                                    {task.duration} {task.duration === 1 ? i18n.t('pdf.durationDay') : i18n.t('pdf.durationDays')}
                                </Text>
                            </View>
                            <View>
                                <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 6 }}>{i18n.t('pdf.targetDate')}</Text>
                                <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#111827' }}>
                                    {dayjs(task.startDate).add(task.duration, 'day').format('MMMM D, YYYY')}
                                </Text>
                            </View>
                            <View>
                                <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 6 }}>{i18n.t('pdf.status')}</Text>
                                <View style={{
                                    backgroundColor: getPdfStatusColor(task.status).bg,
                                    borderColor: getPdfStatusColor(task.status).border,
                                    borderWidth: 1,
                                    paddingHorizontal: 10,
                                    paddingVertical: 4,
                                    borderRadius: 4
                                }}>
                                    <Text style={{
                                        fontSize: 12,
                                        fontWeight: 'bold',
                                        color: getPdfStatusColor(task.status).text,
                                        textTransform: 'uppercase'
                                    }}>
                                        {task.status ? i18n.t(`pdf.${task.status}`) : i18n.t('pdf.backlog')}
                                    </Text>
                                </View>
                            </View>
                        </View>

                        {/* Progress Bar */}
                        <View style={{ marginBottom: 20, backgroundColor: '#FFFFFF', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB', flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#374151', marginRight: 16 }}>
                                {i18n.t('pdf.progressStatus')}: <Text style={{ color: '#4F46E5' }}>{task.progress}%</Text>
                            </Text>
                            <View style={{ flex: 1, height: 8, backgroundColor: '#E5E7EB', borderRadius: 4 }}>
                                <View style={{ height: '100%', backgroundColor: getPdfStatusColor(task.status).bar, borderRadius: 4, width: `${task.progress}%` }} />
                            </View>
                        </View>

                        {/* Task Description & Steps Side-by-Side */}
                        {(() => {
                            let steps: any[] = [];
                            try {
                                steps = task.steps ? JSON.parse(task.steps) : [];
                            } catch (e) {
                                // ignore
                            }
                            const showSteps = steps.length > 0;
                            const hasDesc = !!task.description;

                            if (!hasDesc && !showSteps) return null;

                            return (
                                <View style={{ flexDirection: 'row', width: '100%', marginBottom: 20 }}>
                                    {/* Description Column */}
                                    {hasDesc && (
                                        <View style={{ flex: showSteps ? 3 : 1, paddingRight: showSteps ? 20 : 0 }}>
                                            <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#111827', marginBottom: 8 }}>
                                                {i18n.t('pdf.description')}
                                            </Text>
                                            <View style={{ backgroundColor: '#F9FAFB', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB' }}>
                                                <Text style={{ fontSize: 12, color: '#4B5563', lineHeight: 1.5 }}>
                                                    {task.description}
                                                </Text>
                                            </View>
                                        </View>
                                    )}

                                    {/* Steps Column */}
                                    {showSteps && (
                                        <View style={{ flex: hasDesc ? 2 : 1 }}>
                                            <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#111827', marginBottom: 12 }}>
                                                {i18n.t('pdf.steps')}
                                            </Text>
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
                                                                <Text style={{ position: 'absolute', left: -25, top: 0, fontSize: 12, fontWeight: 'bold', color: numColor }}>
                                                                    {(stepIdx + 1).toString().padStart(2, '0')}
                                                                </Text>
                                                                {!isLast && (
                                                                    <View style={{ position: 'absolute', top: 12, bottom: -4, width: 2, backgroundColor: isCompleted ? '#111827' : '#E5E7EB', zIndex: 0 }} />
                                                                )}
                                                                <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: dotBgColor, borderColor: dotBorderColor, borderWidth: 2, zIndex: 1, marginTop: 2 }} />
                                                            </View>
                                                            <View style={{ flex: 1, paddingLeft: 10, paddingBottom: 15, flexDirection: 'row', alignItems: 'flex-start' }}>
                                                                <Text style={{ fontSize: 14, color: textColor, fontWeight: isCurrent || isMissed ? 'bold' : 'normal' }}>
                                                                    {step.text}
                                                                </Text>
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

            {/* Slide 4: Roadmap */}
            {sortedTasks.length > 0 && (
                <Page size="A4" orientation="landscape" style={styles.page}>
                    <Text style={styles.header}>{i18n.t('pdf.projectRoadmap')} - {getRoadmapPeriodLabel(minDate, maxDate)}</Text>
                    <View style={styles.roadmapContainer}>
                        <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', paddingBottom: 8, marginBottom: 8 }}>
                            <View style={{ width: 180, justifyContent: 'flex-end', paddingBottom: 2 }}>
                                <Text style={{ fontSize: 10, color: '#6B7280', fontWeight: 'bold' }}>
                                    {i18n.t('pdf.timelineDays', { count: totalDays })}
                                </Text>
                            </View>
                            <View style={{ flex: 1, position: 'relative', height: 16 }}>
                                <Text style={{ position: 'absolute', left: 0, top: 2, fontSize: 10, color: '#6B7280' }}>
                                    {minDate.format(edgeLabelFormat)}
                                </Text>
                                <Text style={{ position: 'absolute', right: 0, top: 2, fontSize: 10, color: '#6B7280' }}>
                                    {maxDate.format(edgeLabelFormat)}
                                </Text>

                                {timelineMarkers.map((m, idx) => (
                                    <View key={idx} style={{ position: 'absolute', left: `${m.percent}%`, top: 0, paddingLeft: 4, borderLeftWidth: 1, borderLeftColor: '#D1D5DB', height: 16 }}>
                                        <Text style={{ fontSize: 10, color: '#6B7280', paddingTop: 2 }}>
                                            {m.label}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        </View>

                        {sortedTasks.map(task => {
                            const startOffset = dayjs(task.startDate).diff(minDate, 'day');
                            const leftPercentRaw = (startOffset / totalDays) * 100;
                            const widthPercentRaw = (task.duration / totalDays) * 100;

                            const endPercentRaw = leftPercentRaw + widthPercentRaw;
                            const absoluteProgressEndPercent = leftPercentRaw + widthPercentRaw * (task.progress / 100);

                            const startPercent = Math.max(0, Math.min(100, leftPercentRaw));
                            const endPercent = Math.max(0, Math.min(100, endPercentRaw));
                            const clampedWidthPercent = endPercent - startPercent;

                            const progressEndPercent = Math.max(0, Math.min(100, absoluteProgressEndPercent));
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
                                <View key={task.id} style={styles.roadmapRow}>
                                    <Text style={styles.roadmapTaskTitle}>{task.title.replace(/^Задача\s*№?\s*\d+\s*:\s*/i, '')}</Text>
                                    <View style={styles.roadmapTimeline}>
                                        {/* Grid lines */}
                                        {timelineMarkers.map((m, idx) => (
                                            <View key={`grid-${idx}`} style={{ position: 'absolute', left: `${m.percent}%`, top: 0, height: '100%', width: 1, backgroundColor: '#E5E7EB', zIndex: 0 }} />
                                        ))}

                                        <View style={[
                                            styles.roadmapBar,
                                            {
                                                left: `${startPercent}%`,
                                                width: `${Math.max(1, clampedWidthPercent)}%`,
                                                backgroundColor: getPdfStatusColor(task.status).bar,
                                                ...bgBorderRadii
                                            }
                                        ]} />
                                        
                                        {clampedProgressWidthPercent > 0 && (
                                            <View style={[
                                                styles.roadmapBar,
                                                {
                                                    left: `${startPercent}%`,
                                                    width: `${Math.max(1, clampedProgressWidthPercent)}%`,
                                                    backgroundColor: 'rgba(0,0,0,0.2)', // overlay for progress
                                                    ...fgBorderRadii
                                                }
                                            ]} />
                                        )}
                                    </View>
                                </View>
                            );
                        })}
                    </View>
                </Page>
            )}
        </Document>
    );
};
