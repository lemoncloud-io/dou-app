import { RESTART_NOTE_KEY, RESTART_NOTE_TTL_MS, createAppRestart, parseRestartNote } from './appRestart';
import type { RestartNoteFile } from './appRestart';

const NOW = 1_000_000;

const fakeFile = (initial?: string) => {
    const entries = new Map<string, string>(initial === undefined ? [] : [[RESTART_NOTE_KEY, initial]]);
    const file: RestartNoteFile & { entries: Map<string, string> } = {
        entries,
        getString: key => entries.get(key),
        set: (key, value) => void entries.set(key, value),
        remove: key => entries.delete(key),
    };
    return file;
};

const stored = (note: Record<string, unknown>, at = NOW - 500) => JSON.stringify({ ...note, at });

const logService = () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) as any;

const build = (file: RestartNoteFile, reload: jest.Mock = jest.fn().mockResolvedValue(true), log = logService()) =>
    createAppRestart({ openFile: () => file, reload, logService: log, now: () => NOW });

describe('parseRestartNote', () => {
    it.each([
        [undefined, null],
        ['', null],
        ['not json', null],
        ['null', null],
        [stored({ reason: 'other' }), null],
        [stored({ reason: 'session-owner-changed' }), { reason: 'session-owner-changed' }],
        [
            stored({ reason: 'session-ended', homeSearch: 'logout=1&reason=logout' }),
            { reason: 'session-ended', homeSearch: 'logout=1&reason=logout' },
        ],
        [stored({ reason: 'session-ended', homeSearch: 3 }), { reason: 'session-ended' }],
        ['{"reason":"session-ended"}', null],
    ])('reads %p as %p', (raw, note) => {
        expect(parseRestartNote(raw, NOW)).toEqual(note);
    });

    it('drops a note older than its lifetime, or one from the future', () => {
        expect(parseRestartNote(stored({ reason: 'session-ended' }, NOW - RESTART_NOTE_TTL_MS), NOW)).toEqual({
            reason: 'session-ended',
        });
        expect(parseRestartNote(stored({ reason: 'session-ended' }, NOW - RESTART_NOTE_TTL_MS - 1), NOW)).toBeNull();
        expect(parseRestartNote(stored({ reason: 'session-ended' }, NOW + 1), NOW)).toBeNull();
    });
});

describe('createAppRestart', () => {
    it('answers no note on an ordinary launch', () => {
        expect(build(fakeFile()).note()).toBeNull();
    });

    it('takes the note the previous context left, once, and keeps it for this context', () => {
        const file = fakeFile(stored({ reason: 'session-ended', homeSearch: 'logout=1' }));
        const restart = build(file);

        expect(restart.note()).toEqual({ reason: 'session-ended', homeSearch: 'logout=1' });
        expect(file.entries.has(RESTART_NOTE_KEY)).toBe(false);
        expect(restart.note()).toEqual({ reason: 'session-ended', homeSearch: 'logout=1' });
    });

    it('removes a stale note without taking it', () => {
        const file = fakeFile(stored({ reason: 'session-ended', homeSearch: 'logout=1' }, NOW - 60_000));

        expect(build(file).note()).toBeNull();
        expect(file.entries.has(RESTART_NOTE_KEY)).toBe(false);
    });

    it('leaves the note, stamped with the time, for the next context and reloads', async () => {
        const file = fakeFile();
        const reload = jest.fn().mockResolvedValue(true);

        await expect(build(file, reload).restart({ reason: 'session-ended', homeSearch: 'logout=1' })).resolves.toBe(
            true
        );

        expect(reload).toHaveBeenCalledWith('session-ended');
        expect(JSON.parse(file.entries.get(RESTART_NOTE_KEY) ?? 'null')).toEqual({
            reason: 'session-ended',
            homeSearch: 'logout=1',
            at: NOW,
        });
    });

    it('does not read back the note it just left', async () => {
        const restart = build(fakeFile());

        await restart.restart({ reason: 'session-owner-changed' });

        expect(restart.note()).toBeNull();
    });

    it('restarts once when asked twice, keeping the first note', async () => {
        const file = fakeFile();
        const reload = jest.fn().mockResolvedValue(true);
        const restart = build(file, reload);

        const first = restart.restart({ reason: 'session-ended', homeSearch: 'logout=1' });
        const second = restart.restart({ reason: 'session-owner-changed' });

        await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
        expect(reload).toHaveBeenCalledTimes(1);
        expect(JSON.parse(file.entries.get(RESTART_NOTE_KEY) ?? 'null')).toMatchObject({ reason: 'session-ended' });
    });

    it('takes the note back when the reload did not happen, and may try again', async () => {
        const file = fakeFile();
        const log = logService();
        const reload = jest.fn().mockResolvedValue(false);
        const restart = build(file, reload, log);

        await expect(restart.restart({ reason: 'session-ended', homeSearch: 'logout=1' })).resolves.toBe(false);

        expect(file.entries.has(RESTART_NOTE_KEY)).toBe(false);
        expect(log.error).toHaveBeenCalledWith('app.restart_failed', expect.any(String), { reason: 'session-ended' });

        reload.mockResolvedValue(true);
        await expect(restart.restart({ reason: 'session-ended' })).resolves.toBe(true);
        expect(reload).toHaveBeenCalledTimes(2);
    });

    it('reads a file that cannot be opened as an ordinary launch, and does not reload without its note', async () => {
        const reload = jest.fn().mockResolvedValue(true);
        const restart = createAppRestart({
            openFile: () => {
                throw new Error('mmkv');
            },
            reload,
            logService: logService(),
        });

        expect(restart.note()).toBeNull();
        await expect(restart.restart({ reason: 'session-ended' })).resolves.toBe(false);
        expect(reload).not.toHaveBeenCalled();
    });
});
