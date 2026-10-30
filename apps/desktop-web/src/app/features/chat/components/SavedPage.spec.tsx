import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import type { DomainChannel, DomainChat, DomainPlace } from '@chatic/data';
import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

import '../../../../i18n';

import { useSavedItemsStore, useSavedPageStore, type SavedItem } from '../../../shared';
import { SavedPage } from './SavedPage';

const cacheRead = vi.fn();
const getChat = vi.fn();
const getCloudRepositories = vi.fn((_cid: string) => ({ chat: { cacheRead, getChat } }));

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
vi.mock('../../../shared/hooks/useChatMutations', () => ({
    useChatMutations: () => ({ sendMessage: vi.fn(), retryMessage: vi.fn(), discardMessage: vi.fn() }),
}));

// jsdom has no layout: every card is near the screen at once.
class TestObserver {
    constructor(private readonly callback: IntersectionObserverCallback) {}
    observe = () => this.callback([{ isIntersecting: true } as IntersectionObserverEntry], this as never);
    disconnect = () => undefined;
    unobserve = () => undefined;
}
globalThis.IntersectionObserver = TestObserver as unknown as typeof IntersectionObserver;

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

const NOW = new Date(2026, 9, 20, 15, 0).getTime();
const MIN = 60_000;

const item = (id: string, over: Partial<SavedItem> = {}): SavedItem => ({
    id,
    channelId: 'C1',
    chatNo: 4,
    content: `${id} body`,
    ownerName: 'Ada',
    placeId: 'P1',
    savedAt: NOW - MIN,
    ...over,
});

const seed = (...items: SavedItem[]) =>
    useSavedItemsStore.setState({ items: Object.fromEntries(items.map(entry => [entry.id, entry])) });

const CHANNELS = [
    { id: 'C1', name: 'general', stereo: 'public' },
    { id: 'D1', name: '', stereo: 'dm', memberIds: ['me', 'bo'] },
] as DomainChannel[];
const PLACES = [{ id: 'P1', name: 'Lemon' }] as DomainPlace[];

const renderPage = (onSelect = vi.fn()) => {
    render(<SavedPage cloudId="K1" channels={CHANNELS} places={PLACES} currentPlaceId="P1" onSelect={onSelect} />, {
        wrapper,
    });
    return onSelect;
};

const cards = () => screen.queryAllByRole('article');

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    useSavedItemsStore.setState({ items: {} });
    useSavedPageStore.setState({ isOpen: true, openedId: null });
    cacheRead.mockReset().mockResolvedValue(null);
    getChat.mockReset().mockResolvedValue(null);
    getCloudRepositories.mockClear();
});

afterEach(() => {
    vi.useRealTimers();
});

describe('SavedPage', () => {
    it('lists the saved messages newest first under a title that counts them', () => {
        seed(item('old', { savedAt: NOW - 90 * MIN }), item('new', { savedAt: NOW - MIN }));
        renderPage();

        expect(screen.getByRole('heading', { name: /Saved items/ }).textContent).toContain('2');
        expect(cards().map(card => /(old|new) body/.exec(card.textContent ?? '')?.[1])).toEqual(['new', 'old']);
        expect(cards()[0].textContent).toContain('Ada');
    });

    it('files a message with an attachment under Files, and one without under Messages', () => {
        seed(
            item('text'),
            item('photo', { content: 'Photo', attachment: { kind: 'image', count: 1, name: 'logo.png', size: 2048 } }),
            item('both', { attachment: { kind: 'mixed', count: 2 } })
        );
        renderPage();

        fireEvent.click(screen.getByRole('button', { name: 'Files' }));
        expect(cards().map(card => /(text body|logo\.png|both body)/.exec(card.textContent ?? '')?.[1])).toEqual([
            'logo.png',
            'both body',
        ]);
        expect(cards()[0].textContent).toContain('PNG · 2 KB');

        fireEvent.click(screen.getByRole('button', { name: 'Messages' }));
        expect(cards()).toHaveLength(1);
        expect(cards()[0].textContent).toContain('text body');

        fireEvent.click(screen.getByRole('button', { name: 'All' }));
        expect(cards()).toHaveLength(3);
    });

    it('says where each message was saved from: a channel, a DM or a thread', () => {
        seed(
            item('in-channel', { savedAt: NOW - MIN }),
            item('in-dm', { channelId: 'D1', ownerName: 'Bo', savedAt: NOW - 2 * MIN }),
            item('in-thread', { parentId: '3', savedAt: NOW - 3 * MIN })
        );
        renderPage();

        const [channel, dm, thread] = cards();
        expect(within(channel).getByText('Channel')).toBeTruthy();
        expect(channel.textContent).toContain('# general');
        expect(within(dm).getByText('DM')).toBeTruthy();
        expect(within(thread).getByText('Thread')).toBeTruthy();
    });

    it('opens the message picked, and marks it for the next visit', () => {
        seed(item('a', { parentId: '3' }));
        const onSelect = renderPage();

        fireEvent.click(screen.getByRole('button', { name: /a body/ }));

        expect(onSelect).toHaveBeenCalledWith('C1', 4, 'P1', '3');
        expect(useSavedPageStore.getState().openedId).toBe('a');
    });

    it('unsaves a message from its bookmark', () => {
        seed(item('a'), item('b'));
        renderPage();

        fireEvent.click(within(cards()[0]).getByRole('button', { name: 'Remove' }));

        expect(Object.keys(useSavedItemsStore.getState().items)).toEqual(['b']);
    });

    it('explains how to save when nothing is saved, with the filters off', () => {
        renderPage();

        expect(screen.getByText('Nothing saved yet')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Files' }).hasAttribute('disabled')).toBe(true);
    });

    it("does not name another place's message after this place's same-id channel or DM", () => {
        seed(item('away', { placeId: 'P2', channelId: 'D1' }));
        renderPage();

        const [card] = cards();
        expect(within(card).getByText('Channel')).toBeTruthy();
        expect(card.textContent).not.toContain('# general');
    });
});

describe('SavedPage live cards', () => {
    it('draws saved thread replies live under their root, in one card and without the saved tag', async () => {
        const rows: Record<string, DomainChat> = {
            'C1:5': chat(5),
            'C1:6': chat(6, { parentId: '5' }),
            'C1:7': chat(7, { parentId: '5' }),
        };
        cacheRead.mockImplementation(async (id: string) => rows[id] ?? null);
        seed(
            item('C1:6', { chatNo: 6, parentId: '5', content: 'snap 6', savedAt: NOW - 2 * MIN }),
            item('C1:7', { chatNo: 7, parentId: '5', content: 'snap 7', savedAt: NOW - MIN })
        );
        renderPage();

        expect(await screen.findByText('message 5')).toBeTruthy();
        expect(screen.getByText('message 6')).toBeTruthy();
        expect(screen.getByText('message 7')).toBeTruthy();
        expect(screen.queryByText('snap 6')).toBeNull();
        expect(screen.queryByText('Saved')).toBeNull();
        expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(1);
        expect(getCloudRepositories).toHaveBeenCalledWith('K1');
    });

    it('keeps a saved root and its saved reply in one live card, the root drawn once', async () => {
        cacheRead.mockImplementation(async (id: string) =>
            id === 'C1:5' ? chat(5) : id === 'C1:6' ? chat(6, { parentId: '5' }) : null
        );
        seed(
            item('C1:5', { chatNo: 5, content: 'snap 5' }),
            item('C1:6', { chatNo: 6, parentId: '5', content: 'snap 6' })
        );
        renderPage();

        expect(await screen.findByText('message 6')).toBeTruthy();
        expect(screen.getAllByText('message 5')).toHaveLength(1);
        expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(1);
    });

    it('keeps the snapshot of a saved reply that cannot be read, even when its root can', async () => {
        cacheRead.mockImplementation(async (id: string) => (id === 'C1:5' ? chat(5) : null));
        getChat.mockRejectedValue(new Error('404 NOT FOUND'));
        seed(item('C1:6', { chatNo: 6, parentId: '5', content: 'snap 6' }));
        renderPage();

        await waitFor(() => expect(getChat).toHaveBeenCalledWith({ id: 'C1:6' }));
        expect(screen.getByText('snap 6')).toBeTruthy();
        expect(screen.queryByText('message 5')).toBeNull();
    });

    it('shows a live card with the snapshot of its one unreadable saved reply after it', async () => {
        cacheRead.mockImplementation(async (id: string) =>
            id === 'C1:5' ? chat(5) : id === 'C1:6' ? chat(6, { parentId: '5' }) : null
        );
        seed(
            item('C1:6', { chatNo: 6, parentId: '5', content: 'snap 6' }),
            item('C1:7', { chatNo: 7, parentId: '5', content: 'snap 7' })
        );
        renderPage();

        expect(await screen.findByText('message 6')).toBeTruthy();
        expect(screen.getByText('snap 7')).toBeTruthy();
        expect(screen.queryByText('snap 6')).toBeNull();
    });

    it('unsaves every message on a live card from its bookmark, and shrinks the card when one is unsaved', async () => {
        const rows: Record<string, DomainChat> = {
            'C1:5': chat(5),
            'C1:6': chat(6, { parentId: '5' }),
            'C1:7': chat(7, { parentId: '5' }),
        };
        cacheRead.mockImplementation(async (id: string) => rows[id] ?? null);
        seed(
            item('C1:6', { chatNo: 6, parentId: '5', content: 'snap 6' }),
            item('C1:7', { chatNo: 7, parentId: '5', content: 'snap 7' })
        );
        renderPage();
        expect(await screen.findByText('message 7')).toBeTruthy();

        // The row's own menu unsaves through the store, the same as this.
        act(() => useSavedItemsStore.getState().remove('C1:6'));
        await waitFor(() => expect(screen.queryByText('message 6')).toBeNull());
        expect(screen.getByText('message 7')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
        expect(useSavedItemsStore.getState().items).toEqual({});
        expect(screen.queryByText('message 7')).toBeNull();
    });

    it('keeps the snapshot of a saved message deleted since, not the deleted placeholder', async () => {
        cacheRead.mockImplementation(async (id: string) => (id === 'C1:9' ? chat(9, { hidden: true }) : null));
        seed(item('C1:9', { chatNo: 9, content: 'snap 9' }));
        renderPage();

        await waitFor(() => expect(cacheRead).toHaveBeenCalledWith('C1:9'));
        await waitFor(() => expect(screen.getByText('snap 9')).toBeTruthy());
        expect(screen.queryByText('This message was deleted.')).toBeNull();
    });

    it('falls back to the snapshot when the live message cannot be read', async () => {
        seed(item('C1:9', { chatNo: 9, content: 'snap 9' }));
        renderPage();

        await waitFor(() => expect(getChat).toHaveBeenCalledWith({ id: 'C1:9' }));
        expect(screen.getByText('snap 9')).toBeTruthy();
    });

    it('never reads live a message saved in another place, whose channel id means another room', () => {
        seed(item('C1:9', { chatNo: 9, placeId: 'P2', content: 'snap 9' }));
        renderPage();

        expect(screen.getByText('snap 9')).toBeTruthy();
        expect(getCloudRepositories).not.toHaveBeenCalled();
    });
});
