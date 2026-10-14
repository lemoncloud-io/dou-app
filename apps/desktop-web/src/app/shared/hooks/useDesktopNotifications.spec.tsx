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
import i18n from '../../../i18n';

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
        mentionBreaksQuietHours: false,
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

    describe('in a channel set to mentions only', () => {
        const mentionOnly = (chat: Record<string, unknown>) => {
            const { channel, ...rest } = feed(chat);
            return { ...rest, channel: { ...channel, $join: { userId: CLOUD_UID, notify: 'mention' } } };
        };

        it('banners a message whose record names me though the text does not', () => {
            feedHandler?.(mentionOnly({ content: '@Nickname hello', mention$: { userIds: [CLOUD_UID] } }));
            expect(request).toHaveBeenCalledTimes(1);
        });

        it('stays silent for my name in the text when the record names someone else', () => {
            feedHandler?.(mentionOnly({ content: 'hello @Me', mention$: { userIds: ['u-other'] } }));
            expect(request).not.toHaveBeenCalled();
        });

        // A 1:1 has no such level: the server sends every message of it, so this banners them all.
        it('banners every message of a 1:1 that was left on mentions only', () => {
            const { channel, ...rest } = mentionOnly({ content: 'hello' });
            feedHandler?.({ ...rest, channel: { ...channel, name: undefined, stereo: 'dm' } });
            expect(request).toHaveBeenCalledTimes(1);
        });
    });

    describe('banner title', () => {
        const titleOfFirstBanner = (): string => {
            const call = request.mock.calls[0]?.[0] as { data?: { title?: string } } | undefined;
            return call?.data?.title ?? '';
        };

        it('titles a message whose record names me as a mention of the channel', () => {
            feedHandler?.(
                feed({ content: 'hello', mention$: { userIds: [CLOUD_UID] }, owner$: { name: 'Raine' } })
            );
            expect(titleOfFirstBanner()).toBe(i18n.t('notification.mentionTitle', { target: '#general' }));
        });

        it('titles a message whose record calls everyone', () => {
            feedHandler?.(feed({ content: 'standup', mention$: { all: true }, owner$: { name: 'Raine' } }));
            expect(titleOfFirstBanner()).toBe(
                i18n.t('notification.everyoneTitle', {
                    word: i18n.t('chat.mention.everyoneWord'),
                    target: '#general',
                })
            );
        });

        it('prefers the direct title when the record names me beside everyone', () => {
            feedHandler?.(
                feed({
                    content: 'hi',
                    mention$: { userIds: [CLOUD_UID], all: true },
                    owner$: { name: 'Raine' }
                })
            );
            expect(titleOfFirstBanner()).toBe(i18n.t('notification.mentionTitle', { target: '#general' }));
        });

        it('keeps the plain title when the record names someone else though the text has my name', () => {
            feedHandler?.(
                feed({ content: 'hello @Me', mention$: { userIds: ['u-other'] }, owner$: { name: 'Raine' } })
            );
            expect(titleOfFirstBanner()).toBe('#general');
        });

        it('titles a mention in a nameless group channel with the sender', () => {
            const { channel, ...rest } = feed({
                content: 'hello',
                mention$: { userIds: [CLOUD_UID] },
                owner$: { name: 'Raine' }
            });
            feedHandler?.({ ...rest, channel: { ...channel, name: undefined } });
            expect(titleOfFirstBanner()).toBe(i18n.t('notification.mentionTitle', { target: 'Raine' }));
        });

        it('keeps the sender title for a 1:1 whatever the record says', () => {
            const { channel, ...rest } = feed({
                content: 'hello',
                mention$: { userIds: [CLOUD_UID] },
                owner$: { name: 'Raine' }
            });
            feedHandler?.({ ...rest, channel: { ...channel, name: undefined, stereo: 'dm' } });
            expect(titleOfFirstBanner()).toBe('Raine');
        });

        it('reads "@all · #channel" in English', () => {
            expect(
                i18n.t('notification.everyoneTitle', {
                    lng: 'en',
                    word: i18n.t('chat.mention.everyoneWord', { lng: 'en' }),
                    target: '#general'
                })
            ).toBe('@all · #general');
        });

        it('stays silent for a mention in a channel turned off', () => {
            useNotificationPrefsStore.setState({ channelNotify: { 'ch-1': 'none' } });
            feedHandler?.(
                feed({ content: 'hello', mention$: { userIds: [CLOUD_UID] }, owner$: { name: 'Raine' } })
            );
            expect(request).not.toHaveBeenCalled();
        });

        // The banner copy is translated at notify time, so both locales render through this path.
        it.each([
            ['ko', '멘션 · #general', '@전체 · #general'],
            ['en', 'Mention · #general', '@all · #general'],
        ] as const)('renders the mention titles through the banner in %s', async (lng, direct, everyone) => {
            const prev = i18n.language;
            await i18n.changeLanguage(lng);
            try {
                feedHandler?.(
                    feed({ content: 'hello', mention$: { userIds: [CLOUD_UID] }, owner$: { name: 'Raine' } })
                );
                expect(titleOfFirstBanner()).toBe(direct);
                vi.clearAllMocks();
                request.mockResolvedValue(undefined);
                feedHandler?.(feed({ content: 'standup', mention$: { all: true }, owner$: { name: 'Raine' } }));
                expect(titleOfFirstBanner()).toBe(everyone);
            } finally {
                await i18n.changeLanguage(prev);
            }
        });
    });

    describe('quiet-hours breakthrough', () => {
        const ALL_DAY = { start: '00:00', end: '23:59' };
        const directFeed = (chat: Record<string, unknown> = {}) =>
            feed({ content: 'hello', mention$: { userIds: [CLOUD_UID] }, owner$: { name: 'Raine' }, ...chat });
        const quietWith = (prefs: Record<string, unknown>) =>
            useNotificationPrefsStore.setState({ quietHours: ALL_DAY, ...prefs });

        it('stays silent in quiet hours when the toggle is off', () => {
            quietWith({ mentionBreaksQuietHours: false });
            feedHandler?.(directFeed());
            expect(request).not.toHaveBeenCalled();
        });

        it('banners a record-named direct mention when the toggle is on', () => {
            quietWith({ mentionBreaksQuietHours: true });
            feedHandler?.(directFeed());
            expect(request).toHaveBeenCalledTimes(1);
        });

        it('stays silent for an everyone call when the toggle is on', () => {
            quietWith({ mentionBreaksQuietHours: true });
            feedHandler?.(directFeed({ mention$: { all: true } }));
            expect(request).not.toHaveBeenCalled();
        });

        it('stays silent for my name in the text with no record when the toggle is on', () => {
            quietWith({ mentionBreaksQuietHours: true });
            feedHandler?.(feed({ content: 'hello @Me', owner$: { name: 'Raine' } }));
            expect(request).not.toHaveBeenCalled();
        });

        it('stays silent for a 1:1 when the toggle is on', () => {
            quietWith({ mentionBreaksQuietHours: true });
            const { channel, ...rest } = directFeed();
            feedHandler?.({ ...rest, channel: { ...channel, name: undefined, stereo: 'dm' } });
            expect(request).not.toHaveBeenCalled();
        });

        it('stays silent while snoozed when the toggle is on', () => {
            useNotificationPrefsStore.setState({
                quietHours: ALL_DAY,
                mentionBreaksQuietHours: true,
                snoozeUntil: Date.now() + 60_000,
            });
            feedHandler?.(directFeed());
            expect(request).not.toHaveBeenCalled();
        });

        it('stays silent for a channel turned off when the toggle is on', () => {
            quietWith({ mentionBreaksQuietHours: true, channelNotify: { 'ch-1': 'none' } });
            feedHandler?.(directFeed());
            expect(request).not.toHaveBeenCalled();
        });

        it('stays silent with the global switch off when the toggle is on', () => {
            quietWith({ mentionBreaksQuietHours: true, desktopEnabled: false });
            feedHandler?.(directFeed());
            expect(request).not.toHaveBeenCalled();
        });

        it('stays silent for the channel on screen when the toggle is on', () => {
            const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
            Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
            try {
                useSelectedChannelStore.setState({ selectedChannelId: 'ch-1' });
                quietWith({ mentionBreaksQuietHours: true });
                feedHandler?.(directFeed());
                expect(request).not.toHaveBeenCalled();
            } finally {
                hasFocus.mockRestore();
                Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'prerender' });
            }
        });
    });
});
