import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import { act, cleanup, renderHook } from '@testing-library/react';

const inviteRepository = {
    create: vi.fn(async () => ({ id: 'inv-1', deeplink: 'https://dou.example/i/abc' })),
    cancel: vi.fn(async () => ({ id: 'inv-1', state: 'canceled' })),
    list: vi.fn(async () => []),
};
const userRepository = {
    requestInvite: vi.fn(async () => ({ id: 'inv-2' })),
    requestInviteBatch: vi.fn(async () => []),
};

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: () => ({ invite: inviteRepository, user: userRepository }),
        },
        session: { useSessionSelection: () => ({ selectedSiteId: 'site-1' }) },
    },
}));

import { useDesktopInviteMutations } from './useDesktopInviteMutations';

describe('useDesktopInviteMutations', () => {
    afterEach(() => cleanup());
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('creates a contact invite with the phone, name and channel', async () => {
        const { result } = renderHook(() => useDesktopInviteMutations());

        let view: unknown;
        await act(async () => {
            view = await result.current.createInvite({
                phone: '+821012345678',
                name: 'Ada',
                channelId: 'C1',
            });
        });

        expect(inviteRepository.create).toHaveBeenCalledWith({
            phone: '+821012345678',
            name: 'Ada',
            channelId: 'C1',
            expiresDays: 1,
        });
        expect(view).toEqual({ id: 'inv-1', deeplink: 'https://dou.example/i/abc' });
    });

    it('rejects a create with no phone or name before touching the server', async () => {
        const { result } = renderHook(() => useDesktopInviteMutations());

        const errors: unknown[] = [];
        // A rejecting act() callback poisons later renders, so the rejection is
        // caught inside and asserted outside.
        await act(async () => {
            try {
                await result.current.createInvite({ phone: '', name: 'Ada' });
            } catch (error) {
                errors.push(error);
            }
            try {
                await result.current.createInvite({ phone: '+821012345678', name: '  ' });
            } catch (error) {
                errors.push(error);
            }
        });

        expect(errors).toHaveLength(2);
        expect(inviteRepository.create).not.toHaveBeenCalled();
    });

    it('cancels by full code and requires one', async () => {
        const { result } = renderHook(() => useDesktopInviteMutations());

        await act(async () => {
            await result.current.cancelInvite('invt:inv-1:zz99');
        });

        expect(inviteRepository.cancel).toHaveBeenCalledWith('invt:inv-1:zz99');

        let error: unknown;
        await act(async () => {
            try {
                await result.current.cancelInvite('');
            } catch (e) {
                error = e;
            }
        });
        expect(error).toBeInstanceOf(Error);
    });

    it('lists without flipping the mutating flag', async () => {
        const { result } = renderHook(() => useDesktopInviteMutations());

        await act(async () => {
            await result.current.listInvites();
        });

        expect(inviteRepository.list).toHaveBeenCalledTimes(1);
        expect(result.current.isMutating).toBe(false);
    });
});
