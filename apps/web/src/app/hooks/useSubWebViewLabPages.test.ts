import { renderHook } from '@testing-library/react';

import { SUB_WEBVIEW_LAB_PAGES, useSubWebViewLabPages } from './useSubWebViewLabPages';

let mockEnabled: unknown = false;
jest.mock('@chatic/config/react', () => ({
    useConfigValue: (key: string) => (key === 'feature.lab.subWebViewPages' ? mockEnabled : undefined),
}));

describe('useSubWebViewLabPages', () => {
    it('lists the pages when the flag is on', () => {
        mockEnabled = true;

        expect(renderHook(() => useSubWebViewLabPages()).result.current).toBe(SUB_WEBVIEW_LAB_PAGES);
    });

    it.each([false, undefined])('lists nothing when the flag is %s', value => {
        mockEnabled = value;

        expect(renderHook(() => useSubWebViewLabPages()).result.current).toEqual([]);
    });

    // The shell opens only https on a one-label subdomain of apps(-dev).chatic.io.
    it('keeps only pages the sub WebView would open', () => {
        SUB_WEBVIEW_LAB_PAGES.forEach(page => {
            expect(page.url).toMatch(/^https:\/\/[a-z0-9-]+\.apps-dev\.chatic\.io\/$/);
            expect(page.url.startsWith(`https://${page.name}.`)).toBe(true);
        });
    });
});
