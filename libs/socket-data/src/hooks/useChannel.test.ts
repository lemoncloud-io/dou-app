import { renderHook, waitFor, act } from '@testing-library/react';
import { useChannel } from './useChannel'; // 실제 파일 경로에 맞게 수정하세요.
import { useWebSocketV2 } from '@chatic/socket';
import { useDynamicProfile } from '@chatic/web-core';
import { useChannelRepository } from '../repository';
import { APP_SYNC_EVENT_NAME } from '../sync-events';

jest.mock('@chatic/socket', () => ({
    useWebSocketV2: jest.fn(),
}));

jest.mock('@chatic/web-core', () => ({
    useDynamicProfile: jest.fn(),
}));

jest.mock('../repository', () => ({
    useChannelRepository: jest.fn(),
}));

describe('useChannel Hook', () => {
    const mockCloudId = 'test-cloud-id';
    const mockUid = 'user-123';
    const mockGetChannel = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        (useWebSocketV2 as jest.Mock).mockReturnValue({ cloudId: mockCloudId });
        (useDynamicProfile as jest.Mock).mockReturnValue({ uid: mockUid });
        (useChannelRepository as jest.Mock).mockReturnValue({
            cloudId: mockCloudId,
            getChannel: mockGetChannel,
        });
    });

    it('channelId가 null일 경우 로딩을 종료하고 channel을 null로 반환해야 한다', async () => {
        const { result } = renderHook(() => useChannel(null));

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(result.current.channel).toBeNull();
        expect(result.current.isError).toBe(false);
        expect(mockGetChannel).not.toHaveBeenCalled();
    });

    it('channelId가 주어지면 DB에서 데이터를 가져와 ClientChannelView로 매핑해야 한다', async () => {
        const mockChannelId = 'channel-1';
        const mockChannelData = {
            id: mockChannelId,
            ownerId: mockUid, // 내 UID와 같으므로 isOwner = true
            stereo: 'self', // isSelfChat = true
            memberNo: 3, // memberCount = 3
            sid: 'internal-db-id', // 반환 시 제거되어야 함
            name: 'Test Channel',
        };

        mockGetChannel.mockResolvedValue(mockChannelData);

        const { result } = renderHook(() => useChannel(mockChannelId));

        // 처음 렌더링 시에는 로딩 중이어야 함
        expect(result.current.isLoading).toBe(true);

        // 비동기 작업(DB 조회)이 끝날 때까지 대기
        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(mockGetChannel).toHaveBeenCalledWith(mockChannelId);
        expect(result.current.isError).toBe(false);

        // 매핑된 ClientChannelView 검증
        expect(result.current.channel).toEqual(
            expect.objectContaining({
                id: mockChannelId,
                name: 'Test Channel',
                isOwner: true,
                isSelfChat: true,
                memberCount: 3,
            })
        );

        expect(result.current.channel).not.toHaveProperty('sid');
    });

    it('DB에서 데이터를 가져오는 중 에러가 발생하면 isError가 true가 되어야 한다', async () => {
        const mockChannelId = 'channel-error';
        mockGetChannel.mockRejectedValue(new Error('DB Error'));

        const { result } = renderHook(() => useChannel(mockChannelId));

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(result.current.isError).toBe(true);
        expect(result.current.channel).toBeNull();
    });

    it('APP_SYNC_EVENT_NAME 이벤트가 발생하고 조건이 맞으면 데이터를 다시 페칭해야 한다', async () => {
        const mockChannelId = 'channel-sync';
        mockGetChannel.mockResolvedValue({ id: mockChannelId, ownerId: 'other', stereo: 'public' });

        renderHook(() => useChannel(mockChannelId));

        await waitFor(() => {
            expect(mockGetChannel).toHaveBeenCalledTimes(1); // 초기 로드
        });

        act(() => {
            const event = new CustomEvent(APP_SYNC_EVENT_NAME, {
                detail: {
                    domain: 'channel',
                    targetId: mockChannelId,
                    cid: mockCloudId,
                },
            });
            window.dispatchEvent(event);
        });

        await waitFor(() => {
            expect(mockGetChannel).toHaveBeenCalledTimes(2);
        });
    });

    it('refresh 함수를 호출하면 데이터를 수동으로 다시 가져와야 한다', async () => {
        const mockChannelId = 'channel-refresh';
        mockGetChannel.mockResolvedValue({ id: mockChannelId });

        const { result } = renderHook(() => useChannel(mockChannelId));

        await waitFor(() => {
            expect(mockGetChannel).toHaveBeenCalledTimes(1);
        });

        act(() => {
            result.current.refresh();
        });

        await waitFor(() => {
            expect(mockGetChannel).toHaveBeenCalledTimes(2);
        });
    });
});
