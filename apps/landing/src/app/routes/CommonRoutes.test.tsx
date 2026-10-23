import { render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';

import i18n from '../../i18n';

import { appRoutes } from './index';

// The pages themselves are not under test here — only which screen a URL reaches, where the URL
// ends up, and whether its query survives the trip. Each feature's own route table stays real.
vi.mock('../features/home/pages', () => ({ HomePage: () => <p>home</p> }));
vi.mock('../features/policy/pages', () => ({
    TermsOfServicePage: () => <p>terms</p>,
    PrivacyPolicyPage: () => <p>privacy</p>,
    ChildPolicyPage: () => <p>child</p>,
}));
vi.mock('../features/deeplink/pages', () => ({ DeepLinkPage: () => <p>deeplink</p> }));

const renderAt = (url: string) => {
    const router = createMemoryRouter(appRoutes, { initialEntries: [url] });
    render(<RouterProvider router={router} />);
    return router;
};

const Throws = () => {
    throw new Error('boom');
};

// The same table with home swapped for a component that throws while rendering.
const withThrowingHome = () => appRoutes.map(route => (route.index ? { ...route, element: <Throws /> } : route));

describe('appRoutes', () => {
    // The public URLs and what each resolves to. Store listings, the sitemap and links already sent
    // to people cite these, so a changed row is a broken link somewhere this repo cannot see.
    it.each([
        ['/', 'home', '/'],
        ['/?ref=x', 'home', '/?ref=x'],
        ['/policy/terms', 'terms', '/policy/terms'],
        ['/policy/privacy', 'privacy', '/policy/privacy'],
        ['/policy/child', 'child', '/policy/child'],
        ['/policy', 'terms', '/policy/terms'],
        ['/policy/unknown/x', 'terms', '/policy/terms'],
        ['/s', 'deeplink', '/s'],
        ['/s/1000052', 'deeplink', '/s/1000052'],
        ['/s?code=invt:1:x&relay', 'deeplink', '/s?code=invt:1:x&relay'],
        ['/i?t=eyJjIjoiaW52dDoxOngifQ', 'deeplink', '/i?t=eyJjIjoiaW52dDoxOngifQ'],
        ['/i/extra', 'deeplink', '/i/extra'],
        ['/invite/accept?x=1', 'home', '/'],
        ['/subscription', 'home', '/'],
    ])('%s renders %s at %s', async (url, screenText, finalUrl) => {
        const router = renderAt(url);

        expect(await screen.findByText(screenText)).toBeTruthy();
        expect(router.state.location.pathname + router.state.location.search).toBe(finalUrl);
    });

    it('leaves an unknown path in history when it sends it home', async () => {
        const router = renderAt('/invite/accept');

        await screen.findByText('home');

        expect(router.state.historyAction).toBe('PUSH');
    });

    it('shows the error screen, not the router default, when a route throws', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        render(<RouterProvider router={createMemoryRouter(withThrowingHome(), { initialEntries: ['/'] })} />);

        expect(await screen.findByRole('alert')).toBeTruthy();
        expect(screen.getByText('An Error Occurred')).toBeTruthy();
        consoleError.mockRestore();
    });

    it("shows the error screen in the reader's language", async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        await i18n.changeLanguage('ko');
        render(<RouterProvider router={createMemoryRouter(withThrowingHome(), { initialEntries: ['/'] })} />);

        expect(await screen.findByText('오류 발생')).toBeTruthy();
        expect(screen.getByText('다시 시도')).toBeTruthy();
        await i18n.changeLanguage('en');
        consoleError.mockRestore();
    });
});
