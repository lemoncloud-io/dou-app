import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import i18n from '../../../../i18n';

import { SubscriptionRoutes } from './index';

// The production wiring: mounted with no setup of its own, as the route table mounts it where the
// account surface is shut. The mock must never be made there — it reads the URL and session storage.
const createMockPort = vi.hoisted(() => vi.fn());
vi.mock('../lib/mock', async importOriginal => ({
    ...(await importOriginal<object>()),
    createMockPort,
}));

beforeAll(async () => {
    window.matchMedia = ((query: string) => ({
        matches: false,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    await i18n.changeLanguage('en');
});

describe('SubscriptionRoutes with the account surface shut', () => {
    it('lists the plans on the catalog port without ever making the mock', async () => {
        render(
            <MemoryRouter initialEntries={['/subscription/plans']}>
                <Routes>
                    <Route path="/subscription/plans/*" element={<SubscriptionRoutes account={false} />} />
                </Routes>
            </MemoryRouter>
        );

        expect(await screen.findByRole('heading', { name: 'DoU plans' })).toBeTruthy();
        expect(screen.getByText('₩8,600')).toBeTruthy();
        expect(createMockPort).not.toHaveBeenCalled();
    });
});
