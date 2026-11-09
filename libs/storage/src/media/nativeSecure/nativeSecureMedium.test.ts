import { MemoryMedium } from '../memoryMedium';
import { isNativeMedium } from './isNativeMedium.util';
import { NativeSecureMedium } from './nativeSecureMedium';

import type { NativeReadResult, NativeStorageChannel } from './types';

/** A shell that answers as told, and records what it was sent. */
const fakeShell = (read: NativeReadResult | Promise<NativeReadResult> = { status: 'available', values: {} }) => {
    const saves: { set: Record<string, string>; remove: string[] }[] = [];
    const vault: Record<string, string> = {};
    let clears = 0;
    const answers = { save: true, clear: true };
    const channel: NativeStorageChannel = {
        read: () => Promise.resolve(read),
        save: async (set, remove) => {
            saves.push({ set, remove });
            if (!answers.save) return false;
            Object.assign(vault, set);
            remove.forEach(key => delete vault[key]);
            return true;
        },
        clear: async () => {
            clears += 1;
            if (answers.clear) Object.keys(vault).forEach(key => delete vault[key]);
            return answers.clear;
        },
    };
    return { channel, saves, vault, answers, clears: () => clears };
};

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe('NativeSecureMedium', () => {
    it('answers from memory once hydrated', async () => {
        const shell = fakeShell({ status: 'available', values: { token: 't1' } });
        const medium = new NativeSecureMedium({ channel: shell.channel, fallback: new MemoryMedium() });

        const result = await medium.hydrate();

        expect(result.status).toBe('available');
        expect(medium.status).toBe('available');
        expect(medium.get('token')).toBe('t1');
        expect(medium.keys()).toEqual(['token']);
    });

    it('sends the writes of one turn as one save, with the last value of each key', async () => {
        const shell = fakeShell();
        const medium = new NativeSecureMedium({ channel: shell.channel, fallback: new MemoryMedium() });
        await medium.hydrate();

        medium.set('a', '1');
        medium.set('a', '2');
        medium.set('b', '3');
        medium.remove('b');
        await settle();

        expect(shell.saves).toEqual([{ set: { a: '2' }, remove: ['b'] }]);
        expect(shell.vault).toEqual({ a: '2' });
    });

    it('resolves flush only once the shell confirmed the writes', async () => {
        const shell = fakeShell();
        const medium = new NativeSecureMedium({ channel: shell.channel, fallback: new MemoryMedium() });
        await medium.hydrate();

        medium.set('token', 't');
        await medium.flush();

        expect(shell.vault).toEqual({ token: 't' });
    });

    it('clears the vault on clear, and rejects flush when the shell refuses', async () => {
        const shell = fakeShell({ status: 'available', values: { token: 't' } });
        const medium = new NativeSecureMedium({ channel: shell.channel, fallback: new MemoryMedium() });
        await medium.hydrate();

        medium.clear();
        await medium.flush();
        expect(shell.clears()).toBe(1);
        expect(medium.keys()).toEqual([]);

        shell.answers.clear = false;
        medium.set('token', 'again');
        medium.clear();
        await expect(medium.flush()).rejects.toThrow();
    });

    it('falls back for the run when the vault is unavailable, and never reports that as empty data', async () => {
        const fallback = new MemoryMedium();
        const shell = fakeShell({ status: 'unavailable', reason: 'locked', values: {} });
        const medium = new NativeSecureMedium({ channel: shell.channel, fallback });

        const result = await medium.hydrate();
        medium.set('token', 't');

        expect(result).toEqual({ status: 'unavailable', reason: 'locked', values: {} });
        expect(medium.status).toBe('unavailable');
        expect(fallback.get('token')).toBe('t');
        expect(medium.get('token')).toBe('t');
        expect(shell.saves).toEqual([]);
        await expect(medium.flush()).rejects.toThrow();
    });

    it('reads a shell that never answers as unavailable, not as empty', async () => {
        const channel: NativeStorageChannel = {
            read: () => new Promise(() => undefined),
            save: async () => true,
            clear: async () => true,
        };
        const medium = new NativeSecureMedium({ channel, fallback: new MemoryMedium(), timeoutMs: 10 });

        await expect(medium.hydrate()).resolves.toEqual({ status: 'unavailable', reason: 'error', values: {} });
        expect(medium.status).toBe('unavailable');
    });

    it('moves what it holds to the fallback when a save is refused, so the run stays signed in', async () => {
        const fallback = new MemoryMedium();
        const shell = fakeShell({ status: 'available', values: { relay: 'r' } });
        const medium = new NativeSecureMedium({ channel: shell.channel, fallback });
        await medium.hydrate();

        shell.answers.save = false;
        medium.set('cloud', 'c');
        await expect(medium.flush()).rejects.toThrow();

        expect(medium.status).toBe('unavailable');
        expect(fallback.get('relay')).toBe('r');
        expect(fallback.get('cloud')).toBe('c');
        expect(medium.get('cloud')).toBe('c');
    });

    it('clears only its own keys from the fallback', async () => {
        const fallback = new MemoryMedium();
        fallback.set('someone-else', 'x');
        const shell = fakeShell({ status: 'unavailable', reason: 'error', values: {} });
        const medium = new NativeSecureMedium({ channel: shell.channel, fallback });
        await medium.hydrate();
        medium.set('token', 't');

        medium.clear();

        expect(fallback.keys()).toEqual(['someone-else']);
        expect(medium.keys()).toEqual([]);
    });
});

describe('isNativeMedium', () => {
    it('tells a medium the shell keeps from a plain one', () => {
        const shell = fakeShell();
        expect(isNativeMedium(new NativeSecureMedium({ channel: shell.channel, fallback: new MemoryMedium() }))).toBe(
            true
        );
        expect(isNativeMedium(new MemoryMedium())).toBe(false);
    });
});
