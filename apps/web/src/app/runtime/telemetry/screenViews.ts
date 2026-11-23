import { routeTemplateOf } from './routeTemplate';

export interface LongTaskTotals {
    count: number;
    totalMs: number;
    maxMs: number;
}

export interface ScreenViewTrackerOptions {
    now: () => number;
    recordEvent: (
        name: 'screen_view',
        fields: { attrs: Record<string, string>; metrics?: Record<string, number> }
    ) => void;
    recordSample: (
        name: 'long_tasks',
        fields: { attrs: Record<string, string>; metrics: Record<string, number> }
    ) => void;
    longTasks: () => LongTaskTotals;
    onScreen?: () => void;
}

export const createScreenViewTracker = (options: ScreenViewTrackerOptions) => {
    let screen: string | undefined;
    let enteredAt = 0;
    let tasksAtEntry: LongTaskTotals = { count: 0, totalMs: 0, maxMs: 0 };

    const leave = (): void => {
        if (!screen) return;
        const now = options.longTasks();
        const count = now.count - tasksAtEntry.count;
        if (count <= 0) return;
        options.recordSample('long_tasks', {
            attrs: { screen },
            metrics: {
                count,
                total_ms: now.totalMs - tasksAtEntry.totalMs,
                max_ms: now.maxMs > tasksAtEntry.maxMs ? now.maxMs : 0,
            },
        });
    };

    return {
        onPath(pathname: string): void {
            const next = routeTemplateOf(pathname);
            if (!next || next === screen) return;

            leave();
            const at = options.now();
            options.recordEvent('screen_view', {
                attrs: { screen: next, ...(screen ? { prev_screen: screen } : {}) },
                ...(screen ? { metrics: { prev_dwell_ms: Math.max(0, at - enteredAt) } } : {}),
            });

            screen = next;
            enteredAt = at;
            tasksAtEntry = { ...options.longTasks() };
            options.onScreen?.();
        },
        restart(): void {
            if (!screen) return;
            options.recordEvent('screen_view', { attrs: { screen } });
            enteredAt = options.now();
            tasksAtEntry = { ...options.longTasks() };
            options.onScreen?.();
        },
        flush(): void {
            leave();
            tasksAtEntry = { ...options.longTasks() };
        },
    };
};
