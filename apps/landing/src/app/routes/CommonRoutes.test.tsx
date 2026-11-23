import { render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';

import i18n from '../../i18n';

import { createAppRoutes } from './index';

vi.mock('../features/home/pages', () => ({ HomePage: () => <p>home</p> }));
vi.mock('../features/policy/pages', () => ({
    TermsOfServicePage: () => <p>terms</p>,
    PrivacyPolicyPage: () => <p>privacy</p>,
    ChildPolicyPage: () => <p>child</p>,
    RefundPolicyPage: () => <p>refund</p>,
}));
vi.mock('../features/subscription', () => ({
    SubscriptionRoutes: ({ account = true }: { account?: boolean }) => (
        <p>{account ? 'subscription' : 'subscription catalog'}</p>
    ),
}));
vi.mock('../features/deeplink/pages', () => ({
    DeepLinkPage: () => <p>deeplink</p>,
    SubWebViewLinkPage: () => <p>sub webview link</p>,
}));

const appRoutes = createAppRoutes({ subscriptionAccount: false });

const renderAt = (url: string, routes = appRoutes) => {
    const router = createMemoryRouter(routes, { initialEntries: [url] });
    render(<RouterProvider router={router} />);
    return router;
};

const Throws = () => {
    throw new Error('boom');
};

const withThrowingHome = () => appRoutes.map(route => (route.index ? { ...route, element: <Throws /> } : route));

describe('appRoutes', () => {
    it.each([
        ['/', 'home', '/'],
        ['/?ref=x', 'home', '/?ref=x'],
        ['/policy/terms', 'terms', '/policy/terms'],
        ['/policy/privacy', 'privacy', '/policy/privacy'],
        ['/policy/child', 'child', '/policy/child'],
        ['/policy/refund', 'refund', '/policy/refund'],
        ['/policy', 'terms', '/policy/terms'],
        ['/policy/unknown/x', 'terms', '/policy/terms'],
        ['/s', 'deeplink', '/s'],
        ['/s/1000052', 'deeplink', '/s/1000052'],
        ['/s?code=invt:1:x&relay', 'deeplink', '/s?code=invt:1:x&relay'],
        ['/i?t=eyJjIjoiaW52dDoxOngifQ', 'deeplink', '/i?t=eyJjIjoiaW52dDoxOngifQ'],
        ['/i/extra', 'deeplink', '/i/extra'],
        ['/apps/quiz', 'sub webview link', '/apps/quiz'],
        ['/apps/quiz/level?x=1', 'sub webview link', '/apps/quiz/level?x=1'],
        ['/invite/accept?x=1', 'home', '/'],
        ['/subscription', 'home', '/'],
        ['/subscription/checkout?plan=pro-tier-01', 'home', '/'],
        ['/subscription/plans?mock=active', 'subscription catalog', '/subscription/plans?mock=active'],
    ])('%s renders %s at %s', async (url, screenText, finalUrl) => {
        const router = renderAt(url);

        expect(await screen.findByText(screenText)).toBeTruthy();
        expect(router.state.location.pathname + router.state.location.search).toBe(finalUrl);
    });

    describe('with the subscription pages open', () => {
        const open = createAppRoutes({ subscriptionAccount: true });

        it.each([
            ['/subscription', '/subscription'],
            ['/subscription/plans?mock=active', '/subscription/plans?mock=active'],
            ['/subscription/sub-1/cancel', '/subscription/sub-1/cancel'],
        ])('%s reaches the subscription pages', async (url, finalUrl) => {
            const router = renderAt(url, open);

            expect(await screen.findByText('subscription')).toBeTruthy();
            expect(router.state.location.pathname + router.state.location.search).toBe(finalUrl);
        });

        it.each([
            ['/', 'home', '/'],
            ['/policy/refund', 'refund', '/policy/refund'],
            ['/s/1000052', 'deeplink', '/s/1000052'],
            ['/invite/accept?x=1', 'home', '/'],
        ])('%s still renders %s', async (url, screenText, finalUrl) => {
            const router = renderAt(url, open);

            expect(await screen.findByText(screenText)).toBeTruthy();
            expect(router.state.location.pathname + router.state.location.search).toBe(finalUrl);
        });
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
