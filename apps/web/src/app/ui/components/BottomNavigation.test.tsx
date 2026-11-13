import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { BOTTOM_NAV_TOAST_LIFT, BottomNavigation } from './BottomNavigation';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => jest.fn() }));
const mockHaptic = jest.fn();
jest.mock('../../bridge/haptics', () => ({ haptics: { play: (kind: string) => mockHaptic(kind) } }));
// The bar is the kit's; here it lists its items so the set of tabs and their marks can be read.
jest.mock('@chatic/web-ui-kit', () => ({
    FloatingTabBar: ({
        items,
        onSelect,
    }: {
        items: { key: string; label: string; dot?: boolean; active?: boolean }[];
        onSelect: (key: string) => void;
    }) => (
        <nav>
            {items.map(item => (
                <span
                    key={item.key}
                    data-key={item.key}
                    data-dot={String(!!item.dot)}
                    data-active={String(!!item.active)}
                    onClick={() => onSelect(item.key)}
                >
                    {item.label}
                </span>
            ))}
        </nav>
    ),
    IconNavBell: () => null,
    IconNavBellSolid: () => null,
    IconNavChat: () => null,
    IconNavChatSolid: () => null,
    IconNavMy: () => null,
    IconNavMySolid: () => null,
}));

let mockKeyboardOpen = false;
jest.mock('../hooks/useKeyboardOpen', () => ({ useKeyboardOpen: () => mockKeyboardOpen }));

const lift = () => document.documentElement.style.getPropertyValue('--toast-lift');
const renderNav = () =>
    render(
        <MemoryRouter>
            <BottomNavigation />
        </MemoryRouter>
    );

describe('BottomNavigation', () => {
    afterEach(() => {
        mockKeyboardOpen = false;
    });

    it('lifts the snackbar above the tab bar while it is mounted', () => {
        const { unmount } = renderNav();

        expect(lift()).toBe(`${BOTTOM_NAV_TOAST_LIFT}px`);
        unmount();
    });

    it('drops the lift when the tab bar leaves, so a screen without it gets the plain offset', () => {
        const { unmount } = renderNav();

        unmount();

        expect(lift()).toBe('');
    });

    it('lifts nothing while the keyboard is up, since the bar is behind it', () => {
        mockKeyboardOpen = true;

        const { unmount } = renderNav();

        expect(lift()).toBe('');
        unmount();
    });

    it('lifts again once the keyboard goes down', () => {
        mockKeyboardOpen = true;
        const { rerender, unmount } = renderNav();

        mockKeyboardOpen = false;
        rerender(
            <MemoryRouter>
                <BottomNavigation />
            </MemoryRouter>
        );

        expect(lift()).toBe(`${BOTTOM_NAV_TOAST_LIFT}px`);
        unmount();
    });

    it('offers chat, notifications and MY, in that order', () => {
        const { container, unmount } = renderNav();

        expect([...container.querySelectorAll('[data-key]')].map(tab => tab.getAttribute('data-key'))).toEqual([
            '/',
            '/notifications',
            '/mypage',
        ]);
        unmount();
    });

    it('puts a dot on the notifications tab only while something there is unread', () => {
        const { rerender, unmount } = render(
            <MemoryRouter>
                <BottomNavigation hasUnreadNotifications />
            </MemoryRouter>
        );
        expect(screen.getByText('bottomNav.notifications')).toHaveAttribute('data-dot', 'true');

        rerender(
            <MemoryRouter>
                <BottomNavigation hasUnreadNotifications={false} />
            </MemoryRouter>
        );
        expect(screen.getByText('bottomNav.notifications')).toHaveAttribute('data-dot', 'false');
        unmount();
    });

    it('marks the notifications tab active on its route', () => {
        const { unmount } = render(
            <MemoryRouter initialEntries={['/notifications']}>
                <BottomNavigation />
            </MemoryRouter>
        );
        expect(screen.getByText('bottomNav.notifications')).toHaveAttribute('data-active', 'true');
        unmount();
    });

    it('ticks when the bar moves to another tab, and stays quiet on a re-tap of the open one', () => {
        mockHaptic.mockClear();
        const { unmount } = render(
            <MemoryRouter initialEntries={['/']}>
                <BottomNavigation />
            </MemoryRouter>
        );

        fireEvent.click(screen.getByText('bottomNav.chat'));
        expect(mockHaptic).not.toHaveBeenCalled();
        fireEvent.click(screen.getByText('bottomNav.notifications'));
        expect(mockHaptic).toHaveBeenCalledWith('selection');
        unmount();
    });
});
