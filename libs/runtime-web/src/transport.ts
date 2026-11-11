import type { RuntimePorts } from '@chatic/runtime-core';

type TransportPorts = RuntimePorts['transport'];

/** The globals the mobile and desktop shells inject before the page's own script runs. */
type ShellGlobals = { CHATIC_APP_PLATFORM?: string };

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

/**
 * The shell-injected platform and the user agent, read straight off `window` rather than through
 * device-utils' `deviceInfoStore`: that store is filled by a React hook on mount, and the first socket
 * can be created before it runs. The shells inject these globals before the page's own script.
 */
const device: TransportPorts['device'] = () => {
    if (typeof window === 'undefined') return {};
    return {
        appPlatform: (window as unknown as ShellGlobals).CHATIC_APP_PLATFORM,
        userAgent: typeof navigator === 'undefined' ? undefined : navigator.userAgent,
    };
};

/**
 * The page's own `WebSocket` — what the sockets SDK opens when it is given no factory. The browser
 * sends the handshake's User-Agent by itself, so there is nothing to add.
 */
const createSocket: TransportPorts['createSocket'] = ({ url, protocols }) => new WebSocket(url, protocols);

/** The transport's ports for a web page: the browser, the shell's globals and the page's `WebSocket`. */
export const webTransportPorts = (): TransportPorts => ({ online, device, createSocket });
