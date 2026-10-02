import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { BOTTOM_NAV_TOAST_LIFT, BottomNavigation } from './BottomNavigation';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => jest.fn() }));
jest.mock('@chatic/web-ui-kit', () => ({ FloatingTabBar: () => <nav /> }));

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
});
