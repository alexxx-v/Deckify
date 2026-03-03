import { useState, useRef } from 'react';
import dayjs from 'dayjs';

type DraggableTaskBarProps = {
    task: any;
    minDate: dayjs.Dayjs;
    totalDays: number;
    colors: any;
    onUpdate: (id: string, start: string, duration: number) => void;
    onClick: () => void;
};

export function DraggableTaskBar({ task, minDate, totalDays, colors, onUpdate, onClick }: DraggableTaskBarProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [tempStartOffsetDays, setTempStartOffsetDays] = useState(0);
    const [tempDurationDeltaDays, setTempDurationDeltaDays] = useState(0);
    const barRef = useRef<HTMLDivElement>(null);

    const taskStartDiff = dayjs(task.startDate).diff(minDate, 'day');
    const displayStartDiff = taskStartDiff + tempStartOffsetDays;
    const displayDuration = Math.max(1, task.duration + tempDurationDeltaDays);

    const leftPercentRaw = (displayStartDiff / totalDays) * 100;
    const widthPercentRaw = (displayDuration / totalDays) * 100;
    const cutOffPercent = leftPercentRaw < 0 ? (-leftPercentRaw / widthPercentRaw) * 100 : 0;

    const handlePointerDownDrag = (e: React.PointerEvent) => {
        // Ignore if clicking on the resize handle
        if (e.target instanceof HTMLElement && e.target.closest('.resize-handle')) return;
        e.stopPropagation();

        setIsDragging(true);
        const startX = e.clientX;
        // The nearest stable container width (.relative container in ProjectTasks)
        const containerWidth = barRef.current?.parentElement?.clientWidth || 800;

        const handleMove = (ev: PointerEvent) => {
            const dx = ev.clientX - startX;
            const daysDelta = Math.round((dx / containerWidth) * totalDays);
            setTempStartOffsetDays(daysDelta);
        };

        const handleUp = (ev: PointerEvent) => {
            const dx = ev.clientX - startX;
            const daysDelta = Math.round((dx / containerWidth) * totalDays);
            setIsDragging(false);
            setTempStartOffsetDays(0);

            if (daysDelta !== 0) {
                const newStart = dayjs(task.startDate).add(daysDelta, 'day').format('YYYY-MM-DD');
                onUpdate(task.id, newStart, displayDuration);
            } else if (dx === 0) {
                onClick(); // trigger click if no drag happened
            }

            window.removeEventListener('pointermove', handleMove);
            window.removeEventListener('pointerup', handleUp);
        };

        window.addEventListener('pointermove', handleMove);
        window.addEventListener('pointerup', handleUp);
    };

    const handlePointerDownResize = (e: React.PointerEvent) => {
        e.stopPropagation();
        setIsResizing(true);
        const startX = e.clientX;
        const containerWidth = barRef.current?.parentElement?.clientWidth || 800;

        const handleMove = (ev: PointerEvent) => {
            const dx = ev.clientX - startX;
            const daysDelta = Math.round((dx / containerWidth) * totalDays);
            setTempDurationDeltaDays(daysDelta);
        };

        const handleUp = (ev: PointerEvent) => {
            const dx = ev.clientX - startX;
            const daysDelta = Math.round((dx / containerWidth) * totalDays);
            setIsResizing(false);
            setTempDurationDeltaDays(0);

            const newDuration = Math.max(1, task.duration + daysDelta);
            if (newDuration !== task.duration) {
                onUpdate(task.id, task.startDate, newDuration);
            }

            window.removeEventListener('pointermove', handleMove);
            window.removeEventListener('pointerup', handleUp);
        };

        window.addEventListener('pointermove', handleMove);
        window.addEventListener('pointerup', handleUp);
    };

    return (
        <div className="relative h-10 group" ref={barRef} style={{ touchAction: 'none' }}>
            <div
                onPointerDown={handlePointerDownDrag}
                className={`absolute top-1 bottom-1 rounded-md opacity-90 border backdrop-blur-sm shadow-sm flex items-center overflow-visible z-10 ${isDragging ? 'cursor-grabbing ring-2 ring-primary/50 shadow-md z-20 scale-[1.01]' : 'cursor-grab hover:opacity-100 hover:ring-1 mix-blend-normal'}`}
                style={{
                    left: `${leftPercentRaw}%`,
                    width: `${widthPercentRaw}%`,
                    backgroundColor: colors.bg,
                    borderColor: colors.border,
                    transition: isDragging || isResizing ? 'transform 0.1s' : 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
            >
                {/* Progress fill inside bar */}
                <div className="absolute inset-y-0 left-0 transition-all pointer-events-none rounded-l-md" style={{ width: `${task.progress}%`, backgroundColor: colors.fill }}></div>

                <div
                    className="absolute inset-y-0 right-0 px-3 flex items-center text-sm font-semibold whitespace-nowrap overflow-hidden text-ellipsis text-foreground shadow-sm pointer-events-none select-none lg:hidden"
                    style={{ left: `${cutOffPercent}%` }}
                >
                    {task.title} <span className="text-xs opacity-70 ml-1.5 font-medium">({task.progress}%)</span>
                </div>

                {/* Resize Handle */}
                <div
                    className="resize-handle absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize hover:bg-black/10 dark:hover:bg-white/10 flex items-center justify-center transition-opacity z-30"
                    onPointerDown={handlePointerDownResize}
                    title="Change duration"
                >
                    <div className="w-0.5 h-3 bg-foreground/40 rounded-full pointer-events-none"></div>
                </div>
            </div>
            {/* Visual ghost for dragging/resizing showing the new outline */}
            {(isDragging || isResizing) && (
                <div
                    className="absolute top-1 bottom-1 rounded-md border-2 border-primary border-dashed bg-primary/5 pointer-events-none z-0"
                    style={{
                        left: `${leftPercentRaw}%`,
                        width: `${widthPercentRaw}%`,
                    }}
                />
            )}
        </div>
    );
}
