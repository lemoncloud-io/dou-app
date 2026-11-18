import { hostProfile } from '@chatic/bridges';

import type { RuntimePorts } from '@chatic/runtime-core';

type TransportPorts = RuntimePorts['transport'];

/**
 * `navigator.onLine` and the page's `online`/`offline` events. Outside a page there is nothing to
 * read, so it answers the unreliable positive rather than asserting an offline it cannot observe —
 * the link verdict already treats a positive as weak evidence.
 */
const online: TransportPorts['online'] = {
    read: () => (typeof navigator === 'undefined' ? true : navigator.onLine),
    subscribe: listener => {
        if (typeof window === 'undefined') return () => undefined;
        window.addEventListener('online', listener);
        window.addEventListener('offline', listener);
        return () => {
            window.removeEventListener('online', listener);
            window.removeEventListener('offline', listener);
        };
    },
};

/** What the transport's ports are handed rather than read. */
export interface WebTransportOptions {
    /**
     * The shell-injected platform, asked each time a socket is about to open. By default the host
     * profile's `CHATIC_APP_PLATFORM` — not `apps/web`'s device store: that store is filled by a React
     * hook on mount, and the first socket can be created before it runs.
     */
    appPlatform?: () => string | undefined;
}

const profilePlatform = (): string | undefined => hostProfile().globals.CHATIC_APP_PLATFORM;

/** The shell-injected platform and the page's user agent. Outside a page there is nothing to read. */
const deviceReader =
    (appPlatform: () => string | undefined): TransportPorts['device'] =>
    () => {
        if (typeof window === 'undefined') return {};
        return {
            appPlatform: appPlatform(),
            userAgent: typeof navigator === 'undefined' ? undefined : navigator.userAgent,
        };
    };

/**
 * The page's own `WebSocket` — what the sockets SDK opens when it is given no factory. The browser
 * sends the handshake's User-Agent by itself, so there is nothing to add.
 */
const createSocket: TransportPorts['createSocket'] = ({ url, protocols }) => new WebSocket(url, protocols);

/**
 * The transport's ports for a web page (`transport.browser`): the browser's network state, the shell's
 * platform and the page's `WebSocket`.
 */
export const webTransportPorts = ({ appPlatform = profilePlatform }: WebTransportOptions = {}): TransportPorts => ({
    online,
    device: deviceReader(appPlatform),
    createSocket,
});
