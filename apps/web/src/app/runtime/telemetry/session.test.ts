import { SESSION_IDLE_MS, TelemetrySession } from './session';

const build = () => {
    let now = 1_000;
    let n = 0;
    const events: Array<{ name: string; id: string; fields: unknown }> = [];
    const session: TelemetrySession = new TelemetrySession({
        now: () => now,
        createId: () => `s${(n += 1)}`,
        entry: 'browser',
        recordEvent: (name, fields) => events.push({ name, id: session.id, fields }),
    });
    return { session, events, advance: (ms: number) => (now += ms) };
};

describe('TelemetrySession', () => {
    it('starts a cold session with the run', () => {
        const { session, events } = build();
        session.begin();

        expect(events).toEqual([
            { name: 'session_start', id: 's1', fields: { attrs: { start: 'cold', entry: 'browser' } } },
        ]);
    });

    it('keeps the session across a short trip to the background', () => {
        const { session, events, advance } = build();
        session.begin();
        session.hidden();
        advance(SESSION_IDLE_MS);
        session.visible();

        expect(session.id).toBe('s1');
        expect(events).toHaveLength(1);
    });

    it('ends the old session and starts a new one after more than 30 minutes away', () => {
        const { session, events, advance } = build();
        session.begin();
        session.countScreen();
        session.countScreen();
        advance(5_000);
        session.hidden();
        advance(SESSION_IDLE_MS + 1);
        session.visible();

        expect(events.slice(1)).toEqual([
            { name: 'session_end', id: 's1', fields: { metrics: { duration_ms: 5_000, screens: 2 } } },
            { name: 'session_start', id: 's2', fields: { attrs: { start: 'resume', entry: 'browser' } } },
        ]);
        expect(session.id).toBe('s2');
    });

    it('measures time away from the first hide, not a later one', () => {
        const { session, events, advance } = build();
        session.begin();
        session.hidden();
        advance(SESSION_IDLE_MS / 2);
        session.hidden();
        advance(SESSION_IDLE_MS / 2 + 1);
        session.visible();

        expect(events.map(e => e.name)).toContain('session_end');
    });

    it('tells the caller right after a new session started', () => {
        let now = 0;
        const onNewSession = jest.fn();
        const session = new TelemetrySession({
            now: () => now,
            createId: () => 'x',
            entry: 'icon',
            recordEvent: jest.fn(),
            onNewSession,
        });
        session.hidden();
        now += SESSION_IDLE_MS + 1;
        session.visible();

        expect(onNewSession).toHaveBeenCalledTimes(1);
    });
});
