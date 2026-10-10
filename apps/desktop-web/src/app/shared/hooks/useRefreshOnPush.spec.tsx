import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { act, renderHook } from '@testing-library/react';

vi.mock('@chatic/bridges', () => ({
    webClient: { onEvent: vi.fn(() => () => undefined) },
    isNative: vi.fn(() => false),
    logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const channelMocks = {
    refreshList: vi.fn(() => Promise.resolve()),
    refreshOne: vi.fn(() => Promise.resolve({})),
};

type PushHandler = (message: any) => void;
type MessageHandler = (event: { message: unknown }) => void;
type ClientCallback = (client: unknown) => void;

const managerMocks = {
    onMessageHandler: null as MessageHandler | null,
    clientCallback: null as ClientCallback | null,
    onMessage: vi.fn((handler: MessageHandler) => {
        managerMocks.onMessageHandler = handler;
        return () => undefined;
    }),
    subscribeClient: vi.fn((callback: ClientCallback) => {
        managerMocks.clientCallback = callback;
        // A live client from the start, like the running app.
        callback({ id: 'client-1' });
        return () => undefined;
    }),
};

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: { useRuntimeRepositories: () => ({ channel: channelMocks }) },
        session: { useSessionSelection: () => ({ selectedSiteId: 'site-1' }) },
        connection: { getSocketManager: () => managerMocks },
    },
}));

import { webClient } from '@chatic/bridges';

import { chatFrameChannelIdOf, useRefreshOnPush } from './useRefreshOnPush';

const pushHandlers = (): PushHandler[] =>
    (webClient.onEvent as ReturnType<typeof vi.fn>).mock.calls
        .filter(([event]) => event === 'OnReceiveNotification')
        .map(([, handler]) => handler);

const emitPush = (deeplink: string | undefined) => {
    for (const handler of pushHandlers()) {
        handler({ data: { notification: { data: { deeplink } } } });
    }
};

const emitSocketFrame = (message: unknown) => {
    act(() => {
        managerMocks.onMessageHandler?.({ message });
    });
};

const advanceDebounce = () => {
    act(() => {
        vi.advanceTimersByTime(400);
    });
};

describe('chatFrameChannelIdOf', () => {
    it('reads the channel off a chat.sync frame payload', () => {
        expect(chatFrameChannelIdOf({ type: 'chat.sync', data: { channelId: 'ch-1', chatNo: 7 } })).toBe('ch-1');
    });

    it('reads empty for frames without an attributable channel', () => {
        expect(chatFrameChannelIdOf({ type: 'chat.sync', data: null })).toBe('');
        expect(chatFrameChannelIdOf({ type: 'chat.sync', data: {} })).toBe('');
        expect(chatFrameChannelIdOf({ type: 'chat.sync', data: { channelId: 42 } })).toBe('');
        expect(chatFrameChannelIdOf(null)).toBe('');
    });
});

describe('useRefreshOnPush', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        managerMocks.onMessageHandler = null;
        managerMocks.clientCallback = null;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('refreshes one channel for a socket chat frame that names it, not the whole list', () => {
        renderHook(() => useRefreshOnPush());

        emitSocketFrame({ type: 'chat.sync', data: { channelId: 'ch-1', chatNo: 7 } });
        advanceDebounce();

        expect(channelMocks.refreshOne).toHaveBeenCalledTimes(1);
        expect(channelMocks.refreshOne).toHaveBeenCalledWith('ch-1', 'site-1');
        expect(channelMocks.refreshList).not.toHaveBeenCalled();
    });

    it('falls back to the whole list for a chat frame that names no channel', () => {
        renderHook(() => useRefreshOnPush());

        emitSocketFrame({ type: 'chat.sync', data: null });
        advanceDebounce();

        expect(channelMocks.refreshOne).not.toHaveBeenCalled();
        expect(channelMocks.refreshList).toHaveBeenCalledTimes(1);
        expect(channelMocks.refreshList).toHaveBeenCalledWith({ sid: 'site-1' });
    });

    it('coalesces a burst across rooms into one fire with one pull per room', () => {
        renderHook(() => useRefreshOnPush());

        emitSocketFrame({ type: 'chat.sync', data: { channelId: 'ch-1' } });
        emitSocketFrame({ type: 'chat.sync', data: { channelId: 'ch-1' } });
        emitSocketFrame({ type: 'chat.sync', data: { channelId: 'ch-2' } });
        advanceDebounce();

        expect(channelMocks.refreshOne).toHaveBeenCalledTimes(2);
        expect(channelMocks.refreshOne).toHaveBeenCalledWith('ch-1', 'site-1');
        expect(channelMocks.refreshOne).toHaveBeenCalledWith('ch-2', 'site-1');
        expect(channelMocks.refreshList).not.toHaveBeenCalled();
    });

    it('refreshes one channel for a same-cloud push deeplink', () => {
        renderHook(() => useRefreshOnPush());

        emitPush('chatic-open:place-a|ch-9');
        advanceDebounce();

        expect(channelMocks.refreshOne).toHaveBeenCalledWith('ch-9', 'site-1');
        expect(channelMocks.refreshList).not.toHaveBeenCalled();
    });

    it('skips a cross-cloud push — that cloud has its own background receive loop', () => {
        renderHook(() => useRefreshOnPush());

        emitPush('chatic-open:cloud-b|place-a|ch-9');
        advanceDebounce();

        expect(channelMocks.refreshOne).not.toHaveBeenCalled();
        expect(channelMocks.refreshList).not.toHaveBeenCalled();
    });

    it('ignores non-chat socket frames and unparseable push links', () => {
        renderHook(() => useRefreshOnPush());

        emitSocketFrame({ type: 'system.ping', data: {} });
        emitPush('chatic-ui:settings');
        advanceDebounce();

        expect(channelMocks.refreshOne).not.toHaveBeenCalled();
        expect(channelMocks.refreshList).not.toHaveBeenCalled();
    });
});
