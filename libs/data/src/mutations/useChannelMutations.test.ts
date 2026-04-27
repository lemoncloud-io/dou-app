// libs/data/src/hooks/useChannelMutations.test.ts
import { act, renderHook, waitFor } from '@testing-library/react';
import { useWebSocketV2 } from '@chatic/socket';
import { useChannelLocalDataSource } from '../local/data-sources';
import { APP_SYNC_EVENT_NAME } from '../sync-events';
import { useChannelMutations } from '../mutations';

jest.mock('@chatic/socket', () => ({ useWebSocketV2: jest.fn() }));
jest.mock('../local/data-sources', () => ({ useChannelRepository: jest.fn() }));
jest.mock('@chatic/web-core', () => ({
    useDynamicProfile: jest.fn(() => ({ uid: 'test-user' })),
    cloudCore: {
        getConfig: jest.fn(),
    },
}));

describe('useChannelMutations', () => {
    const mockEmitAuthenticated = jest.fn();
    const mockGetChannel = jest.fn();
    const mockCloudId = 'test-cloud';

    const mockRepoInstance = {
        cloudId: mockCloudId,
        getChannel: mockGetChannel,
    };

    beforeEach(() => {
        jest.clearAllMocks();
        (useWebSocketV2 as unknown as jest.Mock).mockReturnValue({
            emitAuthenticated: mockEmitAuthenticated,
            cloudId: mockCloudId,
        });
        (useChannelLocalDataSource as unknown as jest.Mock).mockReturnValue(mockRepoInstance);
    });

    it('createChannel: 이벤트 수신 시 DB에서 채널을 조회하고 반환한다', async () => {
        const mockNewChannel = { id: 'ch1', name: 'New Channel', sid: 'sid1' };
        mockGetChannel.mockResolvedValue(mockNewChannel);

        const { result } = renderHook(() => useChannelMutations());

        let promiseResolved = false;
        let returnedChannel: any;

        act(() => {
            result.current.createChannel({ stereo: 'public' } as any).then(res => {
                promiseResolved = true;
                returnedChannel = res;
            });
        });

        expect(result.current.isPending.start).toBe(true);
        expect(mockEmitAuthenticated).toHaveBeenCalledWith(expect.objectContaining({ type: 'chat', action: 'start' }));

        act(() => {
            window.dispatchEvent(
                new CustomEvent(APP_SYNC_EVENT_NAME, {
                    detail: { domain: 'channel', action: 'start', targetId: 'ch1' },
                })
            );
        });

        await waitFor(() => expect(promiseResolved).toBe(true));

        expect(result.current.isPending.start).toBe(false);
        expect(mockGetChannel).toHaveBeenCalledWith('ch1');
        expect(returnedChannel.sid).toBeUndefined();
        expect(returnedChannel.id).toBe('ch1');
    });

    it('leaveChannel: 이벤트 수신 시 Promise가 resolve 된다', async () => {
        const { result } = renderHook(() => useChannelMutations());
        let promiseResolved = false;

        act(() => {
            result.current.leaveChannel({ channelId: 'ch1' }).then(() => {
                promiseResolved = true;
            });
        });

        expect(result.current.isPending.leave).toBe(true);

        act(() => {
            window.dispatchEvent(
                new CustomEvent(APP_SYNC_EVENT_NAME, {
                    detail: { domain: 'channel', action: 'leave', targetId: 'ch1' },
                })
            );
        });

        await waitFor(() => expect(promiseResolved).toBe(true));
        expect(result.current.isPending.leave).toBe(false);
    });
});
