import type { SessionOwnerSwitch } from '../../services/runtime/sessionOwnerSwitch';
import { createSessionOwnerHandlers } from './sessionOwnerHandlers';

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
