import type { SessionOwnerSwitch } from '../../services/runtime/sessionOwnerSwitch';
import { createDefaultSessionOwnerHandler, createSessionOwnerHandlers } from './sessionOwnerHandlers';

const fakeSwitch = (): jest.Mocked<SessionOwnerSwitch> => ({
    read: jest.fn().mockReturnValue({ current: 'web', next: 'web' }),
    set: jest.fn().mockReturnValue({ next: 'native', restarting: true }),
});

describe('createSessionOwnerHandlers', () => {
    it('answers the current and next owner while the switch is offered', async () => {
        const ownerSwitch = fakeSwitch();
        const { handleFetchSessionOwner } = createSessionOwnerHandlers({ ownerSwitch, allowed: () => true });

        const res = await handleFetchSessionOwner({ type: 'FetchSessionOwner', data: {} } as any);

        expect(res).toEqual({ type: 'OnFetchSessionOwner', success: true, data: { current: 'web', next: 'web' } });
    });

    it('records an owner while the switch is offered', async () => {
        const ownerSwitch = fakeSwitch();
        const { handleSetSessionOwner } = createSessionOwnerHandlers({ ownerSwitch, allowed: () => true });

        const res = await handleSetSessionOwner({ type: 'SetSessionOwner', data: { owner: 'native' } } as any);

        expect(ownerSwitch.set).toHaveBeenCalledWith('native');
        expect(res).toEqual({ type: 'OnSetSessionOwner', success: true, data: { next: 'native', restarting: true } });
    });

    it('refuses both requests, touching nothing, while the switch is not offered', async () => {
        const ownerSwitch = fakeSwitch();
        const { handleFetchSessionOwner, handleSetSessionOwner } = createSessionOwnerHandlers({
            ownerSwitch,
            allowed: () => false,
        });

        const fetched = await handleFetchSessionOwner({ type: 'FetchSessionOwner', data: {} } as any);
        const set = await handleSetSessionOwner({ type: 'SetSessionOwner', data: { owner: 'native' } } as any);

        expect(fetched).toMatchObject({ success: false, error: { code: 'NOT_ALLOWED' } });
        expect(set).toMatchObject({ success: false, error: { code: 'NOT_ALLOWED' } });
        expect(ownerSwitch.read).not.toHaveBeenCalled();
        expect(ownerSwitch.set).not.toHaveBeenCalled();
    });

    it('reads whether it is offered on every request, since debug mode can change mid-run', async () => {
        const ownerSwitch = fakeSwitch();
        let offered = false;
        const { handleSetSessionOwner } = createSessionOwnerHandlers({ ownerSwitch, allowed: () => offered });

        const before = await handleSetSessionOwner({ type: 'SetSessionOwner', data: { owner: 'native' } } as any);
        offered = true;
        const after = await handleSetSessionOwner({ type: 'SetSessionOwner', data: { owner: 'native' } } as any);

        expect(before.success).toBe(false);
        expect(after.success).toBe(true);
    });

    it('refuses an owner it does not know', async () => {
        const ownerSwitch = fakeSwitch();
        const { handleSetSessionOwner } = createSessionOwnerHandlers({ ownerSwitch, allowed: () => true });

        const res = await handleSetSessionOwner({ type: 'SetSessionOwner', data: { owner: 'cloud' } } as any);

        expect(res).toMatchObject({ success: false, error: { code: 'INVALID_OWNER' } });
        expect(ownerSwitch.set).not.toHaveBeenCalled();
    });
});

describe('createDefaultSessionOwnerHandler', () => {
    const fakeFile = () => {
        const entries = new Map<string, string>();
        return {
            entries,
            getString: (key: string) => entries.get(key),
            set: (key: string, value: string) => void entries.set(key, value),
            remove: (key: string) => entries.delete(key),
        };
    };

    it('records the default and answers it with the next owner', async () => {
        const file = fakeFile();
        const next = jest.fn().mockReturnValue('native');
        const { handleSetDefaultSessionOwner } = createDefaultSessionOwnerHandler({ file: () => file, next });

        const res = await handleSetDefaultSessionOwner({
            type: 'SetDefaultSessionOwner',
            data: { owner: 'native' },
        } as any);

        expect(file.entries.get('defaultSessionOwner')).toBe('native');
        expect(next).toHaveBeenCalledWith(file);
        expect(res).toEqual({
            type: 'OnSetDefaultSessionOwner',
            success: true,
            data: { default: 'native', next: 'native' },
        });
    });

    it('clears the default on null', async () => {
        const file = fakeFile();
        file.entries.set('defaultSessionOwner', 'native');
        const { handleSetDefaultSessionOwner } = createDefaultSessionOwnerHandler({
            file: () => file,
            next: () => 'web',
        });

        const res = await handleSetDefaultSessionOwner({
            type: 'SetDefaultSessionOwner',
            data: { owner: null },
        } as any);

        expect(file.entries.has('defaultSessionOwner')).toBe(false);
        expect(res).toMatchObject({ success: true, data: { default: null, next: 'web' } });
    });

    it.each([['cloud'], [undefined]])('refuses %p and records nothing', async owner => {
        const file = fakeFile();
        const { handleSetDefaultSessionOwner } = createDefaultSessionOwnerHandler({
            file: () => file,
            next: () => 'web',
        });

        const res = await handleSetDefaultSessionOwner({ type: 'SetDefaultSessionOwner', data: { owner } } as any);

        expect(res).toMatchObject({ success: false, error: { code: 'INVALID_OWNER' } });
        expect(file.entries.size).toBe(0);
    });

    it('answers a file that cannot be opened as a failure', async () => {
        const { handleSetDefaultSessionOwner } = createDefaultSessionOwnerHandler({
            file: () => {
                throw new Error('mmkv');
            },
            next: () => 'web',
        });

        const res = await handleSetDefaultSessionOwner({
            type: 'SetDefaultSessionOwner',
            data: { owner: 'native' },
        } as any);

        expect(res).toMatchObject({ success: false, error: { code: 'INTERNAL', message: 'mmkv' } });
    });
});
