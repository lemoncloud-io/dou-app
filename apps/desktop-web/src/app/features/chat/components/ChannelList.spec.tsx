import type { ReactNode } from 'react';
import type * as ReactDom from 'react-dom';
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
// The last rows the sidebar asked to have named, and the place profiles it sees.
const hydrate = vi.hoisted(() => ({
    peers: [] as unknown[],
    profiles: {} as Record<string, { nick?: string; thumbnail?: string }>,
    cloud: new Map<string, { name?: string; thumbnail?: string }>(),
}));
vi.mock('../hooks', () => ({
    useLastChat: () => lastChat,
    useHydrateDmPeers: (peers: unknown[]) => {
        hydrate.peers = peers;
    },
}));
vi.mock('../../../shared/hooks/useAuthorNames', () => ({ useCloudProfiles: () => hydrate.cloud }));
// Radix only mounts an avatar image once it has loaded, which never happens in jsdom; render the
// requested photo as a marker instead so a row's chosen photo can be read.
vi.mock('@chatic/ui-kit/components/ui/avatar', () => ({
    Avatar: ({ children }: { children: ReactNode }) => <span>{children}</span>,
    AvatarImage: ({ src }: { src?: string }) => <span data-photo={src} />,
    AvatarFallback: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock('../../../shared/hooks/useSiteProfiles', () => ({ useSiteProfileMap: () => hydrate.profiles }));
// Both mount global keyboard/dialog machinery; this file is about what a row renders.
// `dialogStub.portal` turns the switcher into the shape that matters for the arrow-key
// guard: a portalled input that is a React child of the nav but a DOM child of body.
const dialogStub = vi.hoisted(() => ({ portal: false }));
vi.mock('./QuickSwitcher', async () => {
    const { createPortal } = (await vi.importActual('react-dom')) as typeof ReactDom;
    return {
        QuickSwitcher: () =>
            dialogStub.portal ? createPortal(<input data-testid="dialog-input" />, document.body) : null,
    };
});
vi.mock('../../search', () => ({ SearchDialog: () => null }));

import '../../../../i18n';
import i18next from 'i18next';

import { useSidebarOrderStore, useSidebarSectionsStore } from '../stores';
import { useNotificationPrefsStore, useSelectedChannelStore } from '../../../shared';
import { CHANNEL_ROW_HINT_DELAY_MS, ChannelList, DM_NAME_WAIT_MS } from './ChannelList';
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

    it('Alt+Shift+ArrowDown keeps focus on the moved row — React re-inserts its node', () => {
        storedOrder.ids = ['C1', 'C2'];
        let rowButton: HTMLButtonElement | null = null;
        storedOrder.set.mockImplementation((ids: string[]) => {
            storedOrder.ids = ids;
            // A browser blurs a focused node that React moves with insertBefore; jsdom does not,
            // so stand in for that focus fixup here.
            rowButton?.blur();
        });
        const onSelect = vi.fn();
        // A fresh element each call — rerendering the same element object bails out.
        const ui = () => (
            <ChannelList
                channels={[general, random]}
                isLoading={false}
                selectedChannelId="C1"
                query=""
                onSelect={onSelect}
                isDefaultMode={false}
            />
        );
        const { rerender } = render(ui(), { wrapper });
        rowButton = screen.getByText('general').closest('button') as HTMLButtonElement;
        rowButton.focus();

        act(() => {
            press(screen.getByRole('navigation'), 'ArrowDown', true, true);
        });
        // The config write re-renders through useConfigValue in the app; the mock needs a push.
        rerender(ui());

        expect(storedOrder.ids).toEqual(['C2', 'C1']);
        expect(document.activeElement).toBe(rowButton);
    });

    it('Alt+Shift moves a pinned channel inside Favorites via the pin reorder', () => {
        pinned.ids = ['C1', 'C2'];
        const { nav } = renderWithSelection('C1');

        act(() => {
            press(nav, 'ArrowDown', true, true);
        });

        expect(pinned.reorder).toHaveBeenCalledWith(['C2', 'C1']);
    });

    it('a plain ArrowDown moves focus and opens nothing — Enter is what opens a row', () => {
        const { nav, onSelect } = renderWithSelection('C1');

        act(() => {
            press(nav, 'ArrowDown');
        });

        // Focus lands on the row after the selected one; selecting on every arrow
        // press would mount each channel's feed in turn and lose the reading
        // position of the channel the user is actually in.
        expect(document.activeElement).toBe(nav.querySelector('[data-channel-row="C2"]'));
        expect(onSelect).not.toHaveBeenCalled();
        expect(storedOrder.set).not.toHaveBeenCalled();
    });

    it('an arrow inside an open dialog leaves the sidebar alone — portals bubble in the React tree', () => {
        dialogStub.portal = true;
        try {
            const { nav, onSelect } = renderWithSelection('C1');
            const input = screen.getByTestId('dialog-input');
            input.focus();

            act(() => {
                fireEvent.keyDown(input, { key: 'ArrowDown' });
            });

            // The dialog owns its own list navigation; the sidebar handler must not
            // steal focus to a row behind the modal, where the next Enter would
            // switch channel instead of opening the result.
            expect(document.activeElement).toBe(input);
            expect(nav.querySelector('[data-channel-row="C2"]')).not.toBe(document.activeElement);
            expect(onSelect).not.toHaveBeenCalled();
        } finally {
            dialogStub.portal = false;
        }
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
        expect(screen.getByText('In the sidebar: move the focused channel up or down')).toBeTruthy();
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

    // Screenshot bug: the Notifications row drew its bell flush against the label
    // and an oversized chevron, unlike every sibling row. jsdom has no layout, so
    // the oracle is the row's icon-gap / icon-size tokens matching its siblings.
    it('lays out the Notifications row icon like its sibling rows', () => {
        renderList([general]);

        openRowMenu(/general/);

        const iconLayout = (name: string) => {
            const cls = screen.getByRole('menuitem', { name }).className;
            return { gap: /\bgap-2\b/.test(cls), iconSize: /\[&[>_]svg\]:size-4/.test(cls) };
        };
        expect(iconLayout('Notifications')).toEqual(iconLayout('Channel settings'));
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
            fireEvent.click(await screen.findByRole('button', { name: 'Leave channel' }));
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

describe('ChannelList Direct messages "+"', () => {
    const general = { id: 'C1', name: 'general' } as DomainChannel;
    const renderWith = (props: { onCreateDm?: () => void; query?: string; channels?: DomainChannel[] }) =>
        render(
            <ChannelList
                channels={props.channels ?? [general]}
                isLoading={false}
                selectedChannelId={null}
                query={props.query ?? ''}
                onSelect={vi.fn()}
                isDefaultMode={false}
                onCreateDm={props.onCreateDm}
            />,
            { wrapper }
        );

    // The first 1:1 has to start somewhere, so the section keeps its header while empty.
    it('shows the section with its "+" before there is any 1:1, and opens the picker', () => {
        const onCreateDm = vi.fn();
        renderWith({ onCreateDm });

        expect(screen.getByRole('button', { name: 'Direct messages' })).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'New message' }));
        expect(onCreateDm).toHaveBeenCalledTimes(1);
    });

    it('hides the empty section where a 1:1 cannot be started', () => {
        renderWith({});

        expect(screen.queryByRole('button', { name: 'Direct messages' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'New message' })).toBeNull();
    });

    it('hides the empty section while a filter matches no 1:1', () => {
        renderWith({ onCreateDm: vi.fn(), query: 'gen' });

        expect(screen.queryByRole('button', { name: 'Direct messages' })).toBeNull();
    });

    it('offers the "+" next to existing 1:1s too', () => {
        const dm = { id: 'D1', stereo: 'dm', name: 'u1' } as DomainChannel;
        renderWith({ onCreateDm: vi.fn(), channels: [general, dm] });

        expect(screen.getByRole('button', { name: 'New message' })).toBeTruthy();
    });
});

describe('ChannelList 1:1 names', () => {
    it('asks to name only the 1:1 rows no place profile names', () => {
        hydrate.profiles = { 'u-named': { nick: 'Aiden' }, 'u-blank': { nick: '  ' } };
        const channels = [
            { id: 'C1', name: 'general', memberIds: ['me', 'u-group'] },
            { id: 'D1', stereo: 'dm', memberIds: ['me', 'u-named'] },
            { id: 'D2', stereo: 'dm', memberIds: ['me', 'u-plain'] },
            { id: 'D3', stereo: 'dm', memberIds: ['me', 'u-blank'] },
            { id: 'D4', stereo: 'dm', memberIds: ['me'] },
            { id: 'S1', stereo: 'self', memberIds: ['me'] },
        ] as DomainChannel[];

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

        expect(hydrate.peers).toEqual([
            { channelId: 'D2', peerId: 'u-plain' },
            { channelId: 'D3', peerId: 'u-blank' },
        ]);
        hydrate.profiles = {};
    });

    it("shows this place's nick and photo where set, else the cloud profile's", () => {
        hydrate.profiles = { 'u-place': { nick: 'Placey', thumbnail: 'place.png' }, 'u-nick': { nick: 'Nicky' } };
        hydrate.cloud = new Map([
            ['u-place', { name: 'cloud-place', thumbnail: 'cloud-place.png' }],
            ['u-nick', { name: 'cloud-nick', thumbnail: 'cloud-nick.png' }],
            ['u-cloud', { name: 'Cloudy', thumbnail: 'cloud.png' }],
        ]);
        const channels = [
            { id: 'D1', stereo: 'dm', memberIds: ['me', 'u-place'] },
            { id: 'D2', stereo: 'dm', memberIds: ['me', 'u-nick'] },
            { id: 'D3', stereo: 'dm', memberIds: ['me', 'u-cloud'] },
        ] as DomainChannel[];

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

        const photoOf = (name: RegExp) =>
            screen.getByRole('button', { name }).querySelector('[data-photo]')?.getAttribute('data-photo');
        expect(photoOf(/Placey/)).toBe('place.png');
        // A place nick with no place photo keeps the cloud photo.
        expect(photoOf(/Nicky/)).toBe('cloud-nick.png');
        expect(photoOf(/Cloudy/)).toBe('cloud.png');
        hydrate.profiles = {};
        hydrate.cloud = new Map();
    });
});

describe('ChannelList notes-to-self row', () => {
    afterEach(() => {
        hydrate.profiles = {};
        hydrate.cloud = new Map();
    });
    const selfRoom = {
        id: 'S1',
        stereo: 'self',
        memberIds: ['me-cloud'],
        $join: { userId: 'me-cloud' },
    } as DomainChannel;
    const renderSelf = () =>
        render(
            <ChannelList
                channels={[selfRoom]}
                isLoading={false}
                selectedChannelId={null}
                query=""
                onSelect={vi.fn()}
                isDefaultMode={false}
            />,
            { wrapper }
        );
    const photo = () =>
        screen.getByRole('button', { name: /You/ }).querySelector('[data-photo]')?.getAttribute('data-photo');

    // It drew a lettered "Y" while the picker drew my photo for the same room.
    it("draws my photo from this place's profile, keyed by my id in the cloud", () => {
        hydrate.profiles = { 'me-cloud': { nick: 'Louis', thumbnail: 'me-place.png' } };
        renderSelf();

        expect(photo()).toBe('me-place.png');
    });

    it('falls back to my cloud profile photo', () => {
        hydrate.cloud = new Map([['me-cloud', { name: 'Louis', thumbnail: 'me-cloud.png' }]]);
        renderSelf();

        expect(photo()).toBe('me-cloud.png');
    });

    // The relay's room has no join row of mine, only its one member.
    it('reads my id off the member list when the room has no join row', () => {
        hydrate.profiles = { 'me-relay': { nick: 'Louis', thumbnail: 'me-relay.png' } };
        render(
            <ChannelList
                channels={[{ id: 'S2', stereo: 'self', memberIds: ['me-relay'] } as DomainChannel]}
                isLoading={false}
                selectedChannelId={null}
                query=""
                onSelect={vi.fn()}
                isDefaultMode={false}
            />,
            { wrapper }
        );

        expect(photo()).toBe('me-relay.png');
    });

    it('keeps the "You" label', () => {
        hydrate.profiles = { 'me-cloud': { nick: 'Louis', thumbnail: 'me-place.png' } };
        renderSelf();

        expect(screen.getByRole('button', { name: /You/ })).toBeTruthy();
        expect(screen.queryByRole('button', { name: /Louis/ })).toBeNull();
    });
});

describe('ChannelList notes-to-self row stays first', () => {
    const self = { id: 'S1', stereo: 'self', memberIds: ['me'] } as DomainChannel;
    const aiden = { id: 'D1', stereo: 'dm', memberIds: ['me', 'u-a'] } as DomainChannel;
    const zed = { id: 'D2', stereo: 'dm', memberIds: ['me', 'u-z'] } as DomainChannel;

    beforeEach(() => {
        hydrate.cloud = new Map([
            ['u-a', { name: 'Aiden' }],
            ['u-z', { name: 'Zed' }],
        ]);
        storedOrder.ids = [];
        storedOrder.set.mockReset();
    });
    afterEach(() => {
        hydrate.cloud = new Map();
        storedOrder.ids = [];
    });

    const renderDms = (selectedChannelId: string | null = null) =>
        render(
            <ChannelList
                channels={[zed, self, aiden]}
                isLoading={false}
                selectedChannelId={selectedChannelId}
                query=""
                onSelect={vi.fn()}
                isDefaultMode={false}
            />,
            { wrapper }
        );
    const dmLabels = () =>
        screen
            .getAllByRole('button')
            .map(b => b.textContent ?? '')
            .filter(text => /^(Y|A|Z)?(You|Aiden|Zed)$/.test(text))
            .map(text => text.replace(/^[YAZ]/, ''));

    it('draws it above every 1:1, whatever the names sort to', () => {
        renderDms();

        expect(dmLabels()).toEqual(['You', 'Aiden', 'Zed']);
    });

    it('keeps it first when a stored order puts it later', () => {
        storedOrder.ids = ['D2', 'D1', 'S1'];
        renderDms();

        expect(dmLabels()).toEqual(['You', 'Zed', 'Aiden']);
    });

    it('does not move it by keyboard', () => {
        renderDms('S1');

        act(() => {
            fireEvent.keyDown(screen.getByRole('navigation'), { key: 'ArrowDown', altKey: true, shiftKey: true });
        });

        expect(storedOrder.set).not.toHaveBeenCalled();
    });

    it('does not let a 1:1 move above it', () => {
        storedOrder.ids = ['D1', 'D2'];
        renderDms('D1');

        act(() => {
            fireEvent.keyDown(screen.getByRole('navigation'), { key: 'ArrowUp', altKey: true, shiftKey: true });
        });

        // The top 1:1 is clamped where it is; the write, if any, leaves the order unchanged.
        for (const [ids] of storedOrder.set.mock.calls) expect(ids).toEqual(['D1', 'D2']);
        expect(dmLabels()[0]).toBe('You');
    });

    it('leaves it out of the order a 1:1 move writes', () => {
        storedOrder.ids = ['D1', 'D2'];
        renderDms('D1');

        act(() => {
            fireEvent.keyDown(screen.getByRole('navigation'), { key: 'ArrowDown', altKey: true, shiftKey: true });
        });

        expect(storedOrder.set).toHaveBeenCalledWith(['D2', 'D1']);
    });
});

describe('ChannelList 1:1 names on a cold cloud', () => {
    // Room names sort the other way round from the people's names, so a sort by room name shows.
    const dmZed = { id: 'D1', stereo: 'dm', name: 'a-room', memberIds: ['me', '1000007'] } as DomainChannel;
    const dmAmy = { id: 'D2', stereo: 'dm', name: 'z-room', memberIds: ['me', '1000192'] } as DomainChannel;
    const listOf = (channels: DomainChannel[]) => (
        <ChannelList
            channels={channels}
            isLoading={false}
            selectedChannelId={null}
            query=""
            onSelect={vi.fn()}
            isDefaultMode={false}
        />
    );
    const dmRowNames = () =>
        Array.from(document.querySelectorAll<HTMLElement>('[data-channel-row]')).map(el => el.textContent);

    afterEach(() => {
        vi.useRealTimers();
        hydrate.cloud = new Map();
    });

    it('draws placeholder rows, never the ids, until every name arrives, then sorts once by name', () => {
        hydrate.cloud = new Map([['1000007', { name: 'Zed' }]]);
        const { rerender } = render(listOf([dmZed, dmAmy]), { wrapper });

        expect(screen.queryByText(/1000192|1000007/)).toBeNull();
        expect(dmRowNames()).toEqual([]);
        expect(screen.getByRole('status', { name: 'Loading channels' })).toBeTruthy();

        hydrate.cloud = new Map([
            ['1000007', { name: 'Zed' }],
            ['1000192', { name: 'Amy' }],
        ]);
        rerender(listOf([dmZed, dmAmy]));

        expect(dmRowNames()).toEqual(['AAmy', 'ZZed']);
    });

    it('falls back to the room name once the wait runs out', () => {
        vi.useFakeTimers();
        render(listOf([dmZed]), { wrapper });
        expect(dmRowNames()).toEqual([]);

        act(() => {
            vi.advanceTimersByTime(DM_NAME_WAIT_MS);
        });

        expect(dmRowNames()).toEqual(['Aa-room']);
    });

    // Once the section has settled, a new 1:1 must not fold every row back into placeholders.
    it('holds only the new row when a 1:1 arrives after the names settled', () => {
        hydrate.cloud = new Map([['1000007', { name: 'Zed' }]]);
        const { rerender } = render(listOf([dmZed]), { wrapper });
        expect(dmRowNames()).toEqual(['ZZed']);

        rerender(listOf([dmZed, dmAmy]));

        expect(dmRowNames()).toEqual(['ZZed']);
        expect(screen.queryByText(/1000192/)).toBeNull();
        expect(screen.queryByRole('status', { name: 'Loading channels' })).toBeNull();
    });
});

describe('ChannelList drawing order', () => {
    afterEach(() => {
        cleanup();
        storedOrder.ids = [];
    });

    // The next-unread shortcut walks this order; a sidebar filter must not shorten it.
    it('publishes the whole order, even while a filter is typed', () => {
        const channels = [
            { id: 'C1', name: 'general' },
            { id: 'C2', name: 'random' },
            { id: 'D1', stereo: 'dm', name: 'u1' },
        ] as DomainChannel[];
        storedOrder.ids = ['C2', 'C1'];
        render(
            <ChannelList
                channels={channels}
                isLoading={false}
                selectedChannelId="C1"
                query="gen"
                onSelect={vi.fn()}
                isDefaultMode={false}
            />,
            { wrapper }
        );
        expect(useSidebarOrderStore.getState().ids).toEqual(['C2', 'C1', 'D1']);
    });
});

describe('ChannelList place members without a 1:1', () => {
    const general = { id: 'C1', name: 'general', memberIds: ['me', 'u-b', 'u-a', 'u-new'] } as DomainChannel;
    const dm = { id: 'D1', stereo: 'dm', memberIds: ['me', 'u-dm'] } as DomainChannel;
    const memberPeers = [
        { peerId: 'u-b', channelId: 'C1' },
        { peerId: 'u-a', channelId: 'C1' },
        { peerId: 'u-new', channelId: 'C1' },
    ];
    const renderWith = (props: {
        onStartDm?: (peerId: string) => void;
        query?: string;
        startingPeerId?: string | null;
    }) =>
        render(
            <ChannelList
                channels={[general, dm]}
                isLoading={false}
                selectedChannelId={null}
                query={props.query ?? ''}
                onSelect={vi.fn()}
                isDefaultMode={false}
                memberPeers={memberPeers}
                onStartDm={props.onStartDm}
                startingPeerId={props.startingPeerId}
            />,
            { wrapper }
        );
    const dmSectionRows = () =>
        Array.from(document.querySelectorAll<HTMLElement>('[data-channel-row]')).map(el => el.textContent);

    beforeEach(() => {
        hydrate.cloud = new Map([
            ['u-dm', { name: 'Dana' }],
            ['u-a', { name: 'Alice' }],
            ['u-b', { name: 'Bob' }],
        ]);
    });
    afterEach(() => {
        hydrate.cloud = new Map();
    });

    // A place whose people have no 1:1 with me still shows them, so the section is never empty.
    it('lists them after the 1:1s, by name, and starts the 1:1 on click', () => {
        const onStartDm = vi.fn();
        renderWith({ onStartDm });

        expect(dmSectionRows().slice(-3)).toEqual(['DDana', 'AAlice', 'BBob']);
        fireEvent.click(screen.getByText('Bob'));
        expect(onStartDm).toHaveBeenCalledWith('u-b');
    });

    // They have no room to order, so the section never lets one be picked up.
    it('does not let them be dragged', () => {
        renderWith({ onStartDm: vi.fn() });

        const wrapper = screen.getByText('Alice').closest('[data-channel-row]')?.parentElement;
        expect(wrapper?.className).toContain('cursor-default');
    });

    it('waits for a name rather than draw a raw id, and asks for it', () => {
        renderWith({ onStartDm: vi.fn() });

        expect(screen.queryByText('u-new')).toBeNull();
        expect(hydrate.peers).toContainEqual({ peerId: 'u-new', channelId: 'C1' });
    });

    it('filters them with the sidebar query', () => {
        renderWith({ onStartDm: vi.fn(), query: 'ali' });

        expect(screen.getByText('Alice')).toBeTruthy();
        expect(screen.queryByText('Bob')).toBeNull();
    });

    it('lists no one where a 1:1 cannot be started', () => {
        renderWith({});

        expect(screen.queryByText('Alice')).toBeNull();
    });

    // The row's visible text is only a name; a screen reader has to hear that pressing it starts a 1:1.
    it('names each row for the 1:1 it starts', () => {
        renderWith({ onStartDm: vi.fn() });

        expect(screen.getByRole('button', { name: 'Start a direct message with Bob' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Start a direct message with Alice' })).toBeTruthy();
    });

    describe('while a 1:1 is starting', () => {
        it('marks the starting row busy and shows progress on it only', () => {
            renderWith({ onStartDm: vi.fn(), startingPeerId: 'u-b' });

            const bob = screen.getByRole('button', { name: 'Start a direct message with Bob' });
            const alice = screen.getByRole('button', { name: 'Start a direct message with Alice' });
            expect(bob.getAttribute('aria-busy')).toBe('true');
            expect(within(bob).getByRole('status')).toBeTruthy();
            expect(alice.getAttribute('aria-busy')).toBeNull();
            expect(within(alice).queryByRole('status')).toBeNull();
        });

        it('does not start another 1:1 from any person row, the starting one included', () => {
            const onStartDm = vi.fn();
            renderWith({ onStartDm, startingPeerId: 'u-b' });

            fireEvent.click(screen.getByText('Bob'));
            fireEvent.click(screen.getByText('Alice'));

            expect(onStartDm).not.toHaveBeenCalled();
        });

        // A native `disabled` would drop the pressed row out of the tab order and lose its focus.
        it('keeps every person row focusable for the arrow-key walk', () => {
            renderWith({ onStartDm: vi.fn(), startingPeerId: 'u-b' });

            const alice = screen.getByRole('button', { name: 'Start a direct message with Alice' });
            expect(alice.hasAttribute('disabled')).toBe(false);
            expect(alice.getAttribute('aria-disabled')).toBe('true');
        });

        it('shows no progress and starts normally once it is over', () => {
            const onStartDm = vi.fn();
            renderWith({ onStartDm, startingPeerId: null });

            screen.getAllByRole('button', { name: /^Start a direct message with/ }).forEach(row => {
                expect(within(row).queryByRole('status')).toBeNull();
                expect(row.getAttribute('aria-busy')).toBeNull();
            });
            fireEvent.click(screen.getByText('Alice'));
            expect(onStartDm).toHaveBeenCalledWith('u-a');
        });
    });
});

describe('ChannelList empty state', () => {
    // The Home cloud's hint promised messages under "No channels yet": the wrong noun for a
    // list of channels.
    it('says where channels come from when the Home cloud has none', () => {
        render(
            <ChannelList
                channels={[]}
                isLoading={false}
                selectedChannelId={null}
                query=""
                onSelect={vi.fn()}
                isDefaultMode
            />,
            { wrapper }
        );

        expect(screen.getByText('No channels yet')).toBeTruthy();
        expect(screen.getByText("Channels you're invited to will appear here.")).toBeTruthy();
        expect(screen.queryByText(/messages/i)).toBeNull();
    });
});

describe('ChannelList on Home', () => {
    const homeList = (props: { isDefaultMode: boolean; query?: string }) => (
        <ChannelList
            channels={[CHANNEL]}
            isLoading={false}
            selectedChannelId={null}
            query={props.query ?? ''}
            onSelect={vi.fn()}
            isDefaultMode={props.isDefaultMode}
        />
    );
    const pointer = () => screen.queryByText(i18next.t('mobileApp.homeDm'), { exact: false });

    beforeEach(() => useSidebarSectionsStore.setState({ collapsed: {} }));

    // Home offers no way to start a 1:1, and the section used to vanish without a word.
    it('says a 1:1 on Home starts in the mobile app', () => {
        render(homeList({ isDefaultMode: true }), { wrapper });
        expect(screen.getByRole('heading', { name: i18next.t('sidebar.dms') })).toBeTruthy();
        expect(pointer()).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Google Play' }).getAttribute('href')).toMatch(/play\.google\.com/);
    });

    it('says nothing in a cloud, where the section has its own way in', () => {
        render(homeList({ isDefaultMode: false }), { wrapper });
        expect(pointer()).toBeNull();
    });

    it('folds away with its section', () => {
        useSidebarSectionsStore.setState({ collapsed: { dm: true } });
        render(homeList({ isDefaultMode: true }), { wrapper });
        expect(pointer()).toBeNull();
    });
});
