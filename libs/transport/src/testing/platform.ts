import type { TransportPlatformPorts } from '../platform';

interface TestPage {
    navigator: { onLine: boolean; userAgent: string };
    addEventListener(type: 'online' | 'offline', listener: () => void): void;
    removeEventListener(type: 'online' | 'offline', listener: () => void): void;
    CHATIC_APP_PLATFORM?: string;
}

const page = (): TestPage => globalThis as unknown as TestPage;

export const fakeTransportPorts = (overrides: Partial<TransportPlatformPorts> = {}): TransportPlatformPorts => ({
    online: {
        read: () => page().navigator.onLine,
        subscribe: listener => {
            page().addEventListener('online', listener);
            page().addEventListener('offline', listener);
            return () => {
                page().removeEventListener('online', listener);
                page().removeEventListener('offline', listener);
            };
        },
    },
    device: () => ({ appPlatform: page().CHATIC_APP_PLATFORM, userAgent: page().navigator.userAgent }),
    createSocket: () => {
        throw new Error('[test] this case opens a socket but gave no createSocket port');
    },
    ...overrides,
});
