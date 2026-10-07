import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderHook } from '@testing-library/react';

import type * as UtilsModule from '../utils';

const ACCOUNT_UID = 'acct-1';
const CLOUD_UID = 'cloud-user-9';

let feedHandler: ((feed: unknown) => void) | null = null;
const request = vi.hoisted(() => vi.fn());

vi.mock('@chatic/bridges', () => ({
    isNative: () => true,
    webClient: { request },
}));

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: () => ({
                channel: { observeList: () => () => undefined },
                join: { observeList: () => () => undefined },
            }),
        },
        connection: { useRuntimeSocketState: () => ({ isVerified: false }) },
        session: { useSessionIdentity: () => ({ userId: ACCOUNT_UID }) },
    },
}));

vi.mock('./usePlaces', () => ({ usePlaces: () => ({ places: [] }) }));

vi.mock('./useChannelChatFeeds', () => ({
    useChannelChatFeeds: (handler: (feed: unknown) => void) => {
        feedHandler = handler;
    },
}));

vi.mock('../utils', async () => ({
    ...(await vi.importActual<typeof UtilsModule>('../utils')),
    resolveMyMentionNames: () => ['Me'],
}));

import { useNotificationPrefsStore, useReadCursorStore, useSelectedChannelStore } from '../stores';
import { useDesktopNotifications } from './useDesktopNotifications';

const feed = (chat: Record<string, unknown>, joinUserId: string | null = CLOUD_UID) => ({
    placeId: 'place-1',
    channel: { id: 'ch-1', name: 'general', $join: joinUserId ? { userId: joinUserId } : undefined },
    chat: { id: 'ch-1:5', chatNo: 5, content: 'hello', ownerId: 'someone-else', ...chat },
});

beforeEach(() => {
    vi.clearAllMocks();
    request.mockResolvedValue(undefined);
    feedHandler = null;
    useReadCursorStore.setState({ cursors: {} });
    useSelectedChannelStore.setState({ selectedChannelId: null });
    useNotificationPrefsStore.setState({
        desktopEnabled: true,
        mutedChannels: {},
        channelNotify: {},
        snoozeUntil: null,
        quietHours: null,
    });
    renderHook(() => useDesktopNotifications());
});

describe('useDesktopNotifications', () => {
    it('banners a message written by someone else', () => {
        feedHandler?.(feed({}));
        expect(request).toHaveBeenCalledTimes(1);
    });

    it('stays silent for my own message identified by my account id', () => {
        feedHandler?.(feed({ ownerId: ACCOUNT_UID }));
        expect(request).not.toHaveBeenCalled();
    });

    // Outside the relay a persisted message's owner is the per-channel cloud user id.
    it('stays silent for my own message identified by my per-channel cloud user id', () => {
        feedHandler?.(feed({ ownerId: CLOUD_UID }));
        expect(request).not.toHaveBeenCalled();
    });

    // A webhook is never mine, even if the server stamps my id on it: the feed shows it as unread,
    // so the banner must not be the one surface that calls it mine.
    it('banners a webhook message even when its owner id is mine', () => {
        feedHandler?.(feed({ ownerId: CLOUD_UID, stereo: 'webhook' }));
        expect(request).toHaveBeenCalledTimes(1);
    });

    it('still banners someone else when the channel has no join of mine yet', () => {
        feedHandler?.(feed({}, null));
        expect(request).toHaveBeenCalledTimes(1);
    });
});
