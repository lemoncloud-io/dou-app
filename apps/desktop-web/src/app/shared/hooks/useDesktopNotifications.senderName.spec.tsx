import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderHook } from '@testing-library/react';

import type * as UtilsModule from '../utils';

const ACCOUNT_UID = 'acct-1';
const CLOUD_UID = 'cloud-user-9';

let feedHandler: ((feed: unknown) => void) | null = null;
const present = vi.hoisted(() => vi.fn());

vi.mock('@chatic/runtime', async () => {
    const { browserPush, fakeRuntimeModule } = await import('@chatic/runtime/testing');
    return fakeRuntimeModule({
        data: {
            useRuntimeRepositories: () => ({
                channel: { observeList: () => () => undefined },
                join: { observeList: () => () => undefined },
            }),
        },
        connection: { useRuntimeSocketState: () => ({ isVerified: false }) },
        session: { useSessionIdentity: () => ({ userId: ACCOUNT_UID }) },
        // Inside the desktop shell: the page can raise an OS banner.
        push: { ...browserPush(), localBanner: { present } },
    });
});

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
import { usePlaceProfilesStore } from '../stores/usePlaceProfilesStore';
import { useDesktopNotifications } from './useDesktopNotifications';

const feed = (chat: Record<string, unknown>, joinUserId: string | null = CLOUD_UID) => ({
    placeId: 'place-1',
    channel: { id: 'ch-1', name: 'general', $join: joinUserId ? { userId: joinUserId } : undefined },
    chat: { id: 'ch-1:5', chatNo: 5, content: 'hello', ownerId: 'someone-else', ...chat },
});

beforeEach(() => {
    vi.clearAllMocks();
    feedHandler = null;
    useReadCursorStore.setState({ cursors: {} });
    useSelectedChannelStore.setState({ selectedChannelId: null });
    useNotificationPrefsStore.setState({
        desktopEnabled: true,
        mutedChannels: {},
        channelNotify: {},
        snoozeUntil: null,
        quietHours: null,
        mentionBreaksQuietHours: false,
    });
    renderHook(() => useDesktopNotifications());
});

// The banner names a sender the way the feed does: their Place Profile nick wins over the message's
// `owner$.name`, a snapshot the server took when the row was written that can carry another name.
describe('banner sender name', () => {
    const banner = (): { title?: string; body?: string } =>
        (present.mock.calls[0]?.[0] as { title?: string; body?: string } | undefined) ?? {};

    beforeEach(() => {
        usePlaceProfilesStore.setState({ bySid: { 'place-1': { 'u-alice': { nick: 'Alice' } } } });
    });

    it('names the sender of a channel message as the feed does', () => {
        feedHandler?.(feed({ ownerId: 'u-alice', content: 'photo', owner$: { name: 'Bob' } }));
        expect(banner().body).toBe('Alice: photo');
    });

    it('titles a 1:1 with the sender as the feed names them', () => {
        const { channel, ...rest } = feed({ ownerId: 'u-alice', content: 'hi', owner$: { name: 'Bob' } });
        feedHandler?.({ ...rest, channel: { ...channel, name: undefined, stereo: 'dm' } });
        expect(banner().title).toBe('Alice');
    });
});
