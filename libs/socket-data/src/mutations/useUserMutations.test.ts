// libs/socket-data/src/hooks/useUserMutations.test.ts
import { renderHook, act, waitFor } from '@testing-library/react';
import { useWebSocketV2 } from '@chatic/socket';
import { useDynamicProfile, useWebCoreStore } from '@chatic/web-core';
import { APP_SYNC_EVENT_NAME } from '../sync-events';
import { useUserMutations } from './useUserMutations';

jest.mock('@chatic/socket', () => ({ useWebSocketV2: jest.fn() }));
jest.mock('@chatic/web-core', () => ({
    useDynamicProfile: jest.fn(),
    useWebCoreStore: jest.fn(),
}));

describe('useUserMutations', () => {
    const mockEmitAuthenticated = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        (useWebSocketV2 as unknown as jest.Mock).mockReturnValue({ emitAuthenticated: mockEmitAuthenticated });
    });

    it('정상적인 클라우드 유저의 프로필 업데이트 수행 및 이벤트 수신 시 resolve 된다', async () => {
        (useDynamicProfile as unknown as jest.Mock).mockReturnValue({ uid: 'user1' });
        (useWebCoreStore as unknown as jest.Mock).mockReturnValue({ isCloudUser: true });

        const { result } = renderHook(() => useUserMutations());
        let promiseResolved = false;

        act(() => {
            result.current.updateProfile({ name: 'Alice' }).then(() => {
                promiseResolved = true;
            });
        });

        expect(result.current.isPending['update-profile']).toBe(true);
        expect(mockEmitAuthenticated).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'user', action: 'update-profile', payload: { name: 'Alice' } })
        );

        act(() => {
            window.dispatchEvent(
                new CustomEvent(APP_SYNC_EVENT_NAME, {
                    detail: { domain: 'user', action: 'update-profile', targetId: 'user1' },
                })
            );
        });

        await waitFor(() => expect(promiseResolved).toBe(true));
        expect(result.current.isPending['update-profile']).toBe(false);
    });
});
