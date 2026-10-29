import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import type { DomainChannel, DomainChat } from '@chatic/data';
import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

import '../../../../i18n';

import { useMyThreadsStore, useNotificationsPanelStore } from '../../../shared';
import { myThreadKey, type MyThread } from '../../../shared/utils/myThreads';
import { ThreadsPage } from './ThreadsPage';

const cacheReadList = vi.fn();
const cacheRead = vi.fn();
const getChat = vi.fn();
const getCloudRepositories = vi.fn((_cid: string) => ({ chat: { cacheReadList, cacheRead, getChat } }));

vi.mock('@chatic/app-runtime', () => ({
    runtime: { data: { getCloudRepositories: (cid: string) => getCloudRepositories(cid) } },
}));
vi.mock('@chatic/bridges', () => ({ logger: { warn: vi.fn() } }));

// jsdom has no layout. Every card starts on screen unless a test holds them off it, then brings them in.
let startVisible = true;
const observers: Array<{ margin: string; fire: (visible: boolean) => void }> = [];
class TestObserver {
    constructor(
        private readonly callback: IntersectionObserverCallback,
        private readonly options: IntersectionObserverInit = {}
    ) {}
    observe = () => {
        const fire = (visible: boolean) =>
            this.callback([{ isIntersecting: visible } as IntersectionObserverEntry], this as never);
        observers.push({ margin: this.options.rootMargin ?? '0px', fire });
        if (startVisible) fire(true);
    };
    disconnect = () => undefined;
    unobserve = () => undefined;
}
globalThis.IntersectionObserver = TestObserver as unknown as typeof IntersectionObserver;
const bringNear = () => act(() => observers.filter(o => o.margin !== '0px').forEach(o => o.fire(true)));
const bringOnScreen = () => act(() => observers.filter(o => o.margin === '0px').forEach(o => o.fire(true)));

const chat = (chatNo: number, over: Partial<DomainChat> = {}): DomainChat =>
    ({
        id: `C1:${chatNo}`,
        channelId: 'C1',
        chatNo,
        content: `message ${chatNo}`,
        createdAt: chatNo * 1000,
        owner$: { name: `Author ${chatNo}` },
        ...over,
    }) as DomainChat;

const wrapper = ({ children }: { children: ReactNode }) => <TooltipProvider>{children}</TooltipProvider>;

const thread = (rootNo: string, over: Partial<MyThread> = {}): MyThread => ({
    cid: 'K1',
    channelId: 'C1',
    placeId: 'P1',
    rootNo,
    rootPreview: `root ${rootNo}`,
    rootOwnerName: 'Ada',
    channelKind: 'channel',
    channelName: 'general',
    lastReplyNo: 10,
    lastReplyPreview: `reply ${rootNo}`,
    lastReplyOwnerName: 'Bo',
    lastActivityAt: 1000,
    seenReplyNo: 10,
    ...over,
});

const seed = (...threads: MyThread[]) =>
    useMyThreadsStore.setState({
        threads: Object.fromEntries(threads.map(t => [myThreadKey(t.cid, t.channelId, t.rootNo), t])),
    });

const CHANNELS = [{ id: 'C1', name: 'general', stereo: 'public' }] as DomainChannel[];

const renderPage = (onOpen = vi.fn()) => {
    render(<ThreadsPage cloudId="K1" channels={CHANNELS} placeScope={new Set(['P1'])} onOpen={onOpen} />, {
        wrapper,
    });
    return onOpen;
};

beforeEach(() => {
    useMyThreadsStore.setState({ threads: {}, backfilled: {} });
    useNotificationsPanelStore.setState({ scanningCid: null });
    cacheReadList.mockReset().mockResolvedValue({ list: [] });
    cacheRead.mockReset().mockResolvedValue(null);
    getChat.mockReset().mockResolvedValue(null);
    getCloudRepositories.mockClear();
});

describe('ThreadsPage cards', () => {
    it('shows the root and the latest replies read from the cache, older ones behind a link to the panel', async () => {
        seed(thread('5'));
        cacheReadList.mockResolvedValue({
            list: [
                chat(5),
                chat(6, { parentId: '5' }),
                chat(7, { parentId: '5' }),
                chat(8, { parentId: 'C1:5' }),
                chat(9, { parentId: '5' }),
                chat(10, { parentId: '5', subType: 'reaction' }),
                chat(11, { parentId: '4' }),
                chat(12),
            ],
        });
        const onOpen = renderPage();

        const card = screen.getByRole('article');
        await waitFor(() => expect(within(card).getByText('message 9')).toBeTruthy());
        expect(getCloudRepositories).toHaveBeenCalledWith('K1');
        expect(within(card).getByText('message 5')).toBeTruthy();
        expect(within(card).getByText('message 7')).toBeTruthy();
        expect(within(card).getByText('message 8')).toBeTruthy();
        expect(within(card).queryByText('message 6')).toBeNull();
        expect(within(card).queryByText('message 11')).toBeNull();
        expect(within(card).queryByText('message 12')).toBeNull();

        fireEvent.click(within(card).getByRole('button', { name: /1 earlier reply/i }));
        expect(onOpen).toHaveBeenCalledWith('C1', undefined, 'P1', '5');
    });

    it('shows the latest replies under a root fetched when the cache lacks it', async () => {
        seed(thread('5'));
        cacheReadList.mockResolvedValue({ list: [chat(6, { parentId: '5' })] });
        getChat.mockResolvedValue(chat(5, { content: 'fetched root' }));
        renderPage();
        const card = screen.getByRole('article');
        await waitFor(() => expect(within(card).getByText('fetched root')).toBeTruthy());
        expect(getChat).toHaveBeenCalledWith({ id: 'C1:5' });
    });

    it('shows the latest replies as unreadable with a retry when the cache read fails', async () => {
        seed(thread('5'));
        cacheReadList.mockRejectedValueOnce(new Error('db')).mockResolvedValue({ list: [chat(5)] });
        renderPage();
        const card = screen.getByRole('article');
        const retry = await within(card).findByRole('button', { name: /try again/i });
        fireEvent.click(retry);
        await waitFor(() => expect(within(card).getByText('message 5')).toBeTruthy());
    });

    it('shows the latest replies and marks the thread seen once the card has been on screen a moment', async () => {
        vi.useFakeTimers();
        try {
            seed(thread('5', { lastReplyNo: 12, seenReplyNo: 10 }));
            renderPage();
            const key = myThreadKey('K1', 'C1', '5');
            expect(useMyThreadsStore.getState().threads[key].seenReplyNo).toBe(10);
            await act(async () => {
                await vi.advanceTimersByTimeAsync(1500);
            });
            expect(useMyThreadsStore.getState().threads[key].seenReplyNo).toBe(12);
        } finally {
            vi.useRealTimers();
        }
    });

    it('shows the latest replies only once a card comes near, and marks it seen only on screen', async () => {
        vi.useFakeTimers();
        startVisible = false;
        try {
            seed(thread('5', { lastReplyNo: 12, seenReplyNo: 10 }));
            renderPage();
            const key = myThreadKey('K1', 'C1', '5');
            await act(async () => {
                await vi.advanceTimersByTimeAsync(1500);
            });
            expect(cacheReadList).not.toHaveBeenCalled();

            // Near the screen: read ahead, but not looked at.
            bringNear();
            await act(async () => {
                await vi.advanceTimersByTimeAsync(1500);
            });
            expect(cacheReadList).toHaveBeenCalledTimes(1);
            expect(useMyThreadsStore.getState().threads[key].seenReplyNo).toBe(10);

            bringOnScreen();
            await act(async () => {
                await vi.advanceTimersByTimeAsync(1500);
            });
            expect(useMyThreadsStore.getState().threads[key].seenReplyNo).toBe(12);
        } finally {
            startVisible = true;
            vi.useRealTimers();
        }
    });

    it('shows the latest replies in the order the page opened with while threads are read', async () => {
        // Held off screen, the cards keep the record's previews to tell them apart by.
        startVisible = false;
        try {
            seed(
                thread('1', { lastActivityAt: 1000, lastReplyNo: 12, seenReplyNo: 10 }),
                thread('2', { lastActivityAt: 2000, lastReplyNo: 12, seenReplyNo: 10 }),
                thread('3', { lastActivityAt: 3000 })
            );
            renderPage();
            const order = () =>
                screen.getAllByRole('article').map(card => within(card).getAllByText(/^root /)[0].textContent);
            expect(order()).toEqual(['root 2', 'root 1', 'root 3']);
            // Thread 2 is read first; it keeps the top instead of dropping below thread 1.
            act(() => useMyThreadsStore.getState().markSeen('K1', 'C1', '2'));
            expect(order()).toEqual(['root 2', 'root 1', 'root 3']);
        } finally {
            startVisible = true;
        }
    });

    it('shows the latest replies under the panel wording when the root is from before my join or gone', async () => {
        seed(thread('3', { channelId: 'C2', channelName: 'old' }), thread('5'));
        cacheReadList.mockResolvedValue({ list: [] });
        getChat.mockRejectedValue(new Error('404 NOT FOUND'));
        render(
            <ThreadsPage
                cloudId="K1"
                channels={[...CHANNELS, { id: 'C2', name: 'old', $join: { joinedNo: 4 } } as DomainChannel]}
                placeScope={new Set(['P1'])}
                onOpen={vi.fn()}
            />,
            { wrapper }
        );
        await waitFor(() => expect(screen.getByText(/before you joined/i)).toBeTruthy());
        expect(getChat).toHaveBeenCalledTimes(1);
        expect(getChat).toHaveBeenCalledWith({ id: 'C1:5' });
        await waitFor(() => expect(screen.getByText(/can't be shown here/i)).toBeTruthy());
        expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
    });

    it('shows the latest replies behind an uncounted link when the cached window is full', async () => {
        seed(thread('5'));
        cacheReadList.mockResolvedValue({
            list: [chat(5), ...Array.from({ length: 199 }, (_, i) => chat(6 + i, { parentId: '5' }))],
        });
        renderPage();
        const card = screen.getByRole('article');
        expect(await within(card).findByRole('button', { name: /^show earlier replies$/i })).toBeTruthy();
    });
});

describe('ThreadsPage', () => {
    it('lists my threads in this place and cloud, unread first, then newest activity', () => {
        seed(
            thread('1', { lastActivityAt: 3000 }),
            thread('2', { lastActivityAt: 1000, lastReplyNo: 12, seenReplyNo: 10 }),
            thread('3', { lastActivityAt: 2000 }),
            thread('4', { placeId: 'P2', lastActivityAt: 9000 }),
            thread('5', { cid: 'K2', lastActivityAt: 9000 })
        );
        renderPage();

        const cards = screen.getAllByRole('article');
        expect(cards.map(card => within(card).getByText(/^root /).textContent)).toEqual(['root 2', 'root 1', 'root 3']);
        expect(within(cards[0]).getByText(/unread/i)).toBeTruthy();
        expect(within(cards[0]).getByText('# general')).toBeTruthy();
        expect(within(cards[0]).getByText('Ada')).toBeTruthy();
    });

    it('lists my threads with no place recorded in every place', () => {
        seed(thread('7', { placeId: undefined }));
        renderPage();
        expect(screen.getAllByRole('article')).toHaveLength(1);
    });

    it('lists my threads as opening their thread in its channel and place', () => {
        seed(thread('8'));
        const onOpen = renderPage();
        fireEvent.click(screen.getByRole('button', { name: /open thread/i }));
        expect(onOpen).toHaveBeenCalledWith('C1', undefined, 'P1', '8');
    });

    it('lists my threads as empty with a hint, or as still looking while the scan runs', () => {
        renderPage();
        expect(screen.getByRole('status').textContent).toMatch(/threads you reply in/i);
        act(() => useNotificationsPanelStore.setState({ scanningCid: 'K1' }));
        expect(screen.getByRole('status').textContent).toMatch(/looking/i);
    });
});
