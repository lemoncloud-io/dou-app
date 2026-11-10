import type { SocketFactoryContext, SocketLike } from '@lemoncloud/chatic-sockets-lib';

/** Whether the platform believes the network is reachable, and when that belief changes. */
export interface OnlineSignal {
    /** The platform's answer now. In a page, `navigator.onLine`. */
    read(): boolean;
    /** Calls `listener` whenever the answer may have changed. Returns the unsubscribe. */
    subscribe(listener: () => void): () => void;
}

/** What the device says about itself, read when a socket introduces the device on `device.save`. */
export interface DeviceEnvironment {
    /** `ios` · `android` from the mobile shell, `desktop` from Electron, absent in a browser. */
    appPlatform?: string;
    /**
     * The user agent the platform reports: the input for the device's platform and label, and also the
     * user agent auth's socket signature is computed over. The server checks that signature against the
     * handshake's `User-Agent`, so `createSocket` has to send exactly this string.
     */
    userAgent?: string;
}

/**
 * What the sockets and the link verdict take from the platform they run on.
 *
 * Each one is a thing this package cannot know without knowing where it runs: a page reads
 * `navigator` and the shell's globals and opens a `WebSocket`; a native process asks the OS and opens
 * its socket its own way (with the handshake headers the server checks). The adapter for each
 * platform fills them; this package decides what to do with the answers.
 *
 * - `online` — the network signal the link verdict and the offline skips read.
 * - `device` — what the device says about itself; how that becomes a platform and a label stays here.
 * - `createSocket` — opens one WebSocket for a slot, handed to the sockets SDK as its `socketFactory`.
 *   Its handshake has to send `device().userAgent` as the `User-Agent`, unchanged: the socket
 *   signature is computed over that string.
 */
export interface TransportPlatformPorts {
    online: OnlineSignal;
    device(): DeviceEnvironment;
    createSocket(context: SocketFactoryContext): SocketLike;
}

export interface ITransportPlatform {
    /**
     * Points the package at its platform. Called by the runtime's assembly, before the first socket
     * or link read. Assignment, so a second call (HMR) replaces rather than accumulates.
     */
    configure(ports: TransportPlatformPorts): void;
    /** The ports as configured. Throws until `configure` has run: there is no platform to fall back on. */
    ports(): TransportPlatformPorts;
}

class TransportPlatform implements ITransportPlatform {
    private configured: TransportPlatformPorts | null = null;

    configure(ports: TransportPlatformPorts): void {
        this.configured = ports;
    }

    ports(): TransportPlatformPorts {
        if (!this.configured) {
            throw new Error(
                '[transport] the platform ports were used before any were configured — the entry point has to ' +
                    'pass `transport` to initAppRuntime() before a socket is opened or the link is read.'
            );
        }
        return this.configured;
    }
}

/**
 * The process-wide platform. A default would have to be one platform's — a page's `navigator` and
 * `WebSocket` — and in a native process those either do not exist or answer wrongly (React Native's
 * `WebSocket` sends no User-Agent, which the server checks a refreshed token against), so an unwired
 * runtime fails at the first use instead.
 */
export const transportPlatform: ITransportPlatform = new TransportPlatform();
