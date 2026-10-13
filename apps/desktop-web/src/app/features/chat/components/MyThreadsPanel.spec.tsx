import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fireEvent, render, screen, within } from '@testing-library/react';

import type { DomainChannel, DomainPlace } from '@chatic/data';
import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

vi.mock('../../../shared/hooks/usePanelWidth', () => ({
    usePanelWidth: () => ({ width: 384, minWidth: 280, maxWidth: 640, panelRef: { current: null } }),
}));
vi.mock('../../../shared/hooks/useChannelLabels', () => ({
    useChannelLabels: () => (channel: { name?: string }) => channel.name ?? '',
}));

import '../../../../i18n';

import { useMyThreadsPanelStore, useMyThreadsStore, type MyThread } from '../../../shared';
import { MyThreadsPanel } from './MyThreadsPanel';

const wrapper = ({ children }: { children: ReactNode }) => <TooltipProvider>{children}</TooltipProvider>;

const thread = (over: Partial<MyThread>): MyThread => ({
    cid: 'cloud-a',
    channelId: 'C1',
    placeId: 'P1',
    rootNo: '1',
    rootPreview: 'root',
    lastReplyNo: 2,
    lastReplyPreview: 'reply',
    lastReplyOwnerName: 'Bob',
    lastActivityAt: 1,
    seenReplyNo: 2,
    ...over,
});

const store = (...threads: MyThread[]) =>
    useMyThreadsStore.setState({
        threads: Object.fromEntries(threads.map(t => [`${t.cid}:${t.channelId}:${t.rootNo}`, t])),
    });

const CHANNELS = [
    { id: 'C1', name: 'general' },
    { id: 'D1', name: 'Ada', stereo: 'dm' },
] as DomainChannel[];
const PLACES = [
    { id: 'P1', name: 'Team' },
    { id: 'P2', name: 'Studio' },
] as DomainPlace[];

const renderPanel = (onSelect = vi.fn()) =>
    render(
        <MyThreadsPanel
            cloudId="cloud-a"
            channels={CHANNELS}
            places={PLACES}
            currentPlaceId="P1"
            onSelect={onSelect}
        />,
        { wrapper }
    );

describe('MyThreadsPanel', () => {
    beforeEach(() => {
        useMyThreadsStore.setState({ threads: {} });
        useMyThreadsPanelStore.setState({
            openedKey: null,
            backKey: null,
            scrollTop: 0,
            focusOpened: false,
            scanningCid: null,
        });
        useMyThreadsPanelStore.getState().open();
    });

    it('says what will show up here when there is nothing yet, and that the list is per device', () => {
        renderPanel();

        expect(screen.getByText('No threads yet')).toBeTruthy();
        expect(screen.getByText('Threads seen on this device only.')).toBeTruthy();
    });

    it('says the cache is still being read rather than that there is nothing', () => {
        useMyThreadsPanelStore.getState().setScanning('cloud-a');

        renderPanel();

        expect(screen.getByText('Looking through the messages on this device…')).toBeTruthy();
        expect(screen.queryByText('No threads yet')).toBeNull();
    });

    it("lists the active cloud's threads, most recent activity first, with the last reply", () => {
        store(
            thread({ rootNo: '1', rootPreview: 'older', lastActivityAt: 1 }),
            thread({ rootNo: '5', rootPreview: 'newer', lastActivityAt: 9 }),
            thread({ cid: 'cloud-b', rootNo: '7', rootPreview: 'other cloud', lastActivityAt: 20 })
        );

        renderPanel();

        const rows = screen.getAllByRole('button', { name: /older|newer/ });
        expect(rows.map(row => within(row).getByText(/older|newer/).textContent)).toEqual(['newer', 'older']);
        expect(screen.queryByText('other cloud')).toBeNull();
        expect(screen.getAllByText('Bob: reply')).toHaveLength(2);
        expect(screen.getByText('Threads seen on this device only.')).toBeTruthy();
    });

    it('marks a thread with a reply I have not seen on its reply line', () => {
        store(thread({ rootPreview: 'news', lastReplyNo: 3, seenReplyNo: 2, lastReplyPreview: 'fresh' }));

        renderPanel();

        expect(screen.getByText('Bob: fresh').className).toContain('font-semibold');
        expect(screen.getByText('news').className).not.toContain('font-semibold');
        expect(screen.getByText('New reply')).toBeTruthy();
    });

    it('names who started the thread and where it lives, from what was kept for another place', () => {
        store(
            thread({
                channelId: 'C9',
                placeId: 'P2',
                rootOwnerName: 'Ada',
                channelKind: 'channel',
                channelName: 'design',
            })
        );

        renderPanel();

        const row = screen.getByRole('button', { name: /root/ });
        expect(within(row).getByText('Ada')).toBeTruthy();
        expect(within(row).getByText('design')).toBeTruthy();
        expect(within(row).getByText('· Studio')).toBeTruthy();
    });

    it('marks a channel with # but not a DM', () => {
        store(
            thread({ channelId: 'C1', rootNo: '1', rootPreview: 'in channel' }),
            thread({ channelId: 'D1', rootNo: '2', rootPreview: 'in dm' })
        );

        renderPanel();

        const channelRow = screen.getByRole('button', { name: /in channel/ });
        const dmRow = screen.getByRole('button', { name: /in dm/ });
        expect(channelRow.querySelector('svg')).not.toBeNull();
        expect(within(dmRow).getByText('Ada')).toBeTruthy();
        expect(dmRow.querySelector('svg')).toBeNull();
    });

    it('drops a thread from the list and hands focus to the next row', () => {
        store(
            thread({ rootNo: '1', rootPreview: 'stale', lastActivityAt: 9 }),
            thread({ rootNo: '2', rootPreview: 'next', lastActivityAt: 1 })
        );

        renderPanel();
        fireEvent.click(screen.getAllByRole('button', { name: 'Remove from list' })[0]);

        expect(screen.queryByText('stale')).toBeNull();
        expect(Object.keys(useMyThreadsStore.getState().threads)).toEqual(['cloud-a:C1:2']);
        expect(document.activeElement).toBe(screen.getByRole('button', { name: /next/ }));
    });

    it("marks every one of the cloud's threads read, and offers it only while one is unread", () => {
        store(
            thread({ rootNo: '1', lastReplyNo: 3, seenReplyNo: 2 }),
            thread({ rootNo: '2', lastReplyNo: 5, seenReplyNo: 1 })
        );

        renderPanel();
        fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));

        expect(screen.queryByText('New reply')).toBeNull();
        expect(screen.queryByRole('button', { name: 'Mark all read' })).toBeNull();
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close threads' }));
    });

    it('opens the thread in its channel and place, and remembers the row it was opened from', () => {
        const onSelect = vi.fn();
        store(thread({ channelId: 'C9', placeId: 'P2', rootNo: '42', rootPreview: 'go here' }));

        renderPanel(onSelect);
        fireEvent.click(screen.getByRole('button', { name: /go here/ }));

        expect(onSelect).toHaveBeenCalledWith('C9', undefined, 'P2', '42');
        expect(useMyThreadsPanelStore.getState()).toMatchObject({
            openedKey: 'cloud-a:C9:42',
            backKey: 'cloud-a:C9:42',
        });
    });

    it('comes back from a thread to the row it opened, marked and focused', () => {
        store(thread({ rootNo: '1', rootPreview: 'first' }), thread({ rootNo: '2', rootPreview: 'went here' }));
        useMyThreadsPanelStore.setState({ openedKey: 'cloud-a:C1:2' });
        useMyThreadsPanelStore.getState().back();

        renderPanel();

        const row = screen.getByRole('button', { name: /went here/ });
        expect(row.getAttribute('aria-current')).toBe('true');
        expect(document.activeElement).toBe(row);
        expect(useMyThreadsPanelStore.getState().focusOpened).toBe(false);
    });

    it('disarms the way back when it closes, so a later open elsewhere gets none', () => {
        useMyThreadsPanelStore.getState().markOpened('cloud-a:C1:1');
        useMyThreadsPanelStore.getState().close();

        expect(useMyThreadsPanelStore.getState()).toMatchObject({ openedKey: 'cloud-a:C1:1', backKey: null });
    });
});
