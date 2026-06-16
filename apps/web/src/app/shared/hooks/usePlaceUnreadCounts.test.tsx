import { renderHook, waitFor } from '@testing-library/react';

import { isNative, webClient } from '@chatic/bridges';
import { useWebSocketV2Store } from '@chatic/socket';

import { useRepositories } from '@chatic/app-runtime';
import { usePlaceUnreadCounts } from './usePlaceUnreadCounts';

const fetchChannelMock = jest.fn();
const channelRepositoryMock = {
    fetchChannel: fetchChannelMock,
    onChannelCreated: jest.fn(() => jest.fn()),
    onChannelUpdated: jest.fn(() => jest.fn()),
    onChannelDeleted: jest.fn(() => jest.fn()),
};
const chatRepositoryMock = {
    onChatCreated: jest.fn(() => jest.fn()),
};
const joinRepositoryMock = {
    onJoinUpdated: jest.fn(() => jest.fn()),
};

const websocketState = {
    isVerified: true,
    cloudId: 'cloud-1',
    selectedPlaceId: 'place-1',
};

jest.mock('@chatic/bridges', () => ({
    isNative: jest.fn(),
    logger: {
        error: jest.fn(),
    },
    webClient: {
        post: jest.fn(),
    },
}));

jest.mock('@chatic/shared', () => ({
    useInterval: jest.fn(),
}));

jest.mock('@chatic/socket', () => ({
    useWebSocketV2Store: jest.fn(),
}));

jest.mock('@chatic/web-core', () => ({
    cloudCore: {
        getSelectedCloudId: jest.fn(),
    },
}));

jest.mock('@chatic/app-runtime', () => ({
    useRepositories: jest.fn(),
}));

describe('usePlaceUnreadCounts', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        websocketState.isVerified = true;
        websocketState.cloudId = 'cloud-1';
        websocketState.selectedPlaceId = 'place-1';

        (isNative as jest.Mock).mockReturnValue(true);
        const webCoreMock = jest.requireMock('@chatic/web-core') as {
            cloudCore: { getSelectedCloudId: jest.Mock };
        };
        webCoreMock.cloudCore.getSelectedCloudId.mockReturnValue('cloud-1');
        (useWebSocketV2Store as unknown as jest.Mock).mockImplementation(selector => selector(websocketState));
        (useRepositories as jest.Mock).mockReturnValue({
            channel: channelRepositoryMock,
            chat: chatRepositoryMock,
            join: joinRepositoryMock,
        });
        fetchChannelMock.mockResolvedValue({
            list: [
                { sid: 'place-1', unreadCount: 2 },
                { sid: 'place-2', unreadCount: 5 },
                { sid: 'place-2', unreadCount: 3 },
            ],
        });
    });

    it('네이티브 앱 뱃지 카운트를 모든 place unread 합계로 업데이트한다', async () => {
        renderHook(() => usePlaceUnreadCounts());

        await waitFor(() => {
            expect(webClient.post).toHaveBeenCalledWith({ type: 'SetBadgeCount', data: { count: 10 } });
        });
    });

    it('같은 뱃지 카운트는 중복 전송하지 않는다', async () => {
        const { rerender } = renderHook(() => usePlaceUnreadCounts());

        await waitFor(() => expect(webClient.post).toHaveBeenCalledTimes(1));

        websocketState.selectedPlaceId = 'place-2';
        rerender();

        await waitFor(() => expect(fetchChannelMock).toHaveBeenCalledTimes(2));
        expect(webClient.post).toHaveBeenCalledTimes(1);
    });

    it('네이티브 앱 환경이 아니면 뱃지 카운트를 전송하지 않는다', async () => {
        (isNative as jest.Mock).mockReturnValue(false);

        renderHook(() => usePlaceUnreadCounts());

        await waitFor(() => expect(fetchChannelMock).toHaveBeenCalledTimes(1));
        expect(webClient.post).not.toHaveBeenCalled();
    });
});
