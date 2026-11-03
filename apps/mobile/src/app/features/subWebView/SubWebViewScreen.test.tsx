import React from 'react';
import { act, render } from '@testing-library/react';

import { SubWebViewScreen } from './SubWebViewScreen';

let mockClosePress: (() => void) | undefined;
let mockRequestClose: (() => void) | undefined;
let mockWebViewProps: Record<string, any> = {};
const mockClose = jest.fn();

jest.mock('react-native', () => {
    const passthrough = ({ children }: { children?: unknown }) => children ?? null;
    return {
        View: passthrough,
        Text: passthrough,
        TouchableOpacity: (props: { onPress: () => void; children?: unknown }) => {
            mockClosePress = props.onPress;
            return props.children ?? null;
        },
        StyleSheet: { create: (styles: unknown) => styles },
    };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));
jest.mock('../../hooks', () => ({ useResolvedTheme: () => ({ isDark: false, backgroundColor: '#FFFFFF' }) }));
jest.mock('../../utils', () => ({ t: (key: string) => key }));
jest.mock('../../services', () => ({ subWebViewService: { close: (...args: unknown[]) => mockClose(...args) } }));
jest.mock('../../subWebView', () => ({
    SubWebView: (props: { onRequestClose: () => void }) => {
        mockRequestClose = props.onRequestClose;
        mockWebViewProps = props;
        return null;
    },
}));

const renderScreen = () => {
    const navigation = { goBack: jest.fn(), canGoBack: jest.fn(() => true) };
    const route = {
        params: { viewId: 'view-1', url: 'https://foo.apps.chatic.io/a', title: 'From web', params: { orderId: 7 } },
    };
    const view = render(<SubWebViewScreen route={route as any} navigation={navigation as any} />);
    return { navigation, view };
};

describe('SubWebViewScreen', () => {
    beforeEach(() => {
        mockClose.mockReset();
        mockClosePress = undefined;
        mockRequestClose = undefined;
    });

    // The service's close event is what takes the screen down; the screen leaves nothing to chance
    // twice over.
    it('closes the view as the user, and leaves the dismissal to the service', () => {
        mockClose.mockReturnValue({ ok: true });
        const { navigation } = renderScreen();

        mockClosePress?.();

        expect(mockClose).toHaveBeenCalledWith('view-1', 'user');
        expect(navigation.goBack).not.toHaveBeenCalled();
    });

    // A screen the service no longer knows has no other way out: no gesture, no service event.
    it('leaves by itself when the service no longer knows the view', () => {
        mockClose.mockReturnValue({ ok: false, code: 'NOT_OPEN' });
        const { navigation } = renderScreen();

        mockRequestClose?.();

        expect(navigation.goBack).toHaveBeenCalledTimes(1);
    });

    it('hands the view its id and params', () => {
        renderScreen();

        expect(mockWebViewProps).toEqual(expect.objectContaining({ viewId: 'view-1', params: { orderId: 7 } }));
    });

    // The page's own request outranks the document's title, which outranks the web's.
    it('shows the title the page asked for over the others', () => {
        const { view } = renderScreen();
        expect(view.container.textContent).toContain('From web');

        act(() => mockWebViewProps.onTitleChange('Document title'));
        expect(view.container.textContent).toContain('Document title');

        act(() => mockWebViewProps.onTitleRequest('Asked for'));
        act(() => mockWebViewProps.onTitleChange('Another document title'));
        expect(view.container.textContent).toContain('Asked for');
        expect(view.container.textContent).not.toContain('Another document title');
    });

    it('closes the view on unmount, which is a no-op once the service has closed it', () => {
        mockClose.mockReturnValue({ ok: false, code: 'NOT_OPEN' });
        const { view } = renderScreen();

        view.unmount();

        expect(mockClose).toHaveBeenCalledWith('view-1', 'user');
    });
});
