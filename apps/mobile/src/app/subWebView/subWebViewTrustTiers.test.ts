import React from 'react';
import { act, render } from '@testing-library/react';

import { SubWebViewScreen } from '../features/subWebView/SubWebViewScreen';
import { SubWebViewService } from '../services/subWebView/SubWebViewService';
import { decideSubWebViewNavigation } from './subWebViewNavigation';

/**
 * The phone shell opens any plain https site, in one of three tiers: the hub (`firstParty`), a page
 * the review pipeline deploys (`reviewed`), and any other site (`external`) — a link a cloud's owner
 * saved. An external site gets the base set only: no manifest is fetched from it, the bar is always
 * shown and titled with its host, and only its own origin loads in the view.
 */

const mockManifestGet = jest.fn();
let mockViewProps: Record<string, any> | undefined;
const mockTexts: unknown[] = [];

jest.mock('react-native', () => {
    const passthrough = ({ children }: { children?: unknown }) => children ?? null;
    return {
        View: passthrough,
        Text: ({ children }: { children?: unknown }) => {
            mockTexts.push(children);
            return null;
        },
        TouchableOpacity: passthrough,
        StyleSheet: { create: (styles: unknown) => styles },
    };
});
jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../hooks', () => ({ useResolvedTheme: () => ({ isDark: false, backgroundColor: '#FFFFFF' }) }));
jest.mock('../utils', () => ({ t: (key: string) => key }));
jest.mock('../services', () => ({
    DEFAULT_SUB_WEBVIEW_MANIFEST: { permissions: new Set(), display: 'fullscreen', orientation: 'any' },
    subWebViewService: { close: jest.fn() },
    subWebViewManifestStore: { get: (origin: string) => mockManifestGet(origin) },
}));
jest.mock('./index', () => ({
    SubWebView: (props: Record<string, any>) => {
        mockViewProps = props;
        return null;
    },
}));

const createService = () => {
    let n = 0;
    return new SubWebViewService({ warn: jest.fn(), error: jest.fn() } as any, () => `view-${++n}`);
};

const renderScreen = async (params: Record<string, unknown>) => {
    const navigation = { goBack: jest.fn(), canGoBack: jest.fn(() => true), setOptions: jest.fn() };
    render(
        React.createElement(SubWebViewScreen, {
            route: { params: { viewId: 'view-1', params: {}, ...params } } as any,
            navigation: navigation as any,
        })
    );
    await act(async () => undefined);
};

/** What the bar's title shows: the last title drawn. */
const barTitle = () => mockTexts.filter(text => text !== '✕').at(-1);

beforeEach(() => {
    mockManifestGet.mockReset();
    mockViewProps = undefined;
    mockTexts.length = 0;
});

describe('opening a sub WebView, by tier', () => {
    it.each([
        ['an external site', 'https://example.com', 'external'],
        ['an external site with a path', 'https://shop.example/app?x=1', 'external'],
        ['the hub', 'https://apps.chatic.io', 'firstParty'],
        ['the dev hub', 'https://apps-dev.chatic.io/', 'firstParty'],
        ['a reviewed page', 'https://dou-raise.apps.chatic.io/a', 'reviewed'],
    ])('opens %s and records its tier', (_label, url, trust) => {
        const result = createService().open({ url });

        expect(result).toEqual({ ok: true, view: expect.objectContaining({ url, trust }) });
    });

    it.each([
        ['userinfo', 'https://user@example.com/'],
        ['a port', 'https://example.com:8443/'],
        ['a backslash', 'https://evil.example\\@foo.apps.chatic.io/'],
        ['an IP literal', 'https://127.0.0.1/'],
    ])('still refuses a url with %s as NOT_ALLOWED', (_label, url) => {
        expect(createService().open({ url })).toEqual({ ok: false, code: 'NOT_ALLOWED' });
    });
});

describe('navigation inside the view', () => {
    const top = (url: string, opened: string) => decideSubWebViewNavigation({ url, isTopFrame: true }, opened);

    it('loads the origin the view was opened on', () => {
        expect(top('https://example.com/next', 'https://example.com')).toBe('load');
    });

    it('hands another https origin to the OS, a reviewed one included', () => {
        expect(top('https://other.example/', 'https://example.com')).toBe('external');
        expect(top('https://foo.apps.chatic.io/', 'https://example.com')).toBe('external');
        expect(top('https://bar.apps.chatic.io/', 'https://foo.apps.chatic.io')).toBe('external');
    });

    it('keeps the hub on its own origin', () => {
        expect(top('https://apps.chatic.io/settings', 'https://apps.chatic.io')).toBe('load');
    });
});

describe('the screen, by tier', () => {
    it('fetches no manifest for an external site and loads it at once, with the base set only', async () => {
        mockManifestGet.mockResolvedValue({
            permissions: new Set(['userKey']),
            display: 'fullscreen',
            orientation: 'any',
        });

        await renderScreen({ url: 'https://example.com/a', trust: 'external' });

        expect(mockManifestGet).not.toHaveBeenCalled();
        expect(mockViewProps?.permissions.size).toBe(0);
    });

    it("shows an external site's host in the bar, over any title the page or the web asks for", async () => {
        await renderScreen({ url: 'https://example.com/a', title: 'DoU 로그인', trust: 'external' });

        await act(async () => {
            mockViewProps?.onTitleRequest('DoU 로그인');
            mockViewProps?.onTitleChange('DoU 로그인');
        });

        expect(barTitle()).toBe('example.com');
    });

    it("applies the hub's manifest, as for a reviewed page", async () => {
        mockManifestGet.mockResolvedValue({
            name: 'Hub',
            permissions: new Set(),
            display: 'standard',
            orientation: 'any',
        });

        await renderScreen({ url: 'https://apps.chatic.io', trust: 'firstParty' });

        expect(mockManifestGet).toHaveBeenCalledWith('https://apps.chatic.io');
        expect(barTitle()).toBe('Hub');
    });
});
