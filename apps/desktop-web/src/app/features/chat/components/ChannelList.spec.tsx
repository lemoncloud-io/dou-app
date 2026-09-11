import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { act, fireEvent, render, screen, within } from '@testing-library/react';

import type { DomainChannel, DomainChat } from '@chatic/data';
import type * as Shared from '@chatic/shared';
import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            useSessionIdentity: () => ({ userId: 'me' }),
            useSessionSelection: () => ({ selectedCloudId: 'cloud-1', selectedSiteId: 'place-1' }),
        },
    },
}));
// Favorites ride the shared `ui.pinnedChannels` hook — stub the config store out of the render.
// `storedOrder`/`pinned` are mutable per test: the stored reads are the things under test.
const storedOrder = vi.hoisted(() => ({ ids: [] as string[], set: vi.fn() }));
const pinned = vi.hoisted(() => ({ ids: [] as string[], toggle: vi.fn(), reorder: vi.fn() }));
vi.mock('@chatic/shared', async () => ({
    ...(await vi.importActual<Shared>('@chatic/shared')),
    usePinnedChannels: () => ({ pinnedIds: pinned.ids, toggle: pinned.toggle, reorder: pinned.reorder }),
    useChannelOrder: () => ({ storedIds: storedOrder.ids, set: storedOrder.set }),
}));

let lastChat: DomainChat | undefined;
vi.mock('../hooks', () => ({ useLastChat: () => lastChat }));
vi.mock('../../../shared/hooks/useAuthorNames', () => ({ useAuthorNames: () => new Map() }));
vi.mock('../../../shared/hooks/useSiteProfiles', () => ({ useSiteProfileMap: () => ({}) }));
// Both mount global keyboard/dialog machinery; this file is about what a row renders.
vi.mock('./QuickSwitcher', () => ({ QuickSwitcher: () => null }));
vi.mock('../../search', () => ({ SearchDialog: () => null }));

import '../../../../i18n';

import { useSidebarSectionsStore } from '../stores';
import { CHANNEL_ROW_HINT_DELAY_MS, ChannelList } from './ChannelList';
import { ShortcutsDialog } from './ShortcutsDialog';

Element.prototype.scrollIntoView = vi.fn();

const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient()}>
        <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
);

const CHANNEL = { id: 'C1', name: 'general' } as DomainChannel;

const list = () => (
    <ChannelList
        channels={[CHANNEL]}
        isLoading={false}
        selectedChannelId={null}
        query=""
        onSelect={vi.fn()}
        isDefaultMode={false}
    />
);

// The preview rides on the row's hover tooltip (Figma rows are one line), so it is read
// by hovering the row past the row's hint delay.
const previewOnHover = (): string => {
    vi.useFakeTimers();
    try {
        fireEvent.pointerMove(screen.getByRole('button', { name: /general/ }));
        act(() => {
            vi.advanceTimersByTime(CHANNEL_ROW_HINT_DELAY_MS);
        });
        return screen.getByRole('tooltip').textContent ?? '';
    } finally {
        vi.useRealTimers();
    }
};

describe('ChannelList preview line', () => {
    it('shows the last message, flattened out of its markdown', () => {
        lastChat = { id: 'C1:1', chatNo: 1, content: '**ship it**' } as DomainChat;

        render(list(), { wrapper });

        expect(previewOnHover()).toMatch(/ship it$/);
    });

    // The preview is the surface where a Block Kit payload is most obviously wrong: the
    // whole line is JSON, and there is no room to recover from it.
    it('reads what a Block Kit message says, not the payload that carries it', () => {
        lastChat = {
            id: 'C1:1',
            chatNo: 1,
            content: JSON.stringify({
                blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '*403* denied by policy' } }],
            }),
        } as DomainChat;

        render(list(), { wrapper });

        expect(previewOnHover()).toMatch(/403 denied by policy$/);
    });

    // The delete is soft, so `content` survives it. Printing that content would show the
    // sidebar the very text the row says is gone.
    it('says a deleted message is gone instead of printing what it said', () => {
        lastChat = { id: 'C1:1', chatNo: 1, content: 'regrettable', hidden: true } as DomainChat;

        render(list(), { wrapper });

        const preview = previewOnHover();
        expect(preview).toMatch(/Message deleted$/);
        expect(preview).not.toMatch(/regrettable/);
    });
});

describe('ChannelList stored order (ui.channelOrder)', () => {
    // Regression for review-03 P0: applyChannelOrder takes IDS — feeding it channel objects
    // kept the stored order from applying and collapsed the DMs section to nothing.
    it('applies the stored order to channels and still renders DMs', () => {
        const general = { id: 'C1', name: 'general' } as DomainChannel;
        const random = { id: 'C2', name: 'random' } as DomainChannel;
        const dm = { id: 'D1', stereo: 'dm', name: 'u1' } as DomainChannel;
        storedOrder.ids = ['C2', 'C1'];

        render(
            <ChannelList
                channels={[general, random, dm]}
                isLoading={false}
                selectedChannelId={null}
                query=""
                onSelect={vi.fn()}
                isDefaultMode={false}
            />,
            { wrapper }
        );

        const nav = screen.getByRole('navigation');
        const rowNames = within(nav)
            .getAllByRole('button')
            .map(button => button.textContent ?? '')
            .filter(name => /general|random|u1/.test(name))
            .map(name => (name.includes('random') ? 'random' : name.includes('general') ? 'general' : 'u1'));
        expect(rowNames).toEqual(['random', 'general', 'u1']);

        act(() => {
            storedOrder.ids = [];
        });
    });
});

describe('ChannelList keyboard reorder (Alt+Shift+↑/↓, slice 04)', () => {
    const general = { id: 'C1', name: 'general' } as DomainChannel;
    const random = { id: 'C2', name: 'random' } as DomainChannel;

    // Mutable mock state must reset in hooks, not inline: an assertion failure would
    // otherwise leak pinnedIds into the later fold test and hide the real result.
    beforeEach(() => {
        storedOrder.ids = [];
        storedOrder.set.mockReset();
        pinned.ids = [];
        pinned.reorder.mockReset();
        pinned.toggle.mockReset();
    });
    afterEach(() => {
        act(() => {
            storedOrder.ids = [];
            pinned.ids = [];
            useSidebarSectionsStore.setState({ collapsed: {} });
        });
    });

    const renderWithSelection = (selectedChannelId: string | null, channels = [general, random]) => {
        const onSelect = vi.fn();
        render(
            <ChannelList
                channels={channels}
                isLoading={false}
                selectedChannelId={selectedChannelId}
                query=""
                onSelect={onSelect}
                isDefaultMode={false}
            />,
            { wrapper }
        );
        return { nav: screen.getByRole('navigation'), onSelect };
    };

    const press = (nav: HTMLElement, key: 'ArrowDown' | 'ArrowUp', altKey = false, shiftKey = false) =>
        fireEvent.keyDown(nav, { key, altKey, shiftKey });

    it('Alt+Shift+ArrowDown moves the selected channel down and writes the new order', () => {
        storedOrder.ids = ['C1', 'C2'];
        const { nav, onSelect } = renderWithSelection('C1');

        act(() => {
            press(nav, 'ArrowDown', true, true);
        });

        expect(storedOrder.set).toHaveBeenCalledWith(['C2', 'C1']);
        // The move never doubles as navigation.
        expect(onSelect).not.toHaveBeenCalled();
    });

    it('Alt+Shift moves a pinned channel inside Favorites via the pin reorder', () => {
        pinned.ids = ['C1', 'C2'];
        const { nav } = renderWithSelection('C1');

        act(() => {
            press(nav, 'ArrowDown', true, true);
        });

        expect(pinned.reorder).toHaveBeenCalledWith(['C2', 'C1']);
    });

    it('a plain ArrowDown still navigates — Alt+Shift is the only move chord', () => {
        const { nav, onSelect } = renderWithSelection('C1');

        act(() => {
            press(nav, 'ArrowDown');
        });

        expect(onSelect).toHaveBeenCalledWith('C2');
        expect(storedOrder.set).not.toHaveBeenCalled();
    });

    it('Alt+Shift while filtering does nothing — a subset would write a partial order', () => {
        const onSelect = vi.fn();
        storedOrder.ids = ['C1', 'C2'];
        render(
            <ChannelList
                channels={[general, random]}
                isLoading={false}
                selectedChannelId="C1"
                query="general"
                onSelect={onSelect}
                isDefaultMode={false}
            />,
            { wrapper }
        );

        act(() => {
            press(screen.getByRole('navigation'), 'ArrowDown', true, true);
        });

        expect(storedOrder.set).not.toHaveBeenCalled();
        expect(onSelect).not.toHaveBeenCalled();
    });

    it('arrows carrying other modifiers (Ctrl/Meta) are ignored — OS shortcuts keep working', () => {
        const { nav, onSelect } = renderWithSelection('C1');

        act(() => {
            press(nav, 'ArrowDown', false, false);
        });
        // plain nav worked once, now prove the guard: ctrl+arrow must not navigate again
        onSelect.mockClear();
        const ctrlDown = fireEvent.keyDown(nav, { key: 'ArrowDown', ctrlKey: true });
        expect(onSelect).not.toHaveBeenCalled();
        expect(ctrlDown).toBe(true); // default not prevented — browser zoom-style chords pass through
    });

    it('the dialog cheat sheet mentions the move chord', () => {
        render(<ShortcutsDialog />, { wrapper });
        fireEvent.keyDown(window, { key: '?' });
        expect(screen.getByText('Move the focused channel up or down')).toBeTruthy();
        // chord rendering follows the platform glyph (⌥ on mac, Alt elsewhere) — one is present
        const chord = screen.queryAllByText('⌥ ⇧ ↑').length > 0 ? '⌥ ⇧ ↑' : 'Alt ⇧ ↑';
        expect(screen.getAllByText(chord).length).toBeGreaterThan(0);
    });

    it('Alt+Shift on a folded section does nothing — channels', () => {
        useSidebarSectionsStore.setState({ collapsed: { ch: true } });
        storedOrder.ids = ['C1', 'C2'];
        const { nav } = renderWithSelection('C1');

        act(() => {
            press(nav, 'ArrowDown', true, true);
        });

        expect(storedOrder.set).not.toHaveBeenCalled();
    });

    it('Alt+Shift on a folded section does nothing — favorites reorder is the trickiest write, pin it', () => {
        useSidebarSectionsStore.setState({ collapsed: { fav: true } });
        pinned.ids = ['C1', 'C2'];
        const { nav } = renderWithSelection('C1');

        act(() => {
            press(nav, 'ArrowDown', true, true);
        });

        expect(pinned.reorder).not.toHaveBeenCalled();
    });

    it('Alt+Shift on a folded section does nothing — DMs', () => {
        useSidebarSectionsStore.setState({ collapsed: { dm: true } });
        storedOrder.ids = ['D1'];
        const dm = { id: 'D1', stereo: 'dm', name: 'u1' } as DomainChannel;
        const { nav } = renderWithSelection('D1', [general, random, dm]);

        act(() => {
            press(nav, 'ArrowDown', true, true);
        });

        expect(storedOrder.set).not.toHaveBeenCalled();
    });

    it('Alt+Shift+ArrowUp moves the selected channel up — direction pinned at component level', () => {
        storedOrder.ids = ['C1', 'C2'];
        const { nav } = renderWithSelection('C2');

        act(() => {
            press(nav, 'ArrowUp', true, true);
        });

        expect(storedOrder.set).toHaveBeenCalledWith(['C2', 'C1']);
    });
});

describe('ChannelList folded section', () => {
    // Folding hides the quiet rows, never the one that just got a message.
    it('keeps unread channels listed while the section is folded', () => {
        lastChat = undefined;
        const quiet = { id: 'C1', name: 'general' } as DomainChannel;
        const busy = { id: 'C2', name: 'launch', unreadCount: 3 } as DomainChannel;

        render(
            <ChannelList
                channels={[quiet, busy]}
                isLoading={false}
                selectedChannelId={null}
                query=""
                onSelect={vi.fn()}
                isDefaultMode={false}
            />,
            { wrapper }
        );
        fireEvent.click(screen.getByRole('button', { name: 'Channels' }));

        expect(screen.queryByText('general')).toBeNull();
        expect(screen.getByText('launch')).toBeTruthy();
        // Unfold again so the persisted fold does not leak into other tests.
        fireEvent.click(screen.getByRole('button', { name: 'Channels' }));
    });
});
