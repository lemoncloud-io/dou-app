import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fireEvent, render, screen } from '@testing-library/react';

import type { DomainChannel, DomainPlace } from '@chatic/data';
import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

vi.mock('../../../shared/hooks/usePanelWidth', () => ({
    usePanelWidth: () => ({ width: 384, minWidth: 280, maxWidth: 640, panelRef: { current: null } }),
}));

import '../../../../i18n';

import { useMentionsPanelStore, useMentionsStore, type MentionItem } from '../../../shared';
import { MentionsPanel, indexChannelNames } from './MentionsPanel';

const wrapper = ({ children }: { children: ReactNode }) => <TooltipProvider>{children}</TooltipProvider>;

const mention = (over: Partial<MentionItem>): MentionItem => ({
    id: 'm1',
    channelId: 'C1',
    chatNo: 5,
    content: '@me hi',
    ownerName: 'Ada',
    placeId: 'P1',
    createdAt: 1,
    ...over,
});

const CHANNELS = [{ id: 'C1', name: 'general' }] as DomainChannel[];
const PLACES = [{ id: 'P1', name: 'Place' }] as DomainPlace[];

const renderPanel = (onSelect = vi.fn()) => {
    useMentionsPanelStore.getState().open();
    return render(
        <MentionsPanel channels={CHANNELS} places={PLACES} currentPlaceId="P1" onSelect={onSelect} />,
        { wrapper }
    );
};

describe('MentionsPanel catch-up', () => {
    beforeEach(() => {
        useMentionsStore.setState({ items: {} });
        useMentionsPanelStore.setState({ isOpen: false, openedId: null });
    });

    it('names its device-local limit with its own words', () => {
        useMentionsStore.setState({ items: { m1: mention({}) } });
        renderPanel();
        expect(screen.getByText('Shown on this device only.')).toBeTruthy();
    });

    // Catching up means open, read, next — the pane stays for the next row.
    it('keeps the pane open when a row is opened', () => {
        useMentionsStore.setState({ items: { m1: mention({}) } });
        const onSelect = vi.fn();
        renderPanel(onSelect);

        // The remove button names the sender too — the open button alone holds the message text.
        fireEvent.click(screen.getByRole('button', { name: /@me hi/ }));

        expect(onSelect).toHaveBeenCalledWith('C1', 5, 'P1', undefined);
        expect(useMentionsStore.getState().items['m1']?.readAt).toBeDefined();
        expect(useMentionsPanelStore.getState().isOpen).toBe(true);
    });

    it('counts unread only in the group header and bolds unread rows', () => {
        useMentionsStore.setState({
            items: {
                m1: mention({ id: 'm1', chatNo: 5, createdAt: 2 }),
                m2: mention({ id: 'm2', chatNo: 6, createdAt: 1, readAt: 3, ownerName: 'Bo' }),
            },
        });
        renderPanel();

        expect(screen.getByText('1')).toBeTruthy();
        const unreadName = screen.getByText('Ada', { selector: 'span' });
        expect(unreadName.className).toContain('font-semibold');
    });

    it('names the panel landmark after itself', () => {
        useMentionsStore.setState({ items: { m1: mention({}) } });
        renderPanel();

        expect(screen.getByRole('complementary', { name: 'Mentions' })).toBeTruthy();
    });

    it('lists rows under group headings', () => {
        useMentionsStore.setState({ items: { m1: mention({}) } });
        renderPanel();

        // The header carries the unread count beside the place name.
        expect(screen.getByRole('heading', { name: 'Place 1' })).toBeTruthy();
        expect(screen.getByRole('list')).toBeTruthy();
        expect(screen.getAllByRole('listitem')).toHaveLength(1);
    });

    it('states the device limit even when empty', () => {
        renderPanel();

        expect(screen.getByText('Shown on this device only.')).toBeTruthy();
    });

    it('labels removal with the sender and channel', () => {
        useMentionsStore.setState({ items: { m1: mention({}) } });
        renderPanel();

        expect(screen.getByRole('button', { name: 'Remove Ada · #general’s mention from the list' })).toBeTruthy();
    });

    it('moves focus to the next row after removal', () => {
        useMentionsStore.setState({
            items: {
                m1: mention({ id: 'm1', chatNo: 5, createdAt: 2 }),
                m2: mention({ id: 'm2', chatNo: 6, createdAt: 1, ownerName: 'Bo' }),
            },
        });
        renderPanel();

        fireEvent.click(screen.getByRole('button', { name: /Remove Ada/ }));

        expect(useMentionsStore.getState().items['m1']).toBeUndefined();
        expect(document.activeElement?.textContent).toContain('Bo');
    });
});

describe('indexChannelNames', () => {
    it('indexes names by channel id, skipping nameless rows', () => {
        expect(
            indexChannelNames([
                { id: 'C1', name: 'general' },
                { id: 'C2' },
                { name: 'noname' },
            ])
        ).toEqual(new Map([['C1', 'general']]));
    });
});
