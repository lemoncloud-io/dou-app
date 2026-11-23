export interface LongTaskStats {
    count: number;
    totalMs: number;
    maxMs: number;
}

let stats: LongTaskStats = { count: 0, totalMs: 0, maxMs: 0 };

export const addLongTask = (current: LongTaskStats, durationMs: number): LongTaskStats => ({
    count: current.count + 1,
    totalMs: Math.round(current.totalMs + durationMs),
    maxMs: Math.max(current.maxMs, Math.round(durationMs)),
});

export const getLongTaskStats = (): LongTaskStats => stats;

export const isLongTaskSupported = (): boolean =>
    typeof PerformanceObserver !== 'undefined' && (PerformanceObserver.supportedEntryTypes ?? []).includes('longtask');

export const initLongTasks = (): void => {
    if (!isLongTaskSupported()) return;
    try {
        const observer = new PerformanceObserver(list => {
            for (const entry of list.getEntries()) {
                stats = addLongTask(stats, entry.duration);
            }
        });
        observer.observe({ type: 'longtask', buffered: true });
    } catch {
        // Older engines throw on the {type, buffered} form — losing long-task
        // stats is acceptable for a debug-only collector.
    }
};
