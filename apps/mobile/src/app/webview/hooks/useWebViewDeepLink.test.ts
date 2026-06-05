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
    let mockWebViewRef: any;

    beforeEach(() => {
        jest.clearAllMocks();
        mockNavigation = {
            setParams: jest.fn(),
        };
        (useNavigation as jest.Mock).mockReturnValue(mockNavigation);
        mockWebViewRef = { current: {} };
    });

    it('should initialize source with WEBVIEW_URL if no url param is provided', () => {
        const route = { params: {} } as any;
        const { result } = renderHook(() => useWebViewDeepLink(mockWebViewRef, route));

        expect(result.current.source).toEqual({ uri: WEBVIEW_URL });
    });

    it('should initialize source with the deep link URL on cold start and clear params', () => {
        const route = { params: { url: 'https://dou.chatic.io/auth/login?code=123' } } as any;
        const { result, rerender } = renderHook(({ r }) => useWebViewDeepLink(mockWebViewRef, r), {
            initialProps: { r: route },
        });

        // On mount (cold start), source should be the target URL
        expect(result.current.source).toEqual({ uri: `${WEBVIEW_URL}auth/login?code=123` });

        // useEffect runs and calls setParams to clear url
        expect(mockNavigation.setParams).toHaveBeenCalledWith({ url: undefined, error: undefined });

        // If route params are updated to undefined (cleared), source should not change
        const updatedRoute = { params: { url: undefined } } as any;
        rerender({ r: updatedRoute });
        expect(result.current.source).toEqual({ uri: `${WEBVIEW_URL}auth/login?code=123` });
    });

    it('should update source with finalUrl on warm start when isWebViewLoaded is true', () => {
        // Start without deep link
        const route = { params: {} } as any;
        const { result, rerender } = renderHook(({ r }) => useWebViewDeepLink(mockWebViewRef, r), {
            initialProps: { r: route },
        });

        expect(result.current.source).toEqual({ uri: WEBVIEW_URL });

        // Simulate WebView load completed
        act(() => {
            result.current.handleWebViewLoad();
        });
        expect(result.current.isWebViewLoaded).toBe(true);

        // Receive warm start deep link
        const newRoute = { params: { url: 'https://dou.chatic.io/auth/login?code=456' } } as any;

        // Rerender with new route params
        rerender({ r: newRoute });

        // Source should be updated with timestamped URL
        expect(result.current.source.uri).toContain(`${WEBVIEW_URL}auth/login?code=456`);
        expect(result.current.source.uri).toContain('_t=');
        expect(mockNavigation.setParams).toHaveBeenCalledWith({ url: undefined, error: undefined });
    });

    it('should not update source on warm start if isWebViewLoaded is false', () => {
        // Start without deep link
        const route = { params: {} } as any;
        const { result, rerender } = renderHook(({ r }) => useWebViewDeepLink(mockWebViewRef, r), {
            initialProps: { r: route },
        });

        expect(result.current.source).toEqual({ uri: WEBVIEW_URL });
        expect(result.current.isWebViewLoaded).toBe(false);

        // Receive warm start deep link (but webview not loaded yet)
        const newRoute = { params: { url: 'https://dou.chatic.io/auth/login?code=456' } } as any;
        rerender({ r: newRoute });

        // Source should NOT be updated, and setParams should NOT be called
        expect(result.current.source).toEqual({ uri: WEBVIEW_URL });
        expect(mockNavigation.setParams).not.toHaveBeenCalled();
    });
});
