import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import i18n from '../../../../i18n';

import { SubscriptionRoutes } from './index';

// The production wiring: mounted with no setup of its own, as the route table mounts it where the
// account surface is shut. No server port may be made there — it would read the URL and session storage.
const createHttpSetup = vi.hoisted(() => vi.fn());
vi.mock('../lib/port/http', async importOriginal => ({
    ...(await importOriginal<object>()),
    createHttpSetup,
}));

beforeAll(async () => {
    await i18n.changeLanguage('en');
});

describe('SubscriptionRoutes with the account surface shut', () => {
    it('lists the plans on the catalog port without ever making the server port', async () => {
        render(
            <MemoryRouter initialEntries={['/subscription/plans']}>
                <Routes>
                    <Route path="/subscription/plans/*" element={<SubscriptionRoutes account={false} />} />
                </Routes>
            </MemoryRouter>
        );

        expect(await screen.findByRole('heading', { name: 'DoU plans' })).toBeTruthy();
        // An English reader is shown dollars; the Korean page shows won.
        expect(screen.getByText('$6.00')).toBeTruthy();
        expect(createHttpSetup).not.toHaveBeenCalled();
    });

    it('prices the plans in won for a Korean reader', async () => {
        await i18n.changeLanguage('ko');
        try {
            render(
                <MemoryRouter initialEntries={['/subscription/plans']}>
                    <Routes>
                        <Route path="/subscription/plans/*" element={<SubscriptionRoutes account={false} />} />
                    </Routes>
                </MemoryRouter>
            );
            expect(await screen.findByText('₩8,600/월')).toBeTruthy();
            expect(screen.queryByText(/\$6\.00/)).toBeNull();
        } finally {
            await i18n.changeLanguage('en');
        }
    });
});
