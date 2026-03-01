import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import { Project, Task, TaskStatus } from '@/db/schema';
import dayjs from 'dayjs';

const getPdfStatusColor = (status?: TaskStatus) => {
    switch (status) {
        case 'done': return { text: '#166534', bg: '#DCFCE7', border: '#86EFAC', bar: '#22C55E' };
        case 'progress': return { text: '#1E40AF', bg: '#DBEAFE', border: '#93C5FD', bar: '#3B82F6' };
        case 'hold': return { text: '#854D0E', bg: '#FEF9C3', border: '#FDE047', bar: '#EAB308' };
        case 'backlog':
        default: return { text: '#374151', bg: '#F3F4F6', border: '#D1D5DB', bar: '#6B7280' };
    }
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
        marginTop: 40,
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
        width: 120,
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
}

export const ProjectPresentation = ({ project, tasks, period }: PdfDocumentProps) => {
    const completedTasks = tasks.filter(t => t.progress === 100).length;
    const totalTasks = tasks.length;
    const overallProgress = totalTasks === 0 ? 0 :
        Math.round(tasks.reduce((sum, t) => sum + t.progress, 0) / totalTasks);

    // Roadmap logic
    const sortedTasks = [...tasks].sort((a, b) => dayjs(a.startDate).valueOf() - dayjs(b.startDate).valueOf());
    const minDate = sortedTasks.length > 0 ? dayjs(sortedTasks[0].startDate) : dayjs();
    const maxDate = sortedTasks.length > 0
        ? dayjs(Math.max(...sortedTasks.map(t => dayjs(t.startDate).add(t.duration, 'day').valueOf())))
        : dayjs().add(30, 'day');

    const totalDays = Math.max(1, maxDate.diff(minDate, 'day'));

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
                <Text style={styles.header}>Progress Overview</Text>
                <View style={styles.statsContainer}>
                    <View style={styles.statBox}>
                        <Text style={styles.statNumber}>{overallProgress}%</Text>
                        <Text style={styles.statLabel}>Overall Completion</Text>
                    </View>
                    <View style={styles.statBox}>
                        <Text style={styles.statNumber}>{completedTasks}</Text>
                        <Text style={styles.statLabel}>Tasks Completed</Text>
                    </View>
                    <View style={styles.statBox}>
                        <Text style={styles.statNumber}>{totalTasks - completedTasks}</Text>
                        <Text style={styles.statLabel}>Tasks in Progress</Text>
                    </View>
                </View>
            </Page>

            {/* Task Detail Slides - One Page Per Task */}
            {tasks.map((task, index) => (
                <Page key={task.id} size="A4" orientation="landscape" style={styles.page}>
                    <Text style={styles.header}>Task {index + 1}: {task.title}</Text>

                    <View style={{ marginTop: 20, flex: 1 }}>
                        {/* Timeline Information */}
                        <View style={{ flexDirection: 'row', justifyContent: 'flex-start', marginBottom: 30, gap: 100 }}>
                            <View>
                                <Text style={{ fontSize: 14, color: '#6B7280', marginBottom: 8 }}>Start Date</Text>
                                <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#111827' }}>
                                    {dayjs(task.startDate).format('MMMM D, YYYY')}
                                </Text>
                            </View>
                            <View>
                                <Text style={{ fontSize: 14, color: '#6B7280', marginBottom: 8 }}>Duration</Text>
                                <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#111827' }}>
                                    {task.duration} {task.duration === 1 ? 'day' : 'days'}
                                </Text>
                            </View>
                            <View>
                                <Text style={{ fontSize: 14, color: '#6B7280', marginBottom: 8 }}>Target Date</Text>
                                <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#111827' }}>
                                    {dayjs(task.startDate).add(task.duration, 'day').format('MMMM D, YYYY')}
                                </Text>
                            </View>
                            <View>
                                <Text style={{ fontSize: 14, color: '#6B7280', marginBottom: 8 }}>Status</Text>
                                <View style={{
                                    backgroundColor: getPdfStatusColor(task.status).bg,
                                    borderColor: getPdfStatusColor(task.status).border,
                                    borderWidth: 1,
                                    paddingHorizontal: 12,
                                    paddingVertical: 4,
                                    borderRadius: 4
                                }}>
                                    <Text style={{
                                        fontSize: 16,
                                        fontWeight: 'bold',
                                        color: getPdfStatusColor(task.status).text,
                                        textTransform: 'uppercase'
                                    }}>
                                        {task.status || 'backlog'}
                                    </Text>
                                </View>
                            </View>
                        </View>

                        {/* Progress Bar */}
                        <View style={{ marginBottom: 40, backgroundColor: '#FFFFFF', padding: 24, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB' }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
                                <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#374151' }}>Progress Status</Text>
                                <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#4F46E5' }}>{task.progress}%</Text>
                            </View>
                            <View style={{ height: 20, backgroundColor: '#E5E7EB', borderRadius: 10 }}>
                                <View style={{ height: '100%', backgroundColor: getPdfStatusColor(task.status).bar, borderRadius: 10, width: `${task.progress}%` }} />
                            </View>
                        </View>

                        {/* Task Description */}
                        {task.description && (
                            <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#111827', marginBottom: 16 }}>
                                    Description
                                </Text>
                                <View style={{ backgroundColor: '#F9FAFB', padding: 20, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB', flexGrow: 1 }}>
                                    <Text style={{ fontSize: 14, color: '#4B5563', lineHeight: 1.6 }}>
                                        {task.description}
                                    </Text>
                                </View>
                            </View>
                        )}
                    </View>
                </Page>
            ))}

            {/* Slide 4: Roadmap */}
            {sortedTasks.length > 0 && (
                <Page size="A4" orientation="landscape" style={styles.page}>
                    <Text style={styles.header}>Project Roadmap</Text>
                    <View style={styles.roadmapContainer}>
                        <View style={styles.roadmapHeader}>
                            <View style={{ width: 120 }} />
                            <Text style={styles.roadmapHeaderCell}>{minDate.format('MMM D, YYYY')}</Text>
                            <Text style={styles.roadmapHeaderCell}>Timeline ({totalDays} days)</Text>
                            <Text style={styles.roadmapHeaderCell}>{maxDate.format('MMM D, YYYY')}</Text>
                        </View>

                        {sortedTasks.map(task => {
                            const startOffset = dayjs(task.startDate).diff(minDate, 'day');
                            const leftPercent = (startOffset / totalDays) * 100;
                            const widthPercent = (task.duration / totalDays) * 100;

                            return (
                                <View key={task.id} style={styles.roadmapRow}>
                                    <Text style={styles.roadmapTaskTitle}>{task.title}</Text>
                                    <View style={styles.roadmapTimeline}>
                                        <View style={[
                                            styles.roadmapBar,
                                            {
                                                left: `${Math.max(0, Math.min(100, leftPercent))}%`,
                                                width: `${Math.max(2, Math.min(100 - leftPercent, widthPercent))}%`,
                                                backgroundColor: getPdfStatusColor(task.status).bar,
                                            }
                                        ]} />
                                        <View style={[
                                            styles.roadmapBar,
                                            {
                                                left: `${Math.max(0, Math.min(100, leftPercent))}%`,
                                                width: `${Math.max(2, Math.min(100 - leftPercent, widthPercent)) * (task.progress / 100)}%`,
                                                backgroundColor: 'rgba(0,0,0,0.2)', // overlay for progress
                                            }
                                        ]} />
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
