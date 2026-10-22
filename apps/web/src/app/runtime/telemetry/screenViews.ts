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
    /** The page's cumulative long-task totals; the tracker takes the difference per screen. */
    longTasks: () => LongTaskTotals;
    onScreen?: () => void;
}

/**
 * Turns route changes into screen statistics.
 *
 * A screen is a route **template**: moving between two rooms is not a new screen, because the
 * template is the same. On each change it records `screen_view` (with the screen before it and how
 * long that one was shown) and, for the screen being left, one `long_tasks` sample summing the long
 * tasks that happened while it was up — when there were any. A path no template matches is not a
 * screen and changes nothing.
 *
 * A long task's max is the page-wide max at the time, not this screen's own; the cumulative totals
 * give no per-screen max. It is reported only when it grew during the screen, which is when it
 * belongs to it.
 */
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
        /**
         * A new usage session started on the screen already shown: it is that session's first screen,
         * and the time it spent in the background is not dwell time.
         */
        restart(): void {
            if (!screen) return;
            options.recordEvent('screen_view', { attrs: { screen } });
            enteredAt = options.now();
            tasksAtEntry = { ...options.longTasks() };
            options.onScreen?.();
        },
        /** The page is going away: close the current screen's long-task sample. */
        flush(): void {
            leave();
            tasksAtEntry = { ...options.longTasks() };
        },
    };
};
