import { renderHook, waitFor } from '@testing-library/react';

import { useGlobalCacheSearch } from '@chatic/app-runtime';
import { logger } from '@chatic/bridges';

import { useSearchContext } from './useSearchContext';
import type { GlobalSearchResults } from './useGlobalSearch';

jest.mock('@chatic/app-runtime', () => ({
    useGlobalCacheSearch: jest.fn(),
    globalCacheRefKey: (cid: string, id: string) => `${cid}:${id}`,
    globalCacheProfileKey: (cid: string, sid: string, userId: string) => `${cid}:${sid}:${userId}`,
}));
jest.mock('@chatic/bridges', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

const resolveContext = jest.fn();

const EMPTY_CONTEXT = {
    channelsByRef: {},
    sitesByRef: {},
    joinsByRef: {},
    lastChatsByRef: {},
    profilesByRef: {},
    usersByRef: {},
};

const results = (overrides: Partial<GlobalSearchResults> = {}): GlobalSearchResults =>
    ({ clouds: [], places: [], channels: [], messages: [], ...overrides }) as GlobalSearchResults;

beforeEach(() => {
    jest.clearAllMocks();
    resolveContext.mockResolvedValue(EMPTY_CONTEXT);
    (useGlobalCacheSearch as jest.Mock).mockReturnValue({ search: jest.fn(), resolveContext });
});

describe('useSearchContext', () => {
    it('requests the clouds and channels the results reference, deduplicated', async () => {
        const input = results({
            places: [{ id: 'site-1', cid: 'cloud-a', name: 'HQ' }] as any,
            channels: [{ id: 'ch-1', cid: 'cloud-a', sid: 'site-1', name: 'Lounge' }] as any,
            messages: [
                { id: 'chat-1', cid: 'cloud-a', channelId: 'ch-1', chatNo: 5, content: 'hi' },
                { id: 'chat-2', cid: 'cloud-b', channelId: 'ch-2', chatNo: 6, content: 'yo' },
            ] as any,
        });

        renderHook(() => useSearchContext(input));

        await waitFor(() => expect(resolveContext).toHaveBeenCalledTimes(1));
        expect(resolveContext).toHaveBeenCalledWith({
            cids: ['cloud-a', 'cloud-b'],
            // ch-1 is referenced by both a channel row and a chat row — asked for once.
            channelRefs: [
                { cid: 'cloud-a', channelId: 'ch-1' },
                { cid: 'cloud-b', channelId: 'ch-2' },
            ],
        });
    });

    it('does not call the source at all for empty results', async () => {
        renderHook(() => useSearchContext(results()));
        await waitFor(() => expect(resolveContext).not.toHaveBeenCalled());
    });

    it('builds channel rows from the matched row plus the resolved context', async () => {
        resolveContext.mockResolvedValue({
            ...EMPTY_CONTEXT,
            sitesByRef: { 'cloud-a:site-1': { id: 'site-1', name: 'Lemon HQ' } },
            joinsByRef: { 'cloud-a:ch-1': { channelId: 'ch-1', readNo: 8 } },
            lastChatsByRef: { 'cloud-a:ch-1': { id: 'chat-9', content: 'see you', createdAtMs: 1700 } },
        });

        const input = results({
            channels: [
                {
                    id: 'ch-1',
                    cid: 'cloud-a',
                    sid: 'site-1',
                    name: 'Lounge',
                    thumbnail: 'data:image/png;base64,AAA',
                    memberNo: 4,
                    chatNo: 20,
                    metaNo: 2,
                },
            ] as any,
        });

        const { result } = renderHook(() => useSearchContext(input));

        await waitFor(() => expect(result.current.channels[0].placeName).toBe('Lemon HQ'));
        const row = result.current.channels[0];
        expect(row).toMatchObject({
            channelId: 'ch-1',
            name: 'Lounge',
            memberNo: 4,
            thumbnail: 'data:image/png;base64,AAA',
            placeName: 'Lemon HQ',
            lastMessage: 'see you',
            lastMessageAt: 1700,
        });
        // (chatNo 20 - metaNo 2) - readNo 8
        expect(row.unread).toBe(10);
    });

    it('shows no unread badge for a cloud with no cached join row', async () => {
        const input = results({
            channels: [{ id: 'ch-1', cid: 'cloud-a', sid: 'site-1', name: 'Lounge', chatNo: 40, metaNo: 0 }] as any,
        });

        const { result } = renderHook(() => useSearchContext(input));

        await waitFor(() => expect(resolveContext).toHaveBeenCalled());
        expect(result.current.channels[0].unread).toBe(0);
    });

    it('derives a chat row place from its owning channel', async () => {
        resolveContext.mockResolvedValue({
            ...EMPTY_CONTEXT,
            channelsByRef: { 'cloud-b:ch-2': { id: 'ch-2', sid: 'site-9', name: 'Bistro' } },
            sitesByRef: { 'cloud-b:site-9': { id: 'site-9', name: 'Beta Base' } },
        });

        const input = results({
            messages: [{ id: 'chat-2', cid: 'cloud-b', channelId: 'ch-2', chatNo: 6, content: 'yo' }] as any,
        });

        const { result } = renderHook(() => useSearchContext(input));

        await waitFor(() => expect(result.current.chats[0].channelName).toBe('Bistro'));
        expect(result.current.chats[0]).toMatchObject({ sid: 'site-9', placeName: 'Beta Base' });
    });

    it('names a message sender from the place-scoped profile', async () => {
        resolveContext.mockResolvedValue({
            ...EMPTY_CONTEXT,
            channelsByRef: { 'cloud-b:ch-2': { id: 'ch-2', sid: 'site-9', name: 'Bistro' } },
            profilesByRef: {
                'cloud-b:site-9:user-2': { nick: 'Bora', thumbnail: 'data:image/png;base64,BBB' },
            },
        });

        const input = results({
            messages: [
                { id: 'chat-2', cid: 'cloud-b', channelId: 'ch-2', chatNo: 6, content: 'yo', ownerId: 'user-2' },
            ] as any,
        });

        const { result } = renderHook(() => useSearchContext(input));

        await waitFor(() => expect(result.current.chats[0].senderName).toBe('Bora'));
        expect(result.current.chats[0].senderThumbnail).toBe('data:image/png;base64,BBB');
    });

    it('falls back to the account NAME — never the account nick — when no place profile is cached', async () => {
        // Profiles are only cached for rooms already opened, so this is the common case for search.
        // The account nick is a different label from the place identity and must not surface here.
        resolveContext.mockResolvedValue({
            ...EMPTY_CONTEXT,
            channelsByRef: { 'cloud-b:ch-2': { id: 'ch-2', sid: 'site-9', name: 'Bistro' } },
            usersByRef: {
                'cloud-b:user-2': {
                    id: 'user-2',
                    name: 'Bora Kim',
                    nick: 'never-this',
                    thumbnail: 'data:image/png;base64,UU',
                },
            },
        });

        const input = results({
            messages: [
                { id: 'chat-2', cid: 'cloud-b', channelId: 'ch-2', chatNo: 6, content: 'yo', ownerId: 'user-2' },
            ] as any,
        });

        const { result } = renderHook(() => useSearchContext(input));

        await waitFor(() => expect(result.current.chats[0].senderName).toBe('Bora Kim'));
        // The photo is the place profile's; an account-level image is not this person's identity here.
        expect(result.current.chats[0].senderThumbnail).toBeUndefined();
    });

    it('falls back to the owner embedded on the message when nothing else is cached', async () => {
        const input = results({
            messages: [
                {
                    id: 'chat-2',
                    cid: 'cloud-b',
                    channelId: 'ch-2',
                    chatNo: 6,
                    content: 'yo',
                    ownerId: 'user-2',
                    owner$: { id: 'user-2', name: 'Bora' },
                },
            ] as any,
        });

        const { result } = renderHook(() => useSearchContext(input));

        await waitFor(() => expect(result.current.chats[0].senderName).toBe('Bora'));
    });

    it('leaves the sender unnamed when nothing at all identifies them', async () => {
        resolveContext.mockResolvedValue({
            ...EMPTY_CONTEXT,
            channelsByRef: { 'cloud-b:ch-2': { id: 'ch-2', sid: 'site-9', name: 'Bistro' } },
        });

        const input = results({
            messages: [
                { id: 'chat-2', cid: 'cloud-b', channelId: 'ch-2', chatNo: 6, content: 'yo', ownerId: 'user-2' },
            ] as any,
        });

        const { result } = renderHook(() => useSearchContext(input));

        await waitFor(() => expect(result.current.chats[0].channelName).toBe('Bistro'));
        expect(result.current.chats[0].senderName).toBeUndefined();
        expect(result.current.chats[0].senderThumbnail).toBeUndefined();
    });

    it('omits fields the cache could not resolve instead of inventing them', async () => {
        const input = results({
            messages: [{ id: 'chat-2', cid: 'cloud-b', channelId: 'ch-missing', chatNo: 6, content: 'yo' }] as any,
        });

        const { result } = renderHook(() => useSearchContext(input));

        await waitFor(() => expect(resolveContext).toHaveBeenCalled());
        const row = result.current.chats[0];
        expect(row.channelName).toBeUndefined();
        expect(row.placeName).toBeUndefined();
        expect(row.sid).toBeUndefined();
        // The match itself still renders — a missing crumb must not cost the result.
        expect(row.content).toBe('yo');
    });

    it('keeps rows and logs when resolving the context fails', async () => {
        resolveContext.mockRejectedValue(new Error('bridge timeout'));
        const input = results({
            channels: [{ id: 'ch-1', cid: 'cloud-a', sid: 'site-1', name: 'Lounge' }] as any,
        });

        const { result } = renderHook(() => useSearchContext(input));

        await waitFor(() => expect(logger.error).toHaveBeenCalled());
        expect(result.current.channels[0].name).toBe('Lounge');
        expect(result.current.channels[0].placeName).toBeUndefined();
    });
});
