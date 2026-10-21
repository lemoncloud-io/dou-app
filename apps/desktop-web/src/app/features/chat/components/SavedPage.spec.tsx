import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fireEvent, render, screen, within } from '@testing-library/react';

import type { DomainChannel, DomainPlace } from '@chatic/data';
import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

import '../../../../i18n';

import { useSavedItemsStore, useSavedPageStore, type SavedItem } from '../../../shared';
import { SavedPage } from './SavedPage';

const wrapper = ({ children }: { children: ReactNode }) => <TooltipProvider>{children}</TooltipProvider>;

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
    render(<SavedPage channels={CHANNELS} places={PLACES} currentPlaceId="P1" onSelect={onSelect} />, { wrapper });
    return onSelect;
};

const cards = () => screen.queryAllByRole('article');

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    useSavedItemsStore.setState({ items: {} });
    useSavedPageStore.setState({ isOpen: true, openedId: null });
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
