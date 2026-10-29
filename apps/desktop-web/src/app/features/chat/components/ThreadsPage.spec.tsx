import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { act, fireEvent, render, screen, within } from '@testing-library/react';

import type { DomainChannel } from '@chatic/data';
import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

import '../../../../i18n';

import { useMyThreadsStore, useNotificationsPanelStore } from '../../../shared';
import { myThreadKey, type MyThread } from '../../../shared/utils/myThreads';
import { ThreadsPage } from './ThreadsPage';

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
