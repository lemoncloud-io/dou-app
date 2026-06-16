import { renderHook, act } from '@testing-library/react';
import { useNavigation } from '@react-navigation/native';
import { useWebViewDeepLink, toLocalUrl } from './useWebViewDeepLink';
import { WEBVIEW_URL } from '../utils/constants';

// Mock react-native-config
jest.mock('react-native-config', () => ({
    default: {
        VITE_ENV: 'DEV',
        VITE_WEBVIEW_BASE_URL: 'http://localhost:5003/',
    },
}));

// Mock @react-navigation/native to avoid ESM syntax parsing error in node_modules
jest.mock('@react-navigation/native', () => ({
    useNavigation: jest.fn(),
}));

// Mock logger
jest.mock('../../services', () => ({
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    },
}));

describe('toLocalUrl', () => {
    it('should resolve relative paths starting with / against WEBVIEW_URL', () => {
        const result = toLocalUrl('/auth/login?code=123');
        expect(result).toBe(`${WEBVIEW_URL}auth/login?code=123`);
    });

    it('should prepend https:// and rewrite host/protocol for URLs missing a scheme', () => {
        const result = toLocalUrl('dou.chatic.io/auth/login?code=123');
        expect(result).toBe(`${WEBVIEW_URL}auth/login?code=123`);
    });

    it('should map custom scheme URLs to local WebView URLs correctly', () => {
        const result = toLocalUrl('chatic-dev://auth/login?code=123');
        expect(result).toBe(`${WEBVIEW_URL}auth/login?code=123`);
    });

    it('should map standard HTTPS URLs to local WebView URLs correctly', () => {
        const result = toLocalUrl('https://dou.chatic.io/auth/login?code=123');
        expect(result).toBe(`${WEBVIEW_URL}auth/login?code=123`);
    });
});

describe('useWebViewDeepLink hook', () => {
    let mockNavigation: any;
    let mockBridge: any;

    beforeEach(() => {
        jest.clearAllMocks();
        mockNavigation = {
            setParams: jest.fn(),
        };
        (useNavigation as jest.Mock).mockReturnValue(mockNavigation);
        mockBridge = {
            pushEvent: jest.fn(),
        };
    });

    it('should initialize source with WEBVIEW_URL if no url param is provided', () => {
        const route = { params: {} } as any;
        const { result } = renderHook(() => useWebViewDeepLink(route, { bridge: mockBridge }));

        expect(result.current.source).toEqual({ uri: WEBVIEW_URL });
        expect(result.current.isRedirecting).toBe(false);
    });

    it('should initialize source with WEBVIEW_URL even on cold start, and push OnNavigate event', () => {
        const route = { params: { url: 'https://dou.chatic.io/auth/login?code=123' } } as any;
        const { result } = renderHook(({ r }) => useWebViewDeepLink(r, { bridge: mockBridge }), {
            initialProps: { r: route },
        });

        // Source must always be the base URL
        expect(result.current.source).toEqual({ uri: WEBVIEW_URL });
        expect(result.current.isRedirecting).toBe(true);

        // useEffect runs and pushes the event to the bridge immediately
        expect(mockBridge.pushEvent).toHaveBeenCalledWith({
            type: 'OnNavigate',
            success: true,
            data: {
                path: '/auth/login?code=123',
                replace: false,
            },
        });

        // calls setParams to clear url
        expect(mockNavigation.setParams).toHaveBeenCalledWith({ url: undefined, error: undefined });
    });

    it('should push OnNavigate event on warm start when isWebViewLoaded is true', () => {
        // Start without deep link
        const route = { params: {} } as any;
        const { result, rerender } = renderHook(({ r }) => useWebViewDeepLink(r, { bridge: mockBridge }), {
            initialProps: { r: route },
        });

        expect(result.current.source).toEqual({ uri: WEBVIEW_URL });

        // Simulate WebView load completed
        act(() => {
            result.current.handleWebViewLoad();
        });
        expect(result.current.isWebViewLoaded).toBe(true);
        jest.clearAllMocks();

        // Receive warm start deep link
        const newRoute = { params: { url: 'https://dou.chatic.io/auth/login?code=456' } } as any;

        // Rerender with new route params
        rerender({ r: newRoute });

        // Event should be pushed to the bridge
        expect(mockBridge.pushEvent).toHaveBeenCalledWith({
            type: 'OnNavigate',
            success: true,
            data: {
                path: '/auth/login?code=456',
                replace: false,
            },
        });
        expect(result.current.source).toEqual({ uri: WEBVIEW_URL });
        expect(mockNavigation.setParams).toHaveBeenCalledWith({ url: undefined, error: undefined });
    });

    it('should push OnNavigate event when the same deep link is triggered again after route params are cleared', () => {
        const route = { params: { url: 'https://dou.chatic.io/auth/login?code=456' } } as any;
        const { result, rerender } = renderHook(({ r }) => useWebViewDeepLink(r, { bridge: mockBridge }), {
            initialProps: { r: route },
        });

        act(() => {
            result.current.handleWebViewLoad();
        });
        expect(mockBridge.pushEvent).toHaveBeenCalledTimes(1);
        jest.clearAllMocks();

        // Simulate params cleared
        rerender({ r: { params: { url: undefined } } as any });
        jest.clearAllMocks();

        // Trigger the same URL again
        const sameRoute = { params: { url: 'https://dou.chatic.io/auth/login?code=456' } } as any;
        rerender({ r: sameRoute });

        expect(mockBridge.pushEvent).toHaveBeenCalledWith({
            type: 'OnNavigate',
            success: true,
            data: {
                path: '/auth/login?code=456',
                replace: false,
            },
        });
    });

    it('should read nested navigator params and push OnNavigate event', () => {
        const route = { params: {} } as any;
        const { result, rerender } = renderHook(({ r }) => useWebViewDeepLink(r, { bridge: mockBridge }), {
            initialProps: { r: route },
        });

        act(() => {
            result.current.handleWebViewLoad();
        });
        jest.clearAllMocks();

        const newRoute = {
            params: {
                initial: true,
                screen: 'Main',
                params: {
                    url: 'https://dou.chatic.io/auth/login?code=789',
                },
                state: undefined,
                path: undefined,
            },
        } as any;

        rerender({ r: newRoute });

        expect(mockBridge.pushEvent).toHaveBeenCalledWith({
            type: 'OnNavigate',
            success: true,
            data: {
                path: '/auth/login?code=789',
                replace: false,
            },
        });
        expect(mockNavigation.setParams).toHaveBeenCalledWith({
            params: { url: undefined, error: undefined },
        });
    });

    it('should queue warm start URL if WebView is not loaded (buffered by bridge)', () => {
        // Start without deep link
        const route = { params: {} } as any;
        const { result, rerender } = renderHook(({ r }) => useWebViewDeepLink(r, { bridge: mockBridge }), {
            initialProps: { r: route },
        });

        expect(result.current.source).toEqual({ uri: WEBVIEW_URL });
        expect(result.current.isWebViewLoaded).toBe(false);
        jest.clearAllMocks();

        // Receive warm start deep link before WebView is loaded
        const newRoute = { params: { url: 'https://dou.chatic.io/auth/login?code=456' } } as any;
        rerender({ r: newRoute });

        // Source should not change, but route params should be cleared
        expect(result.current.source).toEqual({ uri: WEBVIEW_URL });
        expect(mockNavigation.setParams).toHaveBeenCalledWith({ url: undefined, error: undefined });

        // Pushes the event to the bridge event buffer immediately
        expect(mockBridge.pushEvent).toHaveBeenCalledTimes(1);
        expect(mockBridge.pushEvent).toHaveBeenCalledWith({
            type: 'OnNavigate',
            success: true,
            data: {
                path: '/auth/login?code=456',
                replace: false,
            },
        });

        jest.clearAllMocks();

        act(() => {
            result.current.handleWebViewLoad();
        });

        // Event should not be pushed again on load (no duplication)
        expect(mockBridge.pushEvent).not.toHaveBeenCalled();
    });
});
