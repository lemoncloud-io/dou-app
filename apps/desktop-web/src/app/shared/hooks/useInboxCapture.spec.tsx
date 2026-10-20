import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderHook } from '@testing-library/react';

import type * as UtilsModule from '../utils';

const ACCOUNT_UID = 'acct-1';
const CLOUD_UID = 'cloud-user-9';

let feedHandler: ((feed: unknown) => void) | null = null;

// What this device has cached, by message id — a reaction is captured only when its target is here.
const cache = vi.hoisted(() => new Map<string, Record<string, unknown>>());
const cacheFails = vi.hoisted(() => ({ current: false }));
const warn = vi.hoisted(() => vi.fn());
vi.mock('@chatic/bridges', () => ({ logger: { warn: (...args: unknown[]) => warn(...args) } }));
vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            getGlobalSessionContext: () => ({ identity: { userId: ACCOUNT_UID } }),
        },
        data: {
            getCloudRepositories: () => ({
                chat: {
                    cacheRead: async (id: string) => {
                        if (cacheFails.current) throw new Error('cache closed');
                        return cache.get(id) ?? null;
                    },
                },
            }),
        },
    },
}));

vi.mock('./useChannelChatFeeds', () => ({
    useChannelChatFeeds: (handler: (feed: unknown) => void) => {
        feedHandler = handler;
    },
}));

vi.mock('../utils', async () => ({
    ...(await vi.importActual<typeof UtilsModule>('../utils')),
    resolveMyMentionNames: () => ['Me'],
}));

import '../../../i18n';
import { useMentionsStore, useReadCursorStore } from '../stores';
import { captureInboxReply, useInboxCapture } from './useInboxCapture';

const channel = (joinUserId?: string, stereo?: string) => ({
    id: 'ch-1',
    cid: 'cloud-1',
    name: '#general',
    stereo,
    $join: joinUserId ? { userId: joinUserId } : undefined,
});

const feed = (chat: Record<string, unknown>, joinUserId: string | null = CLOUD_UID, stereo?: string) => ({
    placeId: 'place-1',
    channel: channel(joinUserId ?? undefined, stereo),
    chat: { id: 'ch-1:5', chatNo: 5, content: 'hello @Me', ownerId: 'someone-else', ...chat },
});

const captured = () => Object.values(useMentionsStore.getState().items);

beforeEach(() => {
    feedHandler = null;
    useMentionsStore.setState({ items: {} });
    useReadCursorStore.setState({ cursors: {} });
    cache.clear();
    cacheFails.current = false;
    warn.mockReset();
    renderHook(() => useInboxCapture());
});

describe('useInboxCapture mentions', () => {
    it('captures a mention written by someone else', () => {
        feedHandler?.(feed({}));
        expect(captured().map(item => [item.id, item.kind])).toEqual([['ch-1:5', 'direct']]);
    });

    it('files a call to everyone as such, not as a mention by name', () => {
        feedHandler?.(feed({ content: 'standup', mention$: { all: 1 } }));
        expect(captured().map(item => item.kind)).toEqual(['everyone']);
    });

    it('skips my own message identified by my account id', () => {
        feedHandler?.(feed({ ownerId: ACCOUNT_UID }));
        expect(captured()).toEqual([]);
    });

    // Outside the relay a persisted message's owner is the per-cloud user id, not the account uid.
    it('skips my own message identified by my per-channel cloud user id', () => {
        feedHandler?.(feed({ ownerId: CLOUD_UID }));
        expect(captured()).toEqual([]);
    });

    it('captures a webhook mention even when its owner id is mine', () => {
        feedHandler?.(feed({ ownerId: CLOUD_UID, stereo: 'webhook' }));
        expect(captured().map(item => item.id)).toEqual(['ch-1:5']);
    });

    it('skips my own message when the embedded owner carries my cloud user id', () => {
        feedHandler?.(feed({ ownerId: undefined, owner$: { id: CLOUD_UID, name: 'Me' } }));
        expect(captured()).toEqual([]);
    });

    it('compares only my account id when the channel has no join of mine', () => {
        feedHandler?.(feed({ ownerId: CLOUD_UID }, null));
        expect(captured().map(item => item.id)).toEqual(['ch-1:5']);

        useMentionsStore.setState({ items: {} });
        feedHandler?.(feed({ ownerId: ACCOUNT_UID }, null));
        expect(captured()).toEqual([]);
    });

    it('skips a row without an id instead of storing it', () => {
        feedHandler?.(feed({ id: undefined }));
        expect(captured()).toEqual([]);
    });

    // The phone writes the name its list showed; the record carries my id either way.
    it('captures a message whose record names me though the text does not', () => {
        feedHandler?.(feed({ content: '@Nickname hello', mention$: { userIds: [CLOUD_UID] } }));
        expect(captured().map(item => item.id)).toEqual(['ch-1:5']);
    });

    it('captures a message whose record calls everyone, with no @ in what is left of its text', () => {
        feedHandler?.(feed({ content: 'standup', mention$: { all: 1 } }));
        expect(captured().map(item => item.id)).toEqual(['ch-1:5']);
    });

    it('skips a message that has my name in its text when its record names someone else', () => {
        feedHandler?.(feed({ content: 'hello @Me', mention$: { userIds: ['u-other'] } }));
        expect(captured()).toEqual([]);
    });

    // I called everyone; the record's `all` covers me too, and my own message is still not my mention.
    it('skips my own message whose record calls everyone', () => {
        feedHandler?.(feed({ ownerId: CLOUD_UID, content: 'standup', mention$: { all: 1 } }));
        expect(captured()).toEqual([]);
    });

    it('dates the item by when it was sent, not when this device saw it', () => {
        feedHandler?.(feed({ createdAt: 1_700_000_000_000 }));
        expect(captured()[0]?.createdAt).toBe(1_700_000_000_000);
    });

    it('falls back to the capture time when the message carries none', () => {
        const before = Date.now();
        feedHandler?.(feed({}));
        const createdAt = captured()[0]?.createdAt ?? 0;
        expect(createdAt).toBeGreaterThanOrEqual(before);
        expect(createdAt).toBeLessThanOrEqual(Date.now());
    });

    it('stores the preview, not the whole body', () => {
        feedHandler?.(feed({ content: `@Me ${'x'.repeat(500)}` }));
        expect(captured()[0]?.content.length).toBeLessThanOrEqual(240);
    });
});

describe('useInboxCapture direct messages', () => {
    it('captures every new message in a 1:1, mention or not', () => {
        feedHandler?.(feed({ content: 'are you there?' }, CLOUD_UID, 'dm'));
        expect(captured().map(item => [item.id, item.kind])).toEqual([['ch-1:5', 'dm']]);
    });

    // One message, one item: a 1:1 message that also names me is the DM, not a second mention.
    it('files a 1:1 message that names me as the DM', () => {
        feedHandler?.(feed({ content: 'hello @Me' }, CLOUD_UID, 'dm'));
        expect(captured().map(item => item.kind)).toEqual(['dm']);
    });

    it('skips my own 1:1 message', () => {
        feedHandler?.(feed({ content: 'hi', ownerId: CLOUD_UID }, CLOUD_UID, 'dm'));
        expect(captured()).toEqual([]);
    });

    it('skips a 1:1 message I have already read', () => {
        useReadCursorStore.setState({ cursors: { 'ch-1': 5 } });
        feedHandler?.(feed({ content: 'hi' }, CLOUD_UID, 'dm'));
        expect(captured()).toEqual([]);
    });

    // A photo or a file sent on its own has no text, and is still a new message.
    it('captures a 1:1 message that is only an attachment, by its attachment label', () => {
        feedHandler?.(
            feed(
                { content: '', uploadIds: ['u1'], upload$$: [{ id: 'u1', contentType: 'image/png' }] },
                CLOUD_UID,
                'dm'
            )
        );
        const [item] = captured();
        expect(item?.kind).toBe('dm');
        expect(item?.content).not.toBe('');
    });

    // The list reads where an item happened long after its place's channels have gone out of memory.
    it('keeps the channel name with a channel item, and marks a 1:1 item as one instead', () => {
        feedHandler?.(feed({ id: 'ch-1:5' }));
        feedHandler?.(feed({ id: 'ch-1:6', chatNo: 6, content: 'hi' }, CLOUD_UID, 'dm'));
        const byId = useMentionsStore.getState().items;
        expect(byId['ch-1:5']).toMatchObject({ channelName: 'general' });
        expect(byId['ch-1:5'].inDm).toBeUndefined();
        expect(byId['ch-1:6']).toMatchObject({ inDm: true });
        expect(byId['ch-1:6'].channelName).toBeUndefined();
    });

    it('skips a channel message that does not call me', () => {
        feedHandler?.(feed({ content: 'lunch?' }));
        expect(captured()).toEqual([]);
    });
});

describe('useInboxCapture reactions', () => {
    const reaction = (action: 'on' | 'off', extra: Record<string, unknown> = {}) =>
        feed({
            id: 'ch-1:9',
            chatNo: 9,
            content: '',
            stereo: 'system',
            subType: 'reaction',
            reaction$: { chatId: 'ch-1:4', emoji: '👍', action },
            owner$: { id: 'u-ada', name: 'Ada' },
            ownerId: 'u-ada',
            ...extra,
        });
    const settle = () => new Promise(resolve => setTimeout(resolve, 0));

    it('captures a reaction to my message, with what it reacted to', async () => {
        cache.set('ch-1:4', { id: 'ch-1:4', chatNo: 4, content: 'ship it', ownerId: CLOUD_UID });
        feedHandler?.(reaction('on'));
        await settle();

        const [item] = captured();
        expect(item).toMatchObject({ kind: 'reaction', emoji: '👍', ownerName: 'Ada', content: 'ship it', chatNo: 9 });
        // Keyed by target, emoji and person: the reaction event's own id changes with every toggle.
        expect(item.id).toBe('reaction:ch-1:4:👍:u-ada');
    });

    it('marks a reaction in a 1:1 as one, so it is listed with the DMs', async () => {
        cache.set('ch-1:4', { id: 'ch-1:4', chatNo: 4, content: 'ship it', ownerId: CLOUD_UID });
        feedHandler?.({ ...reaction('on'), channel: channel(CLOUD_UID, 'dm') });
        await settle();
        expect(captured()[0]).toMatchObject({ kind: 'reaction', inDm: true });
    });

    it('skips a reaction being taken back', async () => {
        cache.set('ch-1:4', { id: 'ch-1:4', chatNo: 4, content: 'ship it', ownerId: CLOUD_UID });
        feedHandler?.(reaction('off'));
        await settle();
        expect(captured()).toEqual([]);
    });

    it('skips a reaction to someone else’s message', async () => {
        cache.set('ch-1:4', { id: 'ch-1:4', chatNo: 4, content: 'ship it', ownerId: 'u-bob' });
        feedHandler?.(reaction('on'));
        await settle();
        expect(captured()).toEqual([]);
    });

    // No server call for a reaction: a target this device never cached is left out.
    it('skips a reaction whose message this device has not cached', async () => {
        feedHandler?.(reaction('on'));
        await settle();
        expect(captured()).toEqual([]);
    });

    it('skips a reaction I have already read in the channel', async () => {
        cache.set('ch-1:4', { id: 'ch-1:4', chatNo: 4, content: 'ship it', ownerId: CLOUD_UID });
        useReadCursorStore.setState({ cursors: { 'ch-1': 9 } });
        feedHandler?.(reaction('on'));
        await settle();
        expect(captured()).toEqual([]);
    });

    it('leaves a reaction out and says so when its target cannot be read', async () => {
        cacheFails.current = true;
        feedHandler?.(reaction('on'));
        await settle();
        expect(captured()).toEqual([]);
        expect(warn).toHaveBeenCalledWith('CHAT', expect.stringContaining('reaction'), expect.anything());
    });

    it('skips my own reaction', async () => {
        cache.set('ch-1:4', { id: 'ch-1:4', chatNo: 4, content: 'ship it', ownerId: CLOUD_UID });
        feedHandler?.(reaction('on', { owner$: { id: CLOUD_UID, name: 'Me' }, ownerId: CLOUD_UID }));
        await settle();
        expect(captured()).toEqual([]);
    });
});

describe('captureInboxReply', () => {
    const reply = (chat: Record<string, unknown> = {}) => ({
        placeId: 'place-1',
        channel: channel(CLOUD_UID),
        chat: { id: 'ch-1:7', chatNo: 7, content: 'agreed', ownerId: 'u-ada', parentId: '4', ...chat },
    });

    it('files a reply in my thread', () => {
        captureInboxReply(reply());
        expect(captured().map(item => [item.id, item.kind, item.parentId])).toEqual([['ch-1:7', 'reply', '4']]);
    });

    // A reply that names me is already in the inbox as a mention; it is not filed twice or downgraded.
    it('leaves a reply that also names me to the mention', () => {
        feedHandler?.(feed({ id: 'ch-1:7', chatNo: 7, content: 'agreed @Me', parentId: '4' }));
        captureInboxReply(reply({ content: 'agreed @Me' }));
        expect(captured().map(item => item.kind)).toEqual(['direct']);
    });

    it('skips my own reply', () => {
        captureInboxReply(reply({ ownerId: CLOUD_UID }));
        expect(captured()).toEqual([]);
    });
});
