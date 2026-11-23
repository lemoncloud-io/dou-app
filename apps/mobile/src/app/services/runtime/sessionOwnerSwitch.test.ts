import { SESSION_OWNER_KEY } from './sessionOwner';
import type { SessionOwner } from './sessionOwner';
import {
    SESSION_OWNER_RESTART_DELAY_MS,
    createSessionOwnerSwitch,
    isSessionOwnerSwitchAllowed,
} from './sessionOwnerSwitch';

const fakeFile = (initial?: string) => {
    const entries = new Map<string, string>(initial === undefined ? [] : [[SESSION_OWNER_KEY, initial]]);
    return {
        entries,
        getString: (key: string) => entries.get(key),
        set: (key: string, value: string) => void entries.set(key, value),
    };
};

const build = (current: SessionOwner, stored?: string, fallback?: SessionOwner) => {
    const file = fakeFile(stored);
    const restart = { restart: jest.fn().mockResolvedValue(true) };
    const scheduled: { run: () => void; ms: number; cancelled: boolean }[] = [];
    const ownerSwitch = createSessionOwnerSwitch({
        current: () => current,
        file: () => file,
        ...(fallback ? { fallback: () => fallback } : {}),
        restart,
        schedule: (run, ms) => {
            const entry = { run, ms, cancelled: false };
            scheduled.push(entry);
            return () => {
                entry.cancelled = true;
            };
        },
    });
    return { file, restart, scheduled, ownerSwitch };
};

describe('isSessionOwnerSwitchAllowed', () => {
    it.each([
        ['DEV', true],
        ['LOCAL', true],
        ['dev', true],
        ['PROD', false],
        [undefined, false],
        ['', false],
        ['STAGING', false],
    ])('stage %p with debug mode off → %p', (stage, allowed) => {
        expect(isSessionOwnerSwitchAllowed(stage, false)).toBe(allowed);
    });

    it.each(['PROD', undefined, 'STAGING', 'DEV'])('stage %p with debug mode on → offered', stage => {
        expect(isSessionOwnerSwitchAllowed(stage, true)).toBe(true);
    });
});

describe('createSessionOwnerSwitch', () => {
    it('reads the current owner and the one recorded for the next start', () => {
        const { ownerSwitch } = build('web', 'native');

        expect(ownerSwitch.read()).toEqual({ current: 'web', next: 'native' });
    });

    it("answers the build's default for the next start when nothing is recorded", () => {
        expect(build('native', undefined, 'native').ownerSwitch.read()).toEqual({ current: 'native', next: 'native' });
        expect(build('web', undefined).ownerSwitch.read()).toEqual({ current: 'web', next: 'web' });
    });

    it('keeps a recorded page choice on a build that defaults to the runtime', () => {
        const { ownerSwitch } = build('native', undefined, 'native');

        expect(ownerSwitch.set('web')).toEqual({ next: 'web', restarting: true });
        expect(ownerSwitch.read()).toEqual({ current: 'native', next: 'web' });
    });

    it('records a different owner and restarts after its answer is sent', () => {
        const { ownerSwitch, file, restart, scheduled } = build('web');

        expect(ownerSwitch.set('native')).toEqual({ next: 'native', restarting: true });
        expect(file.entries.get(SESSION_OWNER_KEY)).toBe('native');
        expect(restart.restart).not.toHaveBeenCalled();
        expect(scheduled).toHaveLength(1);
        expect(scheduled[0]?.ms).toBe(SESSION_OWNER_RESTART_DELAY_MS);

        scheduled[0]?.run();
        expect(restart.restart).toHaveBeenCalledWith({ reason: 'session-owner-changed' });
    });

    it('schedules one restart for a second tap', () => {
        const { ownerSwitch, scheduled } = build('web');

        ownerSwitch.set('native');
        ownerSwitch.set('native');

        expect(scheduled).toHaveLength(1);
    });

    it('calls off a pending restart when the current owner is set back', () => {
        const { ownerSwitch, file, scheduled } = build('web');

        ownerSwitch.set('native');
        expect(ownerSwitch.set('web')).toEqual({ next: 'web', restarting: false });

        expect(scheduled[0]?.cancelled).toBe(true);
        expect(file.entries.get(SESSION_OWNER_KEY)).toBe('web');
    });

    it('records the current owner without restarting — undoing a switch not yet applied', () => {
        const { ownerSwitch, file, scheduled } = build('native', 'web');

        expect(ownerSwitch.set('native')).toEqual({ next: 'native', restarting: false });
        expect(file.entries.get(SESSION_OWNER_KEY)).toBe('native');
        expect(scheduled).toHaveLength(0);
    });
});
