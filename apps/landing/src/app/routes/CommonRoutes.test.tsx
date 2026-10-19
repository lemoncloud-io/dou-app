import { render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';

import { CommonRoutes } from './CommonRoutes';

// The pages themselves are not under test here — only which feature a URL reaches, and whether the
// URL survives the trip.
vi.mock('../features/deeplink', () => ({ DeepLinkRoutes: () => <p>deeplink</p> }));
vi.mock('../features/policy', () => ({ PolicyRoutes: () => <p>policy</p> }));
vi.mock('../features/home', async () => {
    const { Navigate, Route, Routes } = await import('react-router-dom');
    return {
        HomeRoutes: () => (
            <Routes>
                <Route index element={<p>home</p>} />
                <Route path="*" element={<Navigate to="/" />} />
            </Routes>
        ),
    };
});

const renderAt = (url: string) => {
    const router = createMemoryRouter(CommonRoutes, { initialEntries: [url] });
    render(<RouterProvider router={router} />);
    return router;
};

describe('CommonRoutes', () => {
    it('sends an encoded invite link to the bounce page and keeps its token', async () => {
        const router = renderAt('/i?t=eyJjIjoiaW52dDoxOngifQ');

        expect(await screen.findByText('deeplink')).toBeTruthy();
        expect(router.state.location.pathname).toBe('/i');
        expect(router.state.location.search).toBe('?t=eyJjIjoiaW52dDoxOngifQ');
    });

    it('sends a query invite link to the bounce page', async () => {
        renderAt('/s?code=invt:1:x&relay');

        expect(await screen.findByText('deeplink')).toBeTruthy();
    });

    it('still sends an unknown path home', async () => {
        const router = renderAt('/invite/accept');

        expect(await screen.findByText('home')).toBeTruthy();
        expect(router.state.location.pathname).toBe('/');
    });
});
