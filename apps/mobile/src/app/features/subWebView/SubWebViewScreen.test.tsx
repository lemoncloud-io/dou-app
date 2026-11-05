import React from 'react';
import { act, render } from '@testing-library/react';

import { SubWebViewScreen } from './SubWebViewScreen';

let mockClosePresses: Array<() => void> = [];
let mockRequestClose: (() => void) | undefined;
let mockWebViewProps: Record<string, any> | undefined;
const mockClose = jest.fn();
const mockViewStyles: unknown[] = [];
// Whether the mocked view exposes its handle, as the real one does once mounted.
let mockExposeHandle = false;
const mockRequestCloseHandle = jest.fn();
const mockManifestGet = jest.fn();

const MANIFEST = {
    permissions: new Set(['share']),
    display: 'standard',
    orientation: 'any',
};

jest.mock('react-native', () => {
    const passthrough = ({ children }: { children?: unknown }) => children ?? null;
    return {
        View: (props: { style?: unknown; children?: unknown }) => {
            mockViewStyles.push(props.style);
            return props.children ?? null;
        },
        Text: passthrough,
        TouchableOpacity: (props: { onPress: () => void; children?: unknown }) => {
            mockClosePresses.push(props.onPress);
            return props.children ?? null;
        },
        StyleSheet: { create: (styles: unknown) => styles },
    };
});
jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 12, right: 21 }),
}));
jest.mock('../../hooks', () => ({ useResolvedTheme: () => ({ isDark: false, backgroundColor: '#FFFFFF' }) }));
jest.mock('../../utils', () => ({ t: (key: string) => key }));
jest.mock('../../services', () => ({
    DEFAULT_SUB_WEBVIEW_MANIFEST: { permissions: new Set(), display: 'standard', orientation: 'any' },
    subWebViewService: { close: (...args: unknown[]) => mockClose(...args) },
    subWebViewManifestStore: { get: (origin: string) => mockManifestGet(origin) },
}));
jest.mock('../../subWebView', () => {
    const { forwardRef, useImperativeHandle } = jest.requireActual('react');
    return {
        SubWebView: forwardRef((props: { onRequestClose: () => void }, ref: unknown) => {
            mockRequestClose = props.onRequestClose;
            mockWebViewProps = props;
            useImperativeHandle(ref, () => (mockExposeHandle ? { requestClose: mockRequestCloseHandle } : null));
            return null;
        }),
    };
});

const renderScreen = async (manifest: Record<string, unknown> = MANIFEST) => {
    mockManifestGet.mockResolvedValue(manifest);
    const navigation = { goBack: jest.fn(), canGoBack: jest.fn(() => true), setOptions: jest.fn() };
    const route = {
        params: {
            viewId: 'view-1',
            url: 'https://foo.apps.chatic.io/a',
            title: 'From web',
            params: { orderId: 7 },
            appId: 'quiz',
        },
    };
    const view = render(<SubWebViewScreen route={route as any} navigation={navigation as any} />);
    await act(async () => undefined);
    return { navigation, view };
};

/** The close control drawn last: the bar's, or the floating one. */
const pressClose = () => mockClosePresses[mockClosePresses.length - 1]?.();

describe('SubWebViewScreen', () => {
    beforeEach(() => {
        mockClose.mockReset();
        mockClosePresses = [];
        mockRequestClose = undefined;
        mockWebViewProps = undefined;
        mockViewStyles.length = 0;
        mockExposeHandle = false;
        mockRequestCloseHandle.mockReset();
        mockManifestGet.mockReset();
    });

    it("reads the page's manifest by its origin before it loads the page", async () => {
        mockManifestGet.mockReturnValue(new Promise(() => undefined));
        const navigation = { goBack: jest.fn(), canGoBack: jest.fn(() => true), setOptions: jest.fn() };
        const route = { params: { viewId: 'view-1', url: 'https://foo.apps.chatic.io/a', params: {} } };

        render(<SubWebViewScreen route={route as any} navigation={navigation as any} />);

        expect(mockManifestGet).toHaveBeenCalledWith('https://foo.apps.chatic.io');
        expect(mockWebViewProps).toBeUndefined();
    });

    // A manifest that never answers cannot keep the user in.
    it('offers a close control while the manifest is still coming', () => {
        mockManifestGet.mockReturnValue(new Promise(() => undefined));
        mockClose.mockReturnValue({ ok: true });
        const navigation = { goBack: jest.fn(), canGoBack: jest.fn(() => true), setOptions: jest.fn() };
        const route = { params: { viewId: 'view-1', url: 'https://foo.apps.chatic.io/a', params: {} } };
        render(<SubWebViewScreen route={route as any} navigation={navigation as any} />);

        pressClose();

        expect(mockClose).toHaveBeenCalledWith('view-1', 'user');
    });

    it('applies nothing from a manifest that arrives after the screen has gone', async () => {
        let answer: (manifest: unknown) => void = () => undefined;
        mockManifestGet.mockReturnValue(new Promise(resolve => (answer = resolve)));
        const navigation = { goBack: jest.fn(), canGoBack: jest.fn(() => true), setOptions: jest.fn() };
        const route = { params: { viewId: 'view-1', url: 'https://foo.apps.chatic.io/a', params: {} } };
        const view = render(<SubWebViewScreen route={route as any} navigation={navigation as any} />);

        view.unmount();
        await act(async () => answer({ ...MANIFEST, orientation: 'landscape' }));

        expect(navigation.setOptions).not.toHaveBeenCalled();
    });

    it('loads the page with the defaults if the manifest store rejects', async () => {
        mockManifestGet.mockRejectedValue(new Error('unexpected'));
        const navigation = { goBack: jest.fn(), canGoBack: jest.fn(() => true), setOptions: jest.fn() };
        const route = { params: { viewId: 'view-1', url: 'https://foo.apps.chatic.io/a', params: {} } };
        render(<SubWebViewScreen route={route as any} navigation={navigation as any} />);
        await act(async () => undefined);

        expect(mockWebViewProps).toEqual(expect.objectContaining({ permissions: new Set() }));
    });

    it("hands the view the manifest's permissions", async () => {
        await renderScreen();

        expect(mockWebViewProps).toEqual(expect.objectContaining({ permissions: new Set(['share']) }));
    });

    it.each([
        ['any', 'default'],
        ['portrait', 'portrait'],
        ['landscape', 'landscape'],
    ])('holds the screen to a %s orientation', async (orientation, option) => {
        const { navigation } = await renderScreen({ ...MANIFEST, orientation });

        expect(navigation.setOptions).toHaveBeenCalledWith({ orientation: option });
    });

    it('drops the bar for a fullscreen page and floats the close control instead', async () => {
        mockExposeHandle = true;
        const { view } = await renderScreen({ ...MANIFEST, display: 'fullscreen' });

        expect(view.container.textContent).not.toContain('From web');
        pressClose();
        expect(mockRequestCloseHandle).toHaveBeenCalledWith('control');
    });

    // The view decides whether the page's close guard asks first; the control only says who asked.
    it('hands the close control to the view, which applies the close guard', async () => {
        mockExposeHandle = true;
        await renderScreen();

        pressClose();

        expect(mockRequestCloseHandle).toHaveBeenCalledWith('control');
        expect(mockClose).not.toHaveBeenCalled();
    });

    it('pads every edge by the safe area, so the page needs no insets', async () => {
        await renderScreen();

        expect(mockViewStyles[0]).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ paddingTop: 47, paddingBottom: 34, paddingLeft: 12, paddingRight: 21 }),
            ])
        );
    });

    // The service's close event is what takes the screen down; the screen leaves nothing to chance
    // twice over.
    it('closes the view as the user, and leaves the dismissal to the service', async () => {
        mockClose.mockReturnValue({ ok: true });
        const { navigation } = await renderScreen();

        pressClose();

        expect(mockClose).toHaveBeenCalledWith('view-1', 'user');
        expect(navigation.goBack).not.toHaveBeenCalled();
    });

    // A screen the service no longer knows has no other way out: no gesture, no service event.
    it('leaves by itself when the service no longer knows the view', async () => {
        mockClose.mockReturnValue({ ok: false, code: 'NOT_OPEN' });
        const { navigation } = await renderScreen();

        mockRequestClose?.();

        expect(navigation.goBack).toHaveBeenCalledTimes(1);
    });

    it('hands the view its id, params and app id', async () => {
        await renderScreen();

        expect(mockWebViewProps).toEqual(
            expect.objectContaining({ viewId: 'view-1', params: { orderId: 7 }, appId: 'quiz' })
        );
    });

    // The page's own request outranks the document's title, which outranks the web's, which outranks
    // the manifest's name.
    it('shows the title the page asked for over the others', async () => {
        const { view } = await renderScreen({ ...MANIFEST, name: 'From manifest' });
        expect(view.container.textContent).toContain('From web');

        act(() => mockWebViewProps?.onTitleChange('Document title'));
        expect(view.container.textContent).toContain('Document title');

        act(() => mockWebViewProps?.onTitleRequest('Asked for'));
        act(() => mockWebViewProps?.onTitleChange('Another document title'));
        expect(view.container.textContent).toContain('Asked for');
        expect(view.container.textContent).not.toContain('Another document title');
    });

    it("falls back to the manifest's name when nothing else names the page", async () => {
        mockManifestGet.mockResolvedValue({ ...MANIFEST, name: 'From manifest' });
        const navigation = { goBack: jest.fn(), canGoBack: jest.fn(() => true), setOptions: jest.fn() };
        const route = { params: { viewId: 'view-1', url: 'https://foo.apps.chatic.io/a', params: {} } };
        const view = render(<SubWebViewScreen route={route as any} navigation={navigation as any} />);
        await act(async () => undefined);

        expect(view.container.textContent).toContain('From manifest');
    });

    it('closes the view on unmount, which is a no-op once the service has closed it', async () => {
        mockClose.mockReturnValue({ ok: false, code: 'NOT_OPEN' });
        const { view } = await renderScreen();

        view.unmount();

        expect(mockClose).toHaveBeenCalledWith('view-1', 'user');
    });
});
