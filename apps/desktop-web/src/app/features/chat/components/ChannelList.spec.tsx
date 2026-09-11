import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import type { DomainChannel, DomainChat } from '@chatic/data';
import type * as Shared from '@chatic/shared';
import type * as Channels from '../../channels';
import type * as ReadCursorStore from '../../../shared/stores/useReadCursorStore';
import type * as AppShared from '../../../shared';
import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

// Row context menu seams (slice 05): the sidebar owns ONE actions instance; the
// spies here are the boundaries the menu writes through.
const menu = vi.hoisted(() => ({
    openDialog: vi.fn(),
    openSettings: vi.fn(),
    markRead: vi.fn(),
    readChat: vi.fn(() => Promise.resolve()),
    serverSync: vi.fn(() => Promise.resolve()),
    leaveChannel: vi.fn(() => Promise.resolve()),
    deleteChannel: vi.fn(() => Promise.resolve()),
    // P1 regression: the leave/delete tests run the REAL useChannelActions wiring
    // (dialog → mutation → onRemoved) — set to true there, stub elsewhere.
    useRealActions: false,
}));
vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            useSessionIdentity: () => ({ userId: 'me' }),
            useSessionSelection: () => ({ selectedCloudId: 'cloud-1', selectedSiteId: 'place-1' }),
        },
        data: {
            useRuntimeRepositories: () => ({ join: { readChat: menu.readChat } }),
        },
    },
}));
vi.mock('../../channels', async () => {
    const actual = await vi.importActual<typeof Channels>('../../channels');
    return {
        ...actual,
        useChannelActions: (...args: Parameters<typeof actual.useChannelActions>) =>
            menu.useRealActions
                ? actual.useChannelActions(...args)
                : { dialog: null, openDialog: menu.openDialog, closeDialog: vi.fn() },
        useChannelSettingsStore: (selector: (s: { open: typeof menu.openSettings }) => unknown) =>
            selector({ open: menu.openSettings }),
    };
});
vi.mock('../../../shared/stores/useReadCursorStore', async () => ({
    ...(await vi.importActual<typeof ReadCursorStore>('../../../shared/stores/useReadCursorStore')),
    useReadCursorStore: { getState: () => ({ markRead: menu.markRead }) } as never,
}));
vi.mock('../../../shared', async () => ({
    ...(await vi.importActual<typeof AppShared>('../../../shared')),
    useDesktopChannelMutations: () => ({
        setChannelNotify: menu.serverSync,
        deleteChannel: menu.deleteChannel,
        leaveChannel: menu.leaveChannel,
        isMutating: false,
    }),
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
import { useNotificationPrefsStore, useSelectedChannelStore } from '../../../shared';
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

describe('ChannelList row context menu (slice 05)', () => {
    const general = { id: 'C1', name: 'general' } as DomainChannel;

    beforeEach(() => {
        storedOrder.ids = [];
        pinned.ids = [];
    });
    afterEach(() => {
        // Explicit: a menu test failing mid-fireEvent must not leak its nav into the
        // next test's DOM (the folded test then sees two "Channels" headers).
        cleanup();
        for (const fn of Object.values(menu)) if (typeof fn === 'function') fn.mockClear();
        menu.useRealActions = false;
        act(() => {
            pinned.ids = [];
            useNotificationPrefsStore.setState({ channelNotify: {}, mutedChannels: {} });
        });
    });

    const renderList = (channels: DomainChannel[]) => {
        render(
            <ChannelList
                channels={channels}
                isLoading={false}
                selectedChannelId={null}
                query=""
                onSelect={vi.fn()}
                isDefaultMode={false}
            />,
            { wrapper }
        );
    };
    const openRowMenu = (name: RegExp | string) => {
        fireEvent.contextMenu(screen.getByRole('button', { name: name as RegExp }));
    };

    it('opens on right-click with the common row actions', () => {
        renderList([general]);

        openRowMenu(/general/);

        const items = screen.getAllByRole('menuitem').map(item => item.textContent);
        expect(items).toContain('Add to favorites');
        expect(items).toContain('Notifications');
        expect(items).toContain('Channel settings');
        expect(items).toContain('Add members');
        expect(items).toContain('Leave channel');
        // CHANNEL has no ownerId — owner-gated items stay hidden.
        expect(items).not.toContain('Rename');
        expect(items).not.toContain('Delete channel');
    });

    it('toggles the favorite pin from the menu', () => {
        renderList([general]);

        openRowMenu(/general/);
        fireEvent.click(screen.getByRole('menuitem', { name: 'Add to favorites' }));

        expect(pinned.toggle).toHaveBeenCalledWith('C1');
    });

    it('offers mark-as-read only on unread rows and records it', () => {
        const unread = { id: 'C2', name: 'busy', unreadCount: 3, chatNo: 7 } as DomainChannel;
        renderList([general, unread]);

        openRowMenu(/general/);
        expect(screen.queryByRole('menuitem', { name: 'Mark as read' })).toBeNull();
        fireEvent.keyDown(document.body, { key: 'Escape' }); // close the first menu (Radix dismiss)

        openRowMenu(/busy/);
        fireEvent.click(screen.getByRole('menuitem', { name: 'Mark as read' }));

        expect(menu.markRead).toHaveBeenCalledWith('C2', 7);
        expect(menu.readChat).toHaveBeenCalledWith({ channelId: 'C2', chatNo: 7 });
    });

    it('gates rename and delete to the owner', () => {
        const owned = { ...CHANNEL, ownerId: 'me' } as DomainChannel;
        renderList([owned]);

        openRowMenu(/general/);

        expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeTruthy();
        expect(screen.getByRole('menuitem', { name: 'Delete channel' })).toBeTruthy();
    });

    it('hides rename, add members and delete on DM rows', () => {
        const dm = { id: 'D1', stereo: 'dm', name: 'u1' } as DomainChannel;
        renderList([dm]);

        openRowMenu(/u1/);

        const items = screen.getAllByRole('menuitem').map(item => item.textContent);
        expect(items).not.toContain('Rename');
        expect(items).not.toContain('Add members');
        expect(items).not.toContain('Delete channel');
        expect(items).toContain('Leave channel');
    });

    it('opens the channel settings panel from the menu', () => {
        renderList([general]);

        openRowMenu(/general/);
        fireEvent.click(screen.getByRole('menuitem', { name: 'Channel settings' }));

        expect(menu.openSettings).toHaveBeenCalledWith('C1');
    });

    it('opens rename through the single sidebar actions instance', () => {
        const owned = { ...CHANNEL, ownerId: 'me' } as DomainChannel;
        renderList([owned]);

        openRowMenu(/general/);
        fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));

        expect(menu.openDialog).toHaveBeenCalledWith('rename');
    });

    it('changes the notification pref from the submenu and syncs best-effort', async () => {
        renderList([general]);

        openRowMenu(/general/);
        fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Notifications' }), { key: 'ArrowRight' }); // open the submenu (keyboard path — deterministic in jsdom)
        fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Mentions only' }));

        await waitFor(() => expect(useNotificationPrefsStore.getState().channelNotify['C1']).toBe('mention'));
        expect(menu.serverSync).toHaveBeenCalledWith(expect.objectContaining({ notify: 'mention' }));
    });

    // P1: onRemoved must clear the selection only when the removed row IS the
    // open channel — leaving a background channel must not unmount the chat pane.
    describe('onRemoved clears the selection only for the open channel', () => {
        const launch = { id: 'C2', name: 'launch' } as DomainChannel;

        const renderWithSelection = (selectedChannelId: string) =>
            render(
                <ChannelList
                    channels={[general, launch]}
                    isLoading={false}
                    selectedChannelId={selectedChannelId}
                    query=""
                    onSelect={vi.fn()}
                    isDefaultMode={false}
                />,
                { wrapper }
            );

        const leave = async (row: RegExp | string) => {
            openRowMenu(row);
            fireEvent.click(screen.getByRole('menuitem', { name: 'Leave channel' }));
            // Real ChannelActionDialogs: the leave ConfirmDialog asks first.
            fireEvent.click(await screen.findByRole('button', { name: 'Leave' }));
            await waitFor(() =>
                expect(menu.leaveChannel).toHaveBeenCalledWith(
                    expect.objectContaining({ channelId: expect.any(String) })
                )
            );
        };

        beforeEach(() => {
            menu.useRealActions = true;
        });

        it('leaving a background row keeps the selection', async () => {
            useSelectedChannelStore.setState({ selectedChannelId: 'C1' });
            renderWithSelection('C1');

            await leave(/launch/);

            expect(useSelectedChannelStore.getState().selectedChannelId).toBe('C1');
        });

        it('leaving the open row clears it', async () => {
            useSelectedChannelStore.setState({ selectedChannelId: 'C1' });
            renderWithSelection('C1');

            await leave(/general/);

            expect(useSelectedChannelStore.getState().selectedChannelId).toBeNull();
        });
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
