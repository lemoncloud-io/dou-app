import { renderHook, waitFor } from '@testing-library/react';

import { useGlobalCacheSearch } from '@chatic/app-runtime';
import { logger } from '@chatic/bridges';

import { useSenderProfiles } from './useSenderProfiles';
import { useSearchContext } from './useSearchContext';
import type { GlobalSearchResults } from './useGlobalSearch';

jest.mock('@chatic/app-runtime', () => ({
    useGlobalCacheSearch: jest.fn(),
    globalCacheRefKey: (cid: string, id: string) => `${cid}:${id}`,
}));
// Sender profiles come from ProfileRepositoryV2 via this hook; it has its own test file.
jest.mock('./useSenderProfiles', () => ({ useSenderProfiles: jest.fn(() => new Map()) }));
jest.mock('@chatic/bridges', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

const resolveContext = jest.fn();

const EMPTY_CONTEXT = {
    channelsByRef: {},
    sitesByRef: {},
    joinsByRef: {},
    lastChatsByRef: {},
};

const results = (overrides: Partial<GlobalSearchResults> = {}): GlobalSearchResults =>
    ({ clouds: [], places: [], channels: [], messages: [], ...overrides }) as GlobalSearchResults;

beforeEach(() => {
    jest.clearAllMocks();
    resolveContext.mockResolvedValue(EMPTY_CONTEXT);
    (useGlobalCacheSearch as jest.Mock).mockReturnValue({ search: jest.fn(), resolveContext });
    (useSenderProfiles as jest.Mock).mockReturnValue(new Map());
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
        // join.metaNo 없음 → head의 metaNo로 대체(ADR-0048 폴백). (20-2) - (8-2) = 12.
        expect(row.unread).toBe(12);
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

    it('names a message sender from the profile loaded for its place', async () => {
        resolveContext.mockResolvedValue({
            ...EMPTY_CONTEXT,
            channelsByRef: { 'cloud-b:ch-2': { id: 'ch-2', sid: 'site-9', name: 'Bistro' } },
        });
        (useSenderProfiles as jest.Mock).mockReturnValue(
            new Map([['site-9@user-2', { nick: 'Bora', thumbnail: 'data:image/png;base64,BBB' }]])
        );

        const input = results({
            messages: [
                { id: 'chat-2', cid: 'cloud-b', channelId: 'ch-2', chatNo: 6, content: 'yo', ownerId: 'user-2' },
            ] as any,
        });

        const { result } = renderHook(() => useSearchContext(input));

        await waitFor(() => expect(result.current.chats[0].senderName).toBe('Bora'));
        expect(result.current.chats[0].senderThumbnail).toBe('data:image/png;base64,BBB');
    });

    it('asks for the author profile by (owning channel sid, message ownerId)', async () => {
        // sid always follows the channel — it is not the query context's sid, and the chat row
        // itself has none.
        resolveContext.mockResolvedValue({
            ...EMPTY_CONTEXT,
            channelsByRef: { 'cloud-b:ch-2': { id: 'ch-2', sid: 'site-9', name: 'Bistro' } },
        });

        const input = results({
            messages: [
                { id: 'chat-2', cid: 'cloud-b', channelId: 'ch-2', chatNo: 6, content: 'yo', ownerId: 'user-2' },
            ] as any,
        });

        renderHook(() => useSearchContext(input));

        await waitFor(() => expect(useSenderProfiles).toHaveBeenCalledWith([{ sid: 'site-9', userId: 'user-2' }]));
    });

    it('asks for nothing while the owning channel is still unresolved', async () => {
        // Without the channel there is no sid, so there is no profile to ask for yet.
        const input = results({
            messages: [
                { id: 'chat-2', cid: 'cloud-b', channelId: 'ch-2', chatNo: 6, content: 'yo', ownerId: 'user-2' },
            ] as any,
        });

        renderHook(() => useSearchContext(input));

        expect(useSenderProfiles).toHaveBeenCalledWith([]);
    });

    it('leaves the sender unnamed when no profile could be loaded for them', async () => {
        resolveContext.mockResolvedValue({
            ...EMPTY_CONTEXT,
            channelsByRef: { 'cloud-b:ch-2': { id: 'ch-2', sid: 'site-9', name: 'Bistro' } },
        });

        const input = results({
            messages: [
                {
                    id: 'chat-2',
                    cid: 'cloud-b',
                    channelId: 'ch-2',
                    chatNo: 6,
                    content: 'yo',
                    ownerId: 'user-2',
                    // Not consulted: the account-level owner on the message is a different label.
                    owner$: { id: 'user-2', name: 'Bora' },
                },
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

describe('useSearchContext — 재입장 이력 숨기기 (ADR-0067)', () => {
    it('joinedNo 이하의 메시지 결과와 채널 프리뷰를 모두 뺀다', async () => {
        // The global scan reads the chat table whole, so rooms I left still match. Before this
        // window they surfaced as results with no channel name attached.
        const input = results({
            channels: [{ id: 'ch-left', cid: 'cloud-a', sid: 'site-1', name: 'Lounge' }] as any,
            messages: [
                { id: 'chat-old', cid: 'cloud-a', channelId: 'ch-left', chatNo: 3, content: '옛 대화' },
                { id: 'chat-new', cid: 'cloud-a', channelId: 'ch-left', chatNo: 9, content: '새 대화' },
            ] as any,
        });
        resolveContext.mockResolvedValue({
            ...EMPTY_CONTEXT,
            channelsByRef: { 'cloud-a:ch-left': { id: 'ch-left', sid: 'site-1', name: 'Lounge' } },
            joinsByRef: { 'cloud-a:ch-left': { channelId: 'ch-left', joinedNo: 7, chatNo: 9 } },
            lastChatsByRef: { 'cloud-a:ch-left': { id: 'chat-old', chatNo: 3, content: '옛 대화' } },
        });

        const { result } = renderHook(() => useSearchContext(input));

        await waitFor(() => expect(result.current.chats).toHaveLength(1));
        expect(result.current.chats[0].chatId).toBe('chat-new');
        expect(result.current.channels[0].lastMessage).toBeUndefined();
    });

    it('joinedNo가 없으면 아무것도 숨기지 않는다', async () => {
        const input = results({
            messages: [{ id: 'chat-old', cid: 'cloud-a', channelId: 'ch-1', chatNo: 3, content: 'hi' }] as any,
        });
        resolveContext.mockResolvedValue({
            ...EMPTY_CONTEXT,
            joinsByRef: { 'cloud-a:ch-1': { channelId: 'ch-1', chatNo: 9 } },
        });

        const { result } = renderHook(() => useSearchContext(input));

        await waitFor(() => expect(result.current.chats).toHaveLength(1));
        expect(result.current.chats.map(row => row.chatId)).toEqual(['chat-old']);
    });
});
