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

vi.mock('./usePlaces', () => ({
    usePlaces: () => ({ placeIds: [] as string[] }),
}));

// The live-read registry is module state; the hook under test only reads it.
const liveIds = vi.hoisted(() => new Set<string>());
vi.mock('./liveReadRegistry', () => ({
    isChannelReadLive: (channelId: string) => liveIds.has(channelId),
}));

import { webClient } from '@chatic/bridges';

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
