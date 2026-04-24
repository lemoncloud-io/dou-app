// libs/data/src/hooks/useInviteClouds.test.ts
import { renderHook, act, waitFor } from '@testing-library/react';
import { getMobileAppInfo } from '@chatic/app-messages';
import { useWebSocketV2Store } from '@chatic/socket';
import { useInviteLocalDataSource } from '../local/data-sources';
import { APP_SYNC_EVENT_NAME } from '../sync-events';
import { useInviteClouds } from './useInviteClouds';

jest.mock('@chatic/app-messages', () => ({ getMobileAppInfo: jest.fn() }));
jest.mock('@chatic/socket', () => ({ useWebSocketV2Store: jest.fn() }));
jest.mock('../local/data-sources', () => ({ useInviteRepository: jest.fn() }));
jest.mock('@chatic/web-core', () => ({
    useDynamicProfile: jest.fn(() => ({ uid: 'test-user' })),
    cloudCore: {
        getConfig: jest.fn(),
    },
}));

describe('useInviteClouds', () => {
    const mockGetInvites = jest.fn();
    const mockCloudId = 'test-cloud';

    const mockRepoInstance = {
        getInvites: mockGetInvites,
    };

    beforeEach(() => {
        jest.clearAllMocks();
        (useWebSocketV2Store as unknown as jest.Mock).mockReturnValue({ cloudId: mockCloudId });
        (useInviteLocalDataSource as jest.Mock).mockReturnValue(mockRepoInstance);
    });

    it('모바일 앱 환경이 아니면 데이터를 로드하지 않는다', async () => {
        (getMobileAppInfo as jest.Mock).mockReturnValue({ isOnMobileApp: false });

        const { result } = renderHook(() => useInviteClouds());

        expect(result.current.isLoading).toBe(false);
        expect(mockGetInvites).not.toHaveBeenCalled();
    });

    it('모바일 앱 환경이면 마운트 시 DB에서 초대 목록을 로드한다', async () => {
        (getMobileAppInfo as jest.Mock).mockReturnValue({ isOnMobileApp: true });
        mockGetInvites.mockResolvedValue([{ id: 'inv1' }]);

        const { result } = renderHook(() => useInviteClouds());

        expect(result.current.isLoading).toBe(true);

        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(mockGetInvites).toHaveBeenCalledTimes(1);
        expect(result.current.inviteClouds).toHaveLength(1);
    });

    it('invitecloud 도메인 이벤트 수신 시 데이터를 다시 로드한다', async () => {
        (getMobileAppInfo as jest.Mock).mockReturnValue({ isOnMobileApp: true });
        mockGetInvites.mockResolvedValue([]);

        renderHook(() => useInviteClouds());
        await waitFor(() => expect(mockGetInvites).toHaveBeenCalledTimes(1));

        act(() => {
            window.dispatchEvent(
                new CustomEvent(APP_SYNC_EVENT_NAME, {
                    detail: { domain: 'invitecloud', cid: mockCloudId },
                })
            );
        });

        await waitFor(() => expect(mockGetInvites).toHaveBeenCalledTimes(2));
    });
});
