import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { act, renderHook } from '@testing-library/react';

vi.mock('@chatic/bridges', () => ({
    webClient: { onEvent: vi.fn(() => () => undefined) },
    isNative: vi.fn(() => false),
    logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const channelMocks = {
    fetchList: vi.fn(async () => ({ list: [] })),
};

type MessageHandler = (event: { message: unknown }) => void;
type ClientCallback = (client: unknown) => void;

const managerMocks = {
    onMessageHandler: null as MessageHandler | null,
    onMessage: vi.fn((handler: MessageHandler) => {
        managerMocks.onMessageHandler = handler;
        return () => undefined;
    }),
    subscribeClient: vi.fn((callback: ClientCallback) => {
        callback({ id: 'client-1' });
        return () => undefined;
    }),
};

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: { useRuntimeRepositories: () => ({ channel: channelMocks }) },
        session: {
            useGlobalSession: () => ({ activeServer: { kind: 'cloud', cloudId: 'cloud-1' } }),
            useSessionIdentity: () => ({ userId: 'me' }),
        },
        connection: {
            useRuntimeSocketState: () => ({ isVerified: true }),
            getSocketManager: () => managerMocks,
        },
    },
}));

// One array for every render, as the real hook gives: a fresh one would rebuild the counts on each
// render and hide a missing dependency.
vi.mock('./usePlaces', () => {
    const placeIds: string[] = [];
    return { usePlaces: () => ({ placeIds }) };
});

// The live-read registry is module state; the hook under test only reads it.
const liveIds = vi.hoisted(() => new Set<string>());
vi.mock('./liveReadRegistry', () => ({
    isChannelReadLive: (channelId: string) => liveIds.has(channelId),
}));

import { webClient } from '@chatic/bridges';

import { useNotificationPrefsStore } from '../stores';
import { usePlaceUnreadCounts } from './usePlaceUnreadCounts';

type PushHandler = (message: unknown) => void;

const pushHandlers = (): PushHandler[] =>
    (webClient.onEvent as ReturnType<typeof vi.fn>).mock.calls
        .filter(([event]) => event === 'OnReceiveNotification')
        .map(([, handler]) => handler);

const emitPush = () => {
    for (const handler of pushHandlers()) {
        act(() => {
            handler({ data: {} });
        });
    }
};

const emitSocketFrame = (message: unknown) => {
    act(() => {
        managerMocks.onMessageHandler?.({ message });
    });
};

const advanceDebounce = async () => {
    await act(async () => {
        vi.advanceTimersByTime(400);
    });
};

// jsdom reports no focus; the skip under test needs a focused, visible window.
const focusWindow = () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
};

describe('usePlaceUnreadCounts live-read skip', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        liveIds.clear();
        managerMocks.onMessageHandler = null;
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    const renderCounts = () => {
        const hook = renderHook(() => usePlaceUnreadCounts());
        // Mount fires the verify-edge fetch; each case starts past it.
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
