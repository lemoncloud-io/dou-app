import { renderHook } from '@testing-library/react';

import { useChatSync, useProfileSync, useSyncTarget } from './useSyncTarget';

const mockDispose = jest.fn();
const mockRegister = jest.fn().mockReturnValue(mockDispose);
jest.mock('../../runtime', () => ({
    getSyncManager: () => ({ register: mockRegister }),
}));

describe('useSyncTarget', () => {
    beforeEach(() => {
        mockRegister.mockClear();
        mockDispose.mockClear();
    });

    it('registers on mount and disposes on unmount', () => {
        const { unmount } = renderHook(() => useSyncTarget({ type: 'chat', id: 'ch-1' }));
        expect(mockRegister).toHaveBeenCalledWith({ type: 'chat', id: 'ch-1' });

        unmount();
        expect(mockDispose).toHaveBeenCalledTimes(1);
    });

    it('does not register a null target', () => {
        renderHook(() => useSyncTarget(null));
        expect(mockRegister).not.toHaveBeenCalled();
    });

    it('re-registers only when the target key changes', () => {
        const { rerender } = renderHook(({ id }: { id: string }) => useChatSync(id), {
            initialProps: { id: 'ch-1' },
        });
        expect(mockRegister).toHaveBeenCalledTimes(1);

        rerender({ id: 'ch-1' }); // same key — no re-register
        expect(mockRegister).toHaveBeenCalledTimes(1);

        rerender({ id: 'ch-2' }); // key change — dispose old, register new
        expect(mockDispose).toHaveBeenCalledTimes(1);
        expect(mockRegister).toHaveBeenCalledTimes(2);
        expect(mockRegister).toHaveBeenLastCalledWith({ type: 'chat', id: 'ch-2' });
    });
});

describe('useProfileSync', () => {
    beforeEach(() => {
        mockRegister.mockClear();
    });

    it('registers a profile target when an id is given', () => {
        renderHook(() => useProfileSync('site-1:me'));
        expect(mockRegister).toHaveBeenCalledWith({ type: 'profile', id: 'site-1:me' });
    });

    it('does not register when the id is missing', () => {
        renderHook(() => useProfileSync(undefined));
        expect(mockRegister).not.toHaveBeenCalled();
    });
});
