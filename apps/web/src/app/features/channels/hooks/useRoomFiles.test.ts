import { act, renderHook, waitFor } from '@testing-library/react';

import type { DomainChat, RoomMediaItem } from '@chatic/data';
import { MemoryStore } from '@chatic/storage';

import { hideMedia, setLocalMediaPrefsStorage } from '../lib/localMediaPrefs';
import { useRoomFiles, useRoomMediaCounts, withNewestPage, withOlderPage } from './useRoomFiles';

const mockListRoomMedia = jest.fn();
const mockCountRoomMedia = jest.fn();
const mockRefreshList = jest.fn();
// Every live subscription's callback, so a test can make the cache "change" again.
const mockObservers: Array<() => void> = [];
const mockObserveList = jest.fn((_input: unknown, callback: () => void) => {
    mockObservers.push(callback);
    // The repository answers once at subscribe, as the real one does with the cached window.
    callback();
    return () => {
        const at = mockObservers.indexOf(callback);
        if (at >= 0) mockObservers.splice(at, 1);
    };
});
jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            // One graph object, as the runtime hands out: a new one per render would resubscribe forever.
            useRuntimeRepositories: (() => {
                // Built on first use: the mocks it holds are initialised after this factory runs.
                let graph: unknown;
                return () =>
                    (graph ??= {
                        chat: {
                            listRoomMedia: mockListRoomMedia,
                            countRoomMedia: mockCountRoomMedia,
                            refreshList: mockRefreshList,
                            observeList: mockObserveList,
                        },
                    });
            })(),
        },
    },
}));

type Kind = RoomMediaItem['kind'];

/** A cached message holding one attachment of `kind` in slot 0. */
const item = (kind: Kind, chatNo: number): RoomMediaItem => ({
    kind,
    idx: 0,
    ref: `up-${chatNo}`,
    chatId: `ch-1:${chatNo}`,
    chatNo,
    chat: {
        id: `ch-1:${chatNo}`,
        cid: 'c1',
        channelId: 'ch-1',
        chatNo,
        ownerId: 'u2',
        createdAtMs: chatNo * 1000,
        upload$$: [
            {
                id: `up-${chatNo}`,
                stereo: kind,
                status: 'ready',
                orgUrl: `https://s3/${chatNo}`,
                thumbUrl: `https://s3/${chatNo}-t`,
                name: `${chatNo}.bin`,
            },
        ],
    } as unknown as DomainChat,
});

/**
 * Pages by kind and cursor: `pages['image:top']` answers the first read, `pages['image:5']` a read
 * below message 5. A read nothing was set up for answers an empty, finished page.
 */
let pages: Record<string, { items: RoomMediaItem[]; nextCursorNo: number | null }>;
const answer = (input: { kind: Kind; cursorNo?: number }) =>
    Promise.resolve(pages[`${input.kind}:${input.cursorNo ?? 'top'}`] ?? { items: [], nextCursorNo: null });

const keysOf = (entries: ReadonlyArray<{ key: string }>) => entries.map(entry => entry.key);
const callsFor = (kind: Kind) =>
    mockListRoomMedia.mock.calls.map(([input]) => input).filter((input: { kind: Kind }) => input.kind === kind);

const renderFiles = (tab: 'media' | 'audio' = 'media') =>
    renderHook(() => useRoomFiles({ cid: 'c1', uid: 'u1', channelId: 'ch-1', tab }));

describe('useRoomFiles', () => {
    beforeEach(() => {
        setLocalMediaPrefsStorage(new MemoryStore());
        mockListRoomMedia.mockReset().mockImplementation(answer);
        mockRefreshList.mockReset().mockResolvedValue({ cursorNo: 40 });
        mockObserveList.mockClear();
        mockObservers.length = 0;
        pages = {};
    });

    afterAll(() => setLocalMediaPrefsStorage());

    it('reads photos and videos for the media tab and merges them newest first', async () => {
        pages['image:top'] = { items: [item('image', 9), item('image', 5)], nextCursorNo: null };
        pages['video:top'] = { items: [item('video', 7)], nextCursorNo: null };
        const { result } = renderFiles();

        await waitFor(() => expect(result.current.entries).toHaveLength(3));
        expect(keysOf(result.current.entries)).toEqual(['ch-1:9:0', 'ch-1:7:0', 'ch-1:5:0']);
        expect(callsFor('image')[0]).toEqual({ channelId: 'ch-1', kind: 'image', limit: 60 });
        expect(callsFor('video')[0]).toEqual({ channelId: 'ch-1', kind: 'video', limit: 60 });
    });

    // An index row whose message no longer has that slot is dropped, not drawn as a blank tile.
    it('keeps a page whose items have no attachment left on their row', async () => {
        const orphan = item('image', 4);
        orphan.chat = { ...orphan.chat, upload$$: [] } as DomainChat;
        pages['image:top'] = { items: [item('image', 6), orphan], nextCursorNo: null };
        const { result } = renderFiles();

        await waitFor(() => expect(result.current.entries).toHaveLength(1));
        expect(keysOf(result.current.entries)).toEqual(['ch-1:6:0']);
    });

    it('leaves out what is hidden on this device', async () => {
        hideMedia({ cid: 'c1', uid: 'u1' }, ['ch-1:7:0']);
        pages['image:top'] = { items: [item('image', 9)], nextCursorNo: null };
        pages['video:top'] = { items: [item('video', 7)], nextCursorNo: null };
        const { result } = renderFiles();

        await waitFor(() => expect(result.current.entries).toHaveLength(1));
        expect(keysOf(result.current.entries)).toEqual(['ch-1:9:0']);
    });

    it('reads each kind’s next page from its own cursor', async () => {
        pages['image:top'] = { items: [item('image', 9), item('image', 8)], nextCursorNo: 8 };
        pages['video:top'] = { items: [item('video', 7)], nextCursorNo: 7 };
        pages['image:8'] = { items: [item('image', 3)], nextCursorNo: null };
        pages['video:7'] = { items: [item('video', 2)], nextCursorNo: null };
        const { result } = renderFiles();
        // Before the first read nothing is known to be finished either, so wait for the rows themselves.
        await waitFor(() => expect(result.current.entries.length).toBeGreaterThan(0));
        expect(result.current.hasMorePages).toBe(true);

        await act(() => result.current.loadMore());

        expect(callsFor('image')[1]).toEqual({ channelId: 'ch-1', kind: 'image', cursorNo: 8, limit: 60 });
        expect(callsFor('video')[1]).toEqual({ channelId: 'ch-1', kind: 'video', cursorNo: 7, limit: 60 });
        expect(keysOf(result.current.entries)).toEqual(['ch-1:9:0', 'ch-1:8:0', 'ch-1:7:0', 'ch-1:3:0', 'ch-1:2:0']);
        expect(result.current.hasMorePages).toBe(false);
    });

    it('widens the cache from the oldest message seen and reads on, once every kind has run out', async () => {
        pages['image:top'] = { items: [item('image', 9), item('image', 5)], nextCursorNo: null };
        pages['video:top'] = { items: [item('video', 7)], nextCursorNo: null };
        const { result } = renderFiles();
        await waitFor(() => expect(result.current.entries).toHaveLength(3));
        expect(result.current.canFindOlder).toBe(true);
        expect(mockRefreshList).not.toHaveBeenCalled();

        // What the older page brought into the index, below where each kind stopped — message 5 again
        // as well, since a read below 5 in a real cache would not, but the merge must not double it.
        pages['image:5'] = { items: [item('image', 5), item('image', 3)], nextCursorNo: null };
        pages['video:7'] = { items: [item('video', 2)], nextCursorNo: null };
        await act(() => result.current.findOlder());

        expect(mockRefreshList).toHaveBeenCalledWith({ channelId: 'ch-1', cursorNo: 5, limit: 50 });
        expect(callsFor('image').at(-1)).toEqual({ channelId: 'ch-1', kind: 'image', cursorNo: 5, limit: 60 });
        expect(callsFor('video').at(-1)).toEqual({ channelId: 'ch-1', kind: 'video', cursorNo: 7, limit: 60 });
        expect(keysOf(result.current.entries)).toEqual(['ch-1:9:0', 'ch-1:7:0', 'ch-1:5:0', 'ch-1:3:0', 'ch-1:2:0']);
        expect(result.current.canFindOlder).toBe(true);
    });

    it('stops offering to look further once the server says there is nothing older', async () => {
        pages['image:top'] = { items: [item('image', 9)], nextCursorNo: null };
        mockRefreshList.mockResolvedValue({ cursorNo: 0 });
        const { result } = renderFiles();
        await waitFor(() => expect(result.current.canFindOlder).toBe(true));

        await act(() => result.current.findOlder());

        expect(result.current.canFindOlder).toBe(false);
    });

    it('looks for older files by itself, once, when a tab opens empty with nothing more cached', async () => {
        const { result } = renderFiles('audio');

        await waitFor(() => expect(mockRefreshList).toHaveBeenCalledTimes(1));
        // Nothing was seen, so the server is asked from its newest.
        expect(mockRefreshList).toHaveBeenCalledWith({ channelId: 'ch-1', limit: 50 });
        await waitFor(() => expect(result.current.searching).toBe(false));

        // The tab is still empty afterwards; it does not keep asking.
        act(() => mockObservers.forEach(callback => callback()));
        await waitFor(() => expect(callsFor('audio').length).toBeGreaterThanOrEqual(3));
        expect(mockRefreshList).toHaveBeenCalledTimes(1);
        expect(result.current.canFindOlder).toBe(true);
    });

    it('marks the list unavailable when the installed app cannot answer yet', async () => {
        mockListRoomMedia.mockRejectedValue(
            Object.assign(new Error('not in this app'), { code: 'RUNTIME_NOT_AVAILABLE' })
        );
        const { result } = renderFiles();

        await waitFor(() => expect(result.current.unavailable).toBe(true));
    });
});

describe('useRoomMediaCounts', () => {
    beforeEach(() => {
        mockCountRoomMedia.mockReset().mockResolvedValue({ image: 1, video: 0, file: 0, audio: 2, link: 0 });
        mockObserveList.mockClear();
        mockObservers.length = 0;
    });

    it('reads the counts once, and again on each later change in the room — not on the subscribe answer', async () => {
        const { result } = renderHook(() => useRoomMediaCounts('c1', 'ch-1'));

        await waitFor(() => expect(result.current.counts).toEqual({ image: 1, video: 0, file: 0, audio: 2, link: 0 }));
        expect(mockCountRoomMedia).toHaveBeenCalledTimes(1);

        mockCountRoomMedia.mockResolvedValue({ image: 1, video: 0, file: 0, audio: 3, link: 0 });
        act(() => mockObservers.forEach(callback => callback()));

        await waitFor(() => expect(result.current.counts?.audio).toBe(3));
        expect(mockCountRoomMedia).toHaveBeenCalledTimes(2);
    });
});

describe('page merging', () => {
    const entry = (chatNo: number) => ({ key: `ch:${chatNo}:0`, chatNo }) as never;

    it('keeps the rows read below a newer first page, and their cursor', () => {
        const had = { items: [entry(9), entry(8), entry(5), entry(4)], next: 4 };
        const merged = withNewestPage(had, { items: [entry(10), entry(9), entry(8)], next: 8 });
        expect(merged.items.map((e: { chatNo: number }) => e.chatNo)).toEqual([10, 9, 8, 5, 4]);
        expect(merged.next).toBe(4);
    });

    it('takes the newest page alone when nothing was read below it', () => {
        const page = { items: [entry(10), entry(9)], next: null };
        expect(withNewestPage({ items: [entry(10)], next: null }, page)).toBe(page);
        expect(withNewestPage(undefined, page)).toBe(page);
    });

    it('appends an older page without repeating an entry', () => {
        const merged = withOlderPage(
            { items: [entry(9), entry(8)], next: 8 },
            { items: [entry(8), entry(7)], next: null }
        );
        expect(merged.items.map((e: { chatNo: number }) => e.chatNo)).toEqual([9, 8, 7]);
        expect(merged.next).toBeNull();
    });
});
