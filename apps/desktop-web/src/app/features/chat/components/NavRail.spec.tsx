import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import i18next from 'i18next';

import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

import type * as SharedModule from '../../../shared';

const profile = vi.hoisted(() => ({ photo: undefined as string | undefined, isGuest: false }));
const identity = vi.hoisted(() => ({ userId: 'me', delegatorId: null as string | null }));
// The account's role, from the relay token. Inside a cloud `profile` is the cloud user's instead.
const relayUser = vi.hoisted(() => ({ userRole: 'user' }));
vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            useSessionIdentity: () => identity,
            getRelaySessionUser: () => relayUser,
            useRuntimeProfile: () => profile,
            useSessionLogout: () => vi.fn(),
        },
    },
}));
vi.mock('../../../shared', async () => ({
    ...(await vi.importActual<typeof SharedModule>('../../../shared')),
    useAccountName: () => 'Me',
    useAccountResetOnLogout: () => ({ resetAccount: vi.fn() }),
    useDisplayProfile: () => ({ name: 'Me', thumbnail: undefined }),
}));
vi.mock('../../auth', () => ({ useJoinDialogStore: () => vi.fn() }));
vi.mock('@chatic/bridges', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import '../../../../i18n';
import { useNavStore } from '../../../shared';
import { NavRail } from './NavRail';

const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter>
        <TooltipProvider>{children}</TooltipProvider>
    </MemoryRouter>
);

// Where the rail navigated last (MemoryRouter keeps history in memory, so
// window.location never moves — the probe reads it instead).
const navProbe = vi.hoisted(() => ({ path: '/' }));
const NavProbe = () => {
    navProbe.path = useLocation().pathname;
    return null;
};

const renderRail = (props: Partial<ComponentProps<typeof NavRail>> = {}) =>
    render(
        <>
            <NavRail items={['home', 'notifications', 'channels', 'dm']} {...props} />
            <NavProbe />
        </>,
        { wrapper }
    );

const navItem = (key: string) => screen.getByRole('button', { name: i18next.t(`nav.${key}`) });

beforeEach(() => {
    vi.clearAllMocks();
    profile.isGuest = false;
    identity.delegatorId = null;
    relayUser.userRole = 'user';
    useNavStore.setState({ active: 'home' });
});

describe('NavRail destinations', () => {
    it('lists the destinations it is given, Home first', () => {
        renderRail();
        const labels = screen
            .getAllByRole('button')
            .map(button => button.getAttribute('aria-label') ?? button.textContent)
            .filter(label => label !== null);
        expect(labels.slice(0, 4)).toEqual(
            ['home', 'notifications', 'channels', 'dm'].map(key => i18next.t(`nav.${key}`))
        );
    });

    it('draws only the destinations whose screens exist', () => {
        renderRail({ items: ['home'] });
        expect(screen.queryByRole('button', { name: i18next.t('nav.notifications') })).toBeNull();
        expect(navItem('home')).toBeTruthy();
    });

    it('marks the active destination as current', () => {
        renderRail();
        expect(navItem('home').getAttribute('aria-current')).toBe('page');
        expect(navItem('channels').getAttribute('aria-current')).toBeNull();
    });

    it('moves the shell to the destination that is clicked', () => {
        renderRail();
        fireEvent.click(navItem('channels'));
        expect(useNavStore.getState().active).toBe('channels');
        expect(navItem('channels').getAttribute('aria-current')).toBe('page');
    });

    it('says when a destination has something unread', () => {
        renderRail({ unread: { notifications: true } });
        expect(
            screen.getByRole('button', { name: i18next.t('nav.unread', { name: i18next.t('nav.notifications') }) })
        ).toBeTruthy();
    });
});

describe('NavRail account menu', () => {
    // Enter on the trigger, not a click: Radix opens a dropdown from pointerdown,
    // and jsdom has no PointerEvent — the MessageList spec documents the same path.
    const openAccountMenu = async () => {
        fireEvent.keyDown(screen.getByRole('button', { name: i18next.t('rail.menu.accountMenu', { name: 'Me' }) }), {
            key: 'Enter',
        });
        await screen.findByRole('menu');
    };
    const joinItem = () => screen.queryByRole('menuitem', { name: i18next.t('rail.menu.join') });

    // A signed-in account that picks "join with invite" only hears "log out first" after
    // typing a code — the item is for guests, so it is shown to guests only.
    it('shows the join item to a guest', async () => {
        relayUser.userRole = 'guest';
        profile.isGuest = true;
        renderRail();
        await openAccountMenu();
        expect(joinItem()).not.toBeNull();
    });

    // A provider sign-in on desktop links the device's guest, so the account keeps the guest id the
    // invite exchange runs under — and the server lets that session into the invited cloud.
    it('shows the join item to a signed-in account linked to the device guest', async () => {
        identity.delegatorId = 'guest-1';
        renderRail();
        await openAccountMenu();
        expect(joinItem()).not.toBeNull();
    });

    it('hides the join item from a signed-in account with no guest to join under', async () => {
        renderRail();
        await openAccountMenu();
        expect(joinItem()).toBeNull();
    });

    // The menu acts as someone, somewhere: its header names the account and its kind.
    it('heads the menu with the account name and kind', async () => {
        profile.isGuest = true;
        renderRail();
        await openAccountMenu();

        expect(screen.getByText('Me')).toBeTruthy();
        expect(screen.getByText(i18next.t('profile.guestName'))).toBeTruthy();
    });

    it('groups profile with account, ahead of settings and log out', async () => {
        renderRail();
        await openAccountMenu();

        const items = screen.getAllByRole('menuitem').map(item => item.textContent);
        expect(items).toContain(i18next.t('rail.menu.account'));
        const order = [i18next.t('rail.menu.profile'), i18next.t('rail.menu.account')];
        expect(items.indexOf(order[0])).toBeLessThan(items.indexOf(order[1]));
        expect(items.indexOf(order[1])).toBeLessThan(items.indexOf(i18next.t('rail.menu.settings')));
        expect(items.indexOf(i18next.t('rail.menu.settings'))).toBeLessThan(
            items.indexOf(i18next.t('rail.menu.logout'))
        );
    });

    it('opens the Account hub from its menu item', async () => {
        renderRail();
        await openAccountMenu();

        fireEvent.click(screen.getByRole('menuitem', { name: i18next.t('rail.menu.account') }));

        expect(navProbe.path).toBe('/account');
    });

    // A guest logout is a delete: the confirm offers the way to keep the
    // account first, and names the destructive choice for what it is.
    it('offers connecting an account before deleting a guest on logout', async () => {
        profile.isGuest = true;
        navProbe.path = '/';
        renderRail();
        await openAccountMenu();

        fireEvent.click(screen.getByRole('menuitem', { name: i18next.t('rail.menu.logout') }));
        fireEvent.click(await screen.findByRole('button', { name: i18next.t('rail.menu.logoutGuest.connect') }));

        expect(navProbe.path).toBe('/account');
    });

    it('names the guest logout confirm for the delete that it is', async () => {
        profile.isGuest = true;
        renderRail();
        await openAccountMenu();

        fireEvent.click(screen.getByRole('menuitem', { name: i18next.t('rail.menu.logout') }));

        expect(await screen.findByRole('button', { name: i18next.t('rail.menu.logoutGuest.confirm') })).toBeTruthy();
    });
});
