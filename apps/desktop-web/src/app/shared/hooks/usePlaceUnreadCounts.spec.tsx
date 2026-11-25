import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { act, renderHook } from '@testing-library/react';

vi.mock('@chatic/bridges', () => ({
    isNative: vi.fn(() => false),
    logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const channelMocks = {
    fetchList: vi.fn(async () => ({ list: [] })),
};

type MessageHandler = (message: unknown) => void;
type PushListener = (payload: unknown) => void;

const notifications = vi.hoisted(() => ({ onReceive: vi.fn((_listener: PushListener) => () => undefined) }));

const connectionMocks = {
    onMessageHandler: null as MessageHandler | null,
    onServerMessage: vi.fn((handler: MessageHandler) => {
        connectionMocks.onMessageHandler = handler;
        return () => undefined;
    }),
};

vi.mock('@chatic/runtime-react', async () => {
    const { browserPush, fakeRuntimeModule } = await import('@chatic/runtime-react/testing');
    return fakeRuntimeModule({
        data: { useRuntimeRepositories: () => ({ channel: channelMocks }) },
        session: {
            useGlobalSession: () => ({ activeServer: { kind: 'cloud', cloudId: 'cloud-1' } }),
            useSessionIdentity: () => ({ userId: 'me' }),
        },
        connection: {
            useRuntimeSocketState: () => ({ isVerified: true }),
            onServerMessage: (handler: MessageHandler) => connectionMocks.onServerMessage(handler),
        },
        push: { ...browserPush(), kind: 'shell', notifications },
    });
});

vi.mock('./usePlaces', () => {
    const placeIds: string[] = [];
    return { usePlaces: () => ({ placeIds }) };
});

const liveIds = vi.hoisted(() => new Set<string>());
vi.mock('./liveReadRegistry', () => ({
    isChannelReadLive: (channelId: string) => liveIds.has(channelId),
}));

import { useNotificationPrefsStore } from '../stores';
import { useMentionsStore } from '../stores';
import { usePlaceUnreadCounts } from './usePlaceUnreadCounts';

const emitPush = () => {
    for (const [listener] of notifications.onReceive.mock.calls) {
        act(() => {
            listener({ notification: {} });
        });
    }
};

const emitSocketFrame = (message: unknown) => {
    act(() => {
        connectionMocks.onMessageHandler?.(message);
    });
};

const advanceDebounce = async () => {
    await act(async () => {
        vi.advanceTimersByTime(400);
    });
};

const focusWindow = () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
};

describe('usePlaceUnreadCounts live-read skip', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        liveIds.clear();
        connectionMocks.onMessageHandler = null;
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    const renderCounts = () => {
        const hook = renderHook(() => usePlaceUnreadCounts());
        channelMocks.fetchList.mockClear();
        return hook;
    };

    it('re-pulls the cloud directory for a socket chat frame', async () => {
        renderCounts();

        emitSocketFrame({ type: 'chat.sync', data: { channelId: 'ch-9', chatNo: 7 } });
        await advanceDebounce();

        expect(channelMocks.fetchList).toHaveBeenCalledTimes(1);
    });

    it('skips the re-pull for the live-read channel while the window is focused', async () => {
        focusWindow();
        liveIds.add('ch-9');
        renderCounts();

        emitSocketFrame({ type: 'chat.sync', data: { channelId: 'ch-9', chatNo: 7 } });
        await advanceDebounce();

        expect(channelMocks.fetchList).not.toHaveBeenCalled();
    });

    it('still re-pulls the live-read channel when the window is blurred', async () => {
        liveIds.add('ch-9');
        renderCounts();

        emitSocketFrame({ type: 'chat.sync', data: { channelId: 'ch-9', chatNo: 7 } });
        await advanceDebounce();

        expect(channelMocks.fetchList).toHaveBeenCalledTimes(1);
    });

    it('still re-pulls for background channels while the live channel streams', async () => {
        focusWindow();
        liveIds.add('ch-9');
        renderCounts();

        emitSocketFrame({ type: 'chat.sync', data: { channelId: 'ch-8', chatNo: 3 } });
        await advanceDebounce();

        expect(channelMocks.fetchList).toHaveBeenCalledTimes(1);
    });

    it('still re-pulls for a frame that names no channel', async () => {
        focusWindow();
        liveIds.add('ch-9');
        renderCounts();

        emitSocketFrame({ type: 'chat.sync', data: {} });
        await advanceDebounce();

        expect(channelMocks.fetchList).toHaveBeenCalledTimes(1);
    });

    it('still re-pulls on an FCM push, which names no channel here', async () => {
        focusWindow();
        liveIds.add('ch-9');
        renderCounts();

        emitPush();
        await advanceDebounce();

        expect(channelMocks.fetchList).toHaveBeenCalledTimes(1);
    });
});

describe('usePlaceUnreadCounts notify mode', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useNotificationPrefsStore.setState({ channelNotify: {}, mutedChannels: {} });
    });

    afterEach(() => {
        channelMocks.fetchList.mockResolvedValue({ list: [] });
        useNotificationPrefsStore.setState({ channelNotify: {}, mutedChannels: {} });
    });

    it('drops a channel from the counts the moment it is muted, without re-pulling', async () => {
        const channel = {
            id: 'g',
            cid: 'cloud-1',
            sid: 'place-a',
            stereo: 'private',
            memberIds: ['me'],
            chatNo: 3,
            metaNo: 0,
            $join: { chatNo: 0, metaNo: 0 },
            lastChat$: { ownerId: 'other' },
        };
        channelMocks.fetchList.mockResolvedValue({ list: [channel] } as never);
        const { result } = renderHook(() => usePlaceUnreadCounts());
        await act(async () => undefined);
        expect(result.current).toEqual({ byPlace: { 'place-a': 3 }, total: 3 });
        channelMocks.fetchList.mockClear();

        act(() => useNotificationPrefsStore.getState().setChannelNotify('g', 'none'));

        expect(result.current).toEqual({ byPlace: {}, total: 0 });
        expect(channelMocks.fetchList).not.toHaveBeenCalled();
    });
});

describe('usePlaceUnreadCounts mentions', () => {
    const mentionChannel = {
        id: 'g',
        cid: 'cloud-1',
        sid: 'place-a',
        stereo: 'private',
        memberIds: ['me'],
        chatNo: 1,
        metaNo: 0,
        $join: { chatNo: 0, metaNo: 0, notify: 'mention' },
        lastChat$: { ownerId: 'other' },
    };

    const captureMention = () =>
        useMentionsStore.getState().add({
            id: 'g:1',
            cloudId: 'cloud-1',
            channelId: 'g',
            placeId: 'place-a',
            chatNo: 1,
            content: '@me hi',
            ownerName: 'Ada',
            createdAt: 1,
        });

    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        liveIds.clear();
        connectionMocks.onMessageHandler = null;
        useNotificationPrefsStore.setState({ channelNotify: {}, mutedChannels: {} });
        useMentionsStore.setState({ items: {} });
    });

    afterEach(() => {
        channelMocks.fetchList.mockResolvedValue({ list: [] });
        useNotificationPrefsStore.setState({ channelNotify: {}, mutedChannels: {} });
        useMentionsStore.setState({ items: {} });
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('adds a mentions-only mention to the total the moment it lands, without re-pulling', async () => {
        channelMocks.fetchList.mockResolvedValue({ list: [mentionChannel] } as never);
        const { result } = renderHook(() => usePlaceUnreadCounts());
        await act(async () => undefined);
        await act(async () => undefined);
        expect(result.current).toEqual({ byPlace: {}, total: 0 });
        channelMocks.fetchList.mockClear();

        act(() => captureMention());

        expect(result.current).toEqual({ byPlace: { 'place-a': 1 }, total: 1 });
        expect(channelMocks.fetchList).not.toHaveBeenCalled();
    });

    it('counts the mention once the channel list arrives after it', async () => {
        channelMocks.fetchList.mockResolvedValue({ list: [] });
        const { result } = renderHook(() => usePlaceUnreadCounts());
        await act(async () => undefined);

        act(() => captureMention());
        expect(result.current).toEqual({ byPlace: {}, total: 0 });

        channelMocks.fetchList.mockResolvedValue({ list: [mentionChannel] } as never);
        emitPush();
        await advanceDebounce();

        expect(result.current).toEqual({ byPlace: { 'place-a': 1 }, total: 1 });
    });
});
