import { createScreenViewTracker } from './screenViews';

const build = () => {
    let now = 0;
    let tasks = { count: 0, totalMs: 0, maxMs: 0 };
    const events: unknown[] = [];
    const samples: unknown[] = [];
    const onScreen = jest.fn();
    const tracker = createScreenViewTracker({
        now: () => now,
        recordEvent: (_name, fields) => events.push(fields),
        recordSample: (_name, fields) => samples.push(fields),
        longTasks: () => tasks,
        onScreen,
    });
    return {
        tracker,
        events,
        samples,
        onScreen,
        advance: (ms: number) => (now += ms),
        addTask: (ms: number) =>
            (tasks = { count: tasks.count + 1, totalMs: tasks.totalMs + ms, maxMs: Math.max(tasks.maxMs, ms) }),
    };
};

describe('createScreenViewTracker', () => {
    it('records the first screen with no previous one', () => {
        const { tracker, events } = build();
        tracker.onPath('/');

        expect(events).toEqual([{ attrs: { screen: '/' } }]);
    });

    it('records a change of template with the previous screen and its dwell time', () => {
        const { tracker, events, advance } = build();
        tracker.onPath('/');
        advance(1_500);
        tracker.onPath('/channels/C1/room');

        expect(events[1]).toEqual({
            attrs: { screen: '/channels/:id/room', prev_screen: '/' },
            metrics: { prev_dwell_ms: 1_500 },
        });
    });

    it('does not count moving between two paths of the same template, or an unknown path', () => {
        const { tracker, events, onScreen } = build();
        tracker.onPath('/channels/C1/room');
        tracker.onPath('/channels/C2/room');
        tracker.onPath('/nowhere/at/all');

        expect(events).toHaveLength(1);
        expect(onScreen).toHaveBeenCalledTimes(1);
    });

    it('records the long tasks of the screen being left, only when there were some', () => {
        const { tracker, samples, addTask } = build();
        tracker.onPath('/');
        tracker.onPath('/search');
        expect(samples).toEqual([]);

        addTask(80);
        addTask(120);
        tracker.onPath('/mypage');

        expect(samples).toEqual([{ attrs: { screen: '/search' }, metrics: { count: 2, total_ms: 200, max_ms: 120 } }]);
    });

    it('closes the current screen when the page is hidden, without counting it twice', () => {
        const { tracker, samples, addTask } = build();
        tracker.onPath('/');
        addTask(60);
        tracker.flush();
        tracker.onPath('/search');

        expect(samples).toHaveLength(1);
    });

    it('starts the current screen afresh in a new session: counted, with no dwell from the background', () => {
        const { tracker, events, onScreen, advance } = build();
        tracker.onPath('/search');
        advance(10_000);
        tracker.restart();
        advance(500);
        tracker.onPath('/');

        expect(events[1]).toEqual({ attrs: { screen: '/search' } });
        expect(events[2]).toMatchObject({ metrics: { prev_dwell_ms: 500 } });
        expect(onScreen).toHaveBeenCalledTimes(3);
    });
});
