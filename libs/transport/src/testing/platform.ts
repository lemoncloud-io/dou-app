import type { TransportPlatformPorts } from '../platform';

/**
 * Transport ports for a test, behaving like the jsdom page the tests run in: `navigator.onLine` and
 * the window's `online`/`offline` events, the shell global and the user agent off `window`. So a test
 * that drives `navigator.onLine` keeps driving the link verdict. No socket: a case that reaches the
 * socket factory has to say what it opens. Override any port a case is about.
 */
export const fakeTransportPorts = (overrides: Partial<TransportPlatformPorts> = {}): TransportPlatformPorts => ({
    online: {
        read: () => navigator.onLine,
        subscribe: listener => {
            window.addEventListener('online', listener);
            window.addEventListener('offline', listener);
            return () => {
                window.removeEventListener('online', listener);
                window.removeEventListener('offline', listener);
            };
        },
    },
    device: () => ({
        appPlatform: (window as unknown as { CHATIC_APP_PLATFORM?: string }).CHATIC_APP_PLATFORM,
        userAgent: navigator.userAgent,
    }),
    createSocket: () => {
        throw new Error('[test] this case opens a socket but gave no createSocket port');
    },
    ...overrides,
});
