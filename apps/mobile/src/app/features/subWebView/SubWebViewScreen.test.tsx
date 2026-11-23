import React from 'react';
import { act, render } from '@testing-library/react';

import { SubWebViewScreen } from './SubWebViewScreen';

let mockClosePresses: Array<() => void> = [];
let mockRequestClose: (() => void) | undefined;
let mockWebViewProps: Record<string, any> | undefined;
const mockClose = jest.fn();
const mockViewStyles: unknown[] = [];
let mockExposeHandle = false;
const mockRequestCloseHandle = jest.fn();
const mockManifestGet = jest.fn();

const MANIFEST = {
    permissions: new Set(['share']),
    display: 'titled',
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
    DEFAULT_SUB_WEBVIEW_MANIFEST: { permissions: new Set(), display: 'clean', orientation: 'any' },
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

const lastContainerStyle = () =>
    mockViewStyles
        .filter(
            (style): style is unknown[] =>
                Array.isArray(style) && style.some(part => (part as { flex?: number } | undefined)?.flex === 1)
        )
        .pop();

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

    it('draws no bar for a page with no manifest, and still offers a way out', async () => {
        mockManifestGet.mockRejectedValue(new Error('unexpected'));
        mockExposeHandle = true;
        const navigation = { goBack: jest.fn(), canGoBack: jest.fn(() => true), setOptions: jest.fn() };
        const route = {
            params: { viewId: 'view-1', url: 'https://foo.apps.chatic.io/a', title: 'From web', params: {} },
        };
        const view = render(<SubWebViewScreen route={route as any} navigation={navigation as any} />);
        await act(async () => undefined);

        expect(view.container.textContent).not.toContain('From web');
        pressClose();
        expect(mockRequestCloseHandle).toHaveBeenCalledWith('control');
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

    it('drops the bar for a clean page and floats the close control instead', async () => {
        mockExposeHandle = true;
        const { view } = await renderScreen({ ...MANIFEST, display: 'clean' });

        expect(view.container.textContent).not.toContain('From web');
        pressClose();
        expect(mockRequestCloseHandle).toHaveBeenCalledWith('control');
    });

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

    it.each(['titled', 'clean'])('keeps a %s page inside the safe area and tells it no insets', async display => {
        await renderScreen({ ...MANIFEST, display });

        expect(lastContainerStyle()).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ paddingTop: 47, paddingBottom: 34, paddingLeft: 12, paddingRight: 21 }),
            ])
        );
        expect(mockWebViewProps).not.toHaveProperty('insets');
        expect(mockWebViewProps).toEqual(expect.objectContaining({ display }));
    });

    it('pads no edge for an immersive page and hands the view the insets', async () => {
        await renderScreen({ ...MANIFEST, display: 'immersive' });

        const container = lastContainerStyle();
        expect(container).toBeDefined();
        for (const style of container ?? []) {
            expect(style).not.toHaveProperty('paddingTop');
            expect(style).not.toHaveProperty('paddingBottom');
            expect(style).not.toHaveProperty('paddingLeft');
            expect(style).not.toHaveProperty('paddingRight');
        }
        expect(mockWebViewProps).toEqual(
            expect.objectContaining({ display: 'immersive', insets: { top: 47, bottom: 34, left: 12, right: 21 } })
        );
    });

    it('draws no bar for an immersive page, and floats the close control where clean has it', async () => {
        mockExposeHandle = true;
        const { view } = await renderScreen({ ...MANIFEST, display: 'immersive' });

        expect(view.container.textContent).not.toContain('From web');
        expect(mockViewStyles).toContainEqual(
            expect.arrayContaining([expect.objectContaining({ top: 55, right: 29 })])
        );
        pressClose();
        expect(mockRequestCloseHandle).toHaveBeenCalledWith('control');
    });

    it('closes the view as the user, and leaves the dismissal to the service', async () => {
        mockClose.mockReturnValue({ ok: true });
        const { navigation } = await renderScreen();

        pressClose();

        expect(mockClose).toHaveBeenCalledWith('view-1', 'user');
        expect(navigation.goBack).not.toHaveBeenCalled();
    });

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
