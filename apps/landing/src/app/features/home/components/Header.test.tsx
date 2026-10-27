import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import i18n from '../../../../i18n';

const stage = vi.hoisted(() => ({ open: true }));
vi.mock('../../../config/stage', () => ({
    get isSubscriptionAccountEnabled() {
        return stage.open;
    },
}));
vi.mock('@chatic/theme', () => ({ useTheme: () => ({ theme: 'light', setTheme: () => undefined }) }));

const { Header } = await import('./Header');

const renderHeader = () =>
    render(
        <MemoryRouter>
            <Header />
        </MemoryRouter>
    );

describe('Header', () => {
    beforeAll(() => i18n.changeLanguage('en'));

    it('links to the plans and to sign-in where the subscription pages are open', () => {
        stage.open = true;
        renderHeader();

        expect(screen.getByRole('link', { name: 'View plans' }).getAttribute('href')).toBe('/subscription/plans');
        expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/subscription/login');
    });

    it('keeps the plans link but drops sign-in where the signed-in pages are shut', () => {
        stage.open = false;
        renderHeader();

        expect(screen.getByRole('link', { name: 'View plans' }).getAttribute('href')).toBe('/subscription/plans');
        expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
    });
});
