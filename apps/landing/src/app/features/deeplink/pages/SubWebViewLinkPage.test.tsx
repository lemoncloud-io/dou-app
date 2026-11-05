import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { openUrl } from '../utils';

import type * as Utils from '../utils';

import { SubWebViewLinkPage } from './SubWebViewLinkPage';

vi.mock('../utils', async importOriginal => ({
    ...(await importOriginal<typeof Utils>()),
    openUrl: vi.fn(),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const openUrlMock = vi.mocked(openUrl);

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36';
const IOS_SAFARI =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Safari/604.1';

// jsdom's location cannot be pointed at another host, so the page reads a stand-in.
const visit = (href: string, userAgent: string) => {
    const url = new URL(href);
    vi.stubGlobal('location', {
        href,
        origin: url.origin,
        pathname: url.pathname,
        search: url.search,
        hash: url.hash,
    });
    Object.defineProperty(navigator, 'userAgent', { configurable: true, get: () => userAgent });
    render(
        <MemoryRouter initialEntries={['/apps/x']}>
            <Routes>
                <Route path="/apps/*" element={<SubWebViewLinkPage />} />
                <Route path="/" element={<p>home</p>} />
            </Routes>
        </MemoryRouter>
    );
};

describe('SubWebViewLinkPage', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        openUrlMock.mockClear();
    });

    it('tries the app at once on Android, with the link as it came', () => {
        visit('https://app.chatic.io/apps/quiz?seed=7', ANDROID);

        expect(openUrlMock).toHaveBeenCalledTimes(1);
        expect(openUrlMock.mock.calls[0][0].startsWith('intent://apps/quiz?seed=7#Intent;')).toBe(true);
    });

    // Android's launch falls back to this page with the marker when the app is missing: it stays here,
    // does not launch again, and offers the app's store through the same button.
    it('stays on the page, without launching again, when Android comes back with the app-missing marker', () => {
        visit('https://app.chatic.io/apps/quiz?seed=7#app-missing', ANDROID);

        expect(openUrlMock).not.toHaveBeenCalled();
        expect(screen.getByText('deeplink.button.openApp')).toBeTruthy();
        expect(screen.queryByText('home')).toBeNull();
    });

    // The page is meant to run in the app: the browser is never offered, only the app and the store.
    it('offers the app and not the browser', () => {
        visit('https://app.chatic.io/apps/quiz', IOS_SAFARI);

        expect(screen.getByText('deeplink.button.openApp')).toBeTruthy();
        expect(screen.queryByText('deeplink.button.viewInWeb')).toBeNull();
        expect(openUrlMock).not.toHaveBeenCalled();
    });

    it.each([
        ['a host it does not serve links on', 'http://localhost:5173/apps/quiz'],
        ['a path after the app id', 'https://app.chatic.io/apps/quiz/level?x=1'],
        ['an id that is not one label', 'https://app.chatic.io/apps/Quiz'],
    ])('goes home from %s', (_label, href) => {
        visit(href, ANDROID);

        expect(openUrlMock).not.toHaveBeenCalled();
        expect(screen.getByText('home')).toBeTruthy();
    });
});
