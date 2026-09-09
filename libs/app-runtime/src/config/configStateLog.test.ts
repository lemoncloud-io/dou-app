/**
 * What matters here is the SHAPE of the history a collector replays — a boot anchor plus one line
 * per move — and the three things that would quietly corrupt it: a repeated attach doubling every
 * line, the entry code riding along in a log the team reads, and a line for a key whose effective
 * value never moved.
 *
 * The registry itself is faked rather than booted. This module's job is what it decides to log and
 * what it leaves out; which row wins is `libs/config`'s job and has its own tests there.
 */
import type { ConfigSnapshot, ValueOrigin } from '@chatic/config';

// Held outside the factories (hence the `mock` prefix jest requires) so each case can rewrite what
// the fake registry answers.
const mockInfo = jest.fn();
const mockListeners: Array<(changedKeys: readonly string[]) => void> = [];
let mockOverridden: ConfigSnapshot[] = [];
let mockSnapshots: Record<string, ConfigSnapshot> = {};

jest.mock('@chatic/bridges', () => ({
    logger: { info: mockInfo, warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('@chatic/config', () => ({
    config: {
        overriddenSnapshots: () => mockOverridden,
        snapshot: (key: string) => mockSnapshots[key],
        subscribe: (_keys: unknown, listener: (changedKeys: readonly string[]) => void) => {
            mockListeners.push(listener);
            return () => {
                const at = mockListeners.indexOf(listener);
                if (at >= 0) mockListeners.splice(at, 1);
            };
        },
    },
}));

/**
 * The module under test is loaded per case, not imported at the top.
 *
 * Two reasons, and both bite silently. `jest.mock` is hoisted above the `const`s above, so a static
 * import would run the factories before those exist; and the module holds its live subscription at
 * module scope, so a case inheriting the previous one's would be testing the wrong tree. Same
 * pattern as `init.test.ts`.
 */
const load = async () => {
    jest.resetModules();
    return (await import('./configStateLog')).attachConfigStateLog;
};

const snapshot = (key: string, value: unknown, origin: ValueOrigin = 'local'): ConfigSnapshot =>
    ({ key, value, origin, isOverridden: origin !== 'default' && origin !== 'stageRule' }) as ConfigSnapshot;

/** Publishes a change the way `ConfigStore.notify` does — to every live listener. */
const emitChange = (...keys: string[]) => mockListeners.forEach(listener => listener(keys));

describe('attachConfigStateLog', () => {
    beforeEach(() => {
        mockInfo.mockClear();
        mockListeners.length = 0;
        mockOverridden = [];
        mockSnapshots = {};
    });

    describe('the boot anchor', () => {
        // The empty line is not a wasted entry: it says "nothing on this device explains the bug",
        // which is the answer on most devices and is only trustworthy if the line is always there.
        it('is logged even when nothing is overridden', async () => {
            const attachConfigStateLog = await load();

            attachConfigStateLog();

            expect(mockInfo).toHaveBeenCalledWith('CONFIG', 'Boot state: no key is overridden', { overrides: [] });
        });

        it('names every overridden key with the row that decided it', async () => {
            const attachConfigStateLog = await load();
            mockOverridden = [
                snapshot('net.relay.backend', 'https://qa', 'local'),
                snapshot('log.upload.hold', true, 'shell'),
            ];

            attachConfigStateLog();

            expect(mockInfo).toHaveBeenCalledWith('CONFIG', 'Boot state: 2 key(s) overridden', {
                overrides: [
                    { key: 'net.relay.backend', value: 'https://qa', origin: 'local' },
                    { key: 'log.upload.hold', value: true, origin: 'shell' },
                ],
            });
        });

        // It is a credential, and this log is read by the team.
        it('leaves the debug entry code out, and out of the count', async () => {
            const attachConfigStateLog = await load();
            mockOverridden = [snapshot('debug.entryCode', '1234'), snapshot('log.upload.hold', true)];

            attachConfigStateLog();

            expect(mockInfo).toHaveBeenCalledWith('CONFIG', 'Boot state: 1 key(s) overridden', {
                overrides: [{ key: 'log.upload.hold', value: true, origin: 'local' }],
            });
        });
    });

    describe('the change lines', () => {
        it('logs one line per moved key, naming the row that won', async () => {
            const attachConfigStateLog = await load();
            attachConfigStateLog();
            mockInfo.mockClear();
            mockSnapshots = {
                'ui.theme': snapshot('ui.theme', 'dark', 'shell'),
                'log.upload.hold': snapshot('log.upload.hold', true, 'local'),
            };

            emitChange('ui.theme', 'log.upload.hold');

            expect(mockInfo).toHaveBeenCalledTimes(2);
            expect(mockInfo).toHaveBeenCalledWith('CONFIG', 'Changed: ui.theme', {
                key: 'ui.theme',
                value: 'dark',
                origin: 'shell',
            });
            expect(mockInfo).toHaveBeenCalledWith('CONFIG', 'Changed: log.upload.hold', {
                key: 'log.upload.hold',
                value: true,
                origin: 'local',
            });
        });

        it('leaves the debug entry code out here too', async () => {
            const attachConfigStateLog = await load();
            attachConfigStateLog();
            mockInfo.mockClear();
            mockSnapshots = { 'debug.entryCode': snapshot('debug.entryCode', '1234') };

            emitChange('debug.entryCode');

            expect(mockInfo).not.toHaveBeenCalled();
        });

        it('skips a key the registry cannot describe rather than throwing into the app', async () => {
            const attachConfigStateLog = await load();
            attachConfigStateLog();
            mockInfo.mockClear();

            expect(() => emitChange('없는.키')).not.toThrow();
            expect(mockInfo).not.toHaveBeenCalled();
        });
    });

    describe('attaching twice', () => {
        // HMR and a double `initAppRuntime` both land here. Two live subscriptions would double
        // every change line, and a replayed history that counts one move twice is wrong history.
        it('replaces the subscription instead of stacking a second one', async () => {
            const attachConfigStateLog = await load();
            attachConfigStateLog();
            attachConfigStateLog();
            mockInfo.mockClear();
            mockSnapshots = { 'ui.theme': snapshot('ui.theme', 'dark', 'shell') };

            emitChange('ui.theme');

            expect(mockListeners).toHaveLength(1);
            expect(mockInfo).toHaveBeenCalledTimes(1);
        });

        it('stops logging once the returned detach runs', async () => {
            const attachConfigStateLog = await load();
            const detach = attachConfigStateLog();
            detach();
            mockInfo.mockClear();
            mockSnapshots = { 'ui.theme': snapshot('ui.theme', 'dark', 'shell') };

            emitChange('ui.theme');

            expect(mockInfo).not.toHaveBeenCalled();
        });
    });
});
