import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
    runtime: {
        data: {
            getCloudRepositories: (cid: string) => getCloudRepositories(cid),
            useRuntimeRepositories: () => ({ user: { observeItem: () => () => undefined } }),
        },
        session: {
            useSessionIdentity: () => ({ userId: 'me' }),
            useRuntimeProfile: () => ({ userName: 'Me', photo: '' }),
        },
    },
}));
vi.mock('@chatic/bridges', () => ({ logger: { warn: vi.fn() } }));

const sendMessage = vi.fn();
const retryMessage = vi.fn();
const discardMessage = vi.fn();
vi.mock('../../../shared/hooks/useChatMutations', () => ({
    useChatMutations: () => ({ sendMessage, retryMessage, discardMessage }),
}));
const composerKeys: string[] = [];
// The editor is Lexical in its own chunk; a stand-in that sends what was typed is enough here.
vi.mock('./LazyComposer', () => ({
    LazyComposer: ({
        onSend,
        placeholder,
        channelId,
    }: {
        onSend: (content: string, files: File[]) => void;
        placeholder: string;
        channelId: string;
    }) => (
        <button
            type="button"
            ref={node => {
                if (node) composerKeys.push(channelId);
            }}
            onClick={() => onSend('my inline reply', [])}
        >
            {`send: ${placeholder}`}
        </button>
    ),
}));

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

const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient()}>
        <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
);

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
            // The card reads first; the dwell starts once it shows the thread.
            await act(async () => {
                await vi.advanceTimersByTimeAsync(0);
            });
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
            // A new reply in a read thread does not lift it above the others either.
            act(() =>
                useMyThreadsStore.setState(state => {
                    const key = myThreadKey('K1', 'C1', '3');
                    const t3 = state.threads[key];
                    return { threads: { ...state.threads, [key]: { ...t3, lastActivityAt: 9000, lastReplyNo: 20 } } };
                })
            );
            expect(order()).toEqual(['root 2', 'root 1', 'root 3']);
        } finally {
            startVisible = true;
        }
    });

    it('does not mark a thread seen while its card failed to read', async () => {
        vi.useFakeTimers();
        try {
            cacheReadList.mockRejectedValue(new Error('db'));
            seed(thread('5', { lastReplyNo: 12, seenReplyNo: 10 }));
            renderPage();
            await act(async () => {
                await vi.advanceTimersByTimeAsync(1500);
            });
            expect(useMyThreadsStore.getState().threads[myThreadKey('K1', 'C1', '5')].seenReplyNo).toBe(10);
        } finally {
            vi.useRealTimers();
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

const C1 = { id: 'C1', cid: 'K1', sid: 'P1', name: 'general', stereo: 'public' } as DomainChannel;
const renderWithChannel = () =>
    render(<ThreadsPage cloudId="K1" channels={[C1]} placeScope={new Set(['P1'])} onOpen={vi.fn()} />, { wrapper });

describe('ThreadsPage inline reply', () => {
    beforeEach(() => {
        sendMessage.mockReset().mockResolvedValue({});
        retryMessage.mockReset().mockResolvedValue({});
        discardMessage.mockReset().mockResolvedValue(undefined);
        composerKeys.length = 0;
    });

    it('opens an inline reply box only on demand, and sends to the thread with its full root id', async () => {
        seed(thread('5', { lastReplyNo: 12, seenReplyNo: 10 }));
        // The send writes its row to the cache; the card's next read holds it.
        cacheReadList.mockResolvedValueOnce({ list: [chat(5)] }).mockResolvedValue({
            list: [
                chat(5),
                {
                    ...chat(0, { parentId: 'C1:5', content: 'my inline reply' }),
                    chatNo: undefined,
                    id: 'tmp-1',
                    isPending: true,
                },
            ],
        });
        renderWithChannel();
        const card = screen.getByRole('article');
        await waitFor(() => expect(within(card).getByText('message 5')).toBeTruthy());
        expect(within(card).queryByText(/^send:/)).toBeNull();

        fireEvent.click(within(card).getByRole('button', { name: /^reply$/i }));
        fireEvent.click(within(card).getByText('send: Reply in thread'));

        expect(sendMessage).toHaveBeenCalledWith('K1', {
            channelId: 'C1',
            content: 'my inline reply',
            parentId: 'C1:5',
        });
        await waitFor(() => expect(within(card).getByText('my inline reply')).toBeTruthy());
        // I just answered it: the thread counts as read.
        const listed = useMyThreadsStore.getState().threads[myThreadKey('K1', 'C1', '5')];
        expect(listed.seenReplyNo).toBe(listed.lastReplyNo);
        expect(listed.lastReplyPreview).toBe('my inline reply');
    });

    it('shows an inline reply that failed with the room row retry and delete', async () => {
        seed(thread('5'));
        const failed = {
            ...chat(0, { parentId: 'C1:5', content: 'lost reply' }),
            chatNo: undefined,
            id: 'tmp-2',
            isFailed: true,
        };
        cacheReadList.mockResolvedValue({ list: [chat(5), failed] });
        renderWithChannel();
        const card = screen.getByRole('article');
        await waitFor(() => expect(within(card).getByText(/not delivered/i)).toBeTruthy());

        fireEvent.click(within(card).getByRole('button', { name: /^retry$/i }));
        expect(retryMessage).toHaveBeenCalledWith(failed);
        await waitFor(() => expect(cacheReadList.mock.calls.length).toBeGreaterThan(1));
        fireEvent.click(within(card).getByRole('button', { name: /delete message/i }));
        expect(discardMessage).toHaveBeenCalledWith(failed);
    });

    it('keeps each card inline reply draft under its own thread', async () => {
        seed(thread('5'), thread('6'));
        cacheReadList.mockResolvedValue({ list: [chat(5), chat(6)] });
        renderWithChannel();
        const cards = screen.getAllByRole('article');
        for (const card of cards) {
            fireEvent.click(await within(card).findByRole('button', { name: /^reply$/i }));
        }
        expect(new Set(composerKeys)).toEqual(new Set(['C1::threads-page::5', 'C1::threads-page::6']));
    });
    it('offers no inline reply when the thread channel is not loaded in this place', async () => {
        seed(thread('5', { channelId: 'C9' }));
        renderPage();
        const card = screen.getByRole('article');
        await waitFor(() => expect(cacheReadList).toHaveBeenCalled());
        expect(within(card).queryByRole('button', { name: /^reply$/i })).toBeNull();
    });
});
