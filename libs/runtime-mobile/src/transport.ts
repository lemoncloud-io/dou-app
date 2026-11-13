import NetInfo from '@react-native-community/netinfo';
import { Platform } from 'react-native';

import type { NetInfoState } from '@react-native-community/netinfo';
import type { RuntimePorts } from '@chatic/runtime-core';

type TransportPorts = RuntimePorts['transport'];

/** The part of NetInfo the online signal reads. */
export type NetInfoSource = Pick<typeof NetInfo, 'addEventListener'>;

/**
 * NetInfo's connection state, read synchronously.
 *
 * The port's `read()` is synchronous and NetInfo only answers asynchronously, so the signal keeps the
 * last state NetInfo reported. NetInfo reports the current state soon after the listener is added,
 * and every change after that.
 *
 * - Until the first report, and whenever NetInfo cannot tell (`isConnected: null`), it answers
 *   online — the same unreliable positive a page gives with no `navigator`. The link verdict already
 *   treats a positive as weak evidence; a negative it could not observe would hold sockets down.
 * - `isConnected`, not `isInternetReachable`: it is what a page's `navigator.onLine` means (an
 *   interface is up). Reachability is the link verdict's question, answered from the sockets.
 *
 * It adds one NetInfo listener and never removes it; `processOnlineSignal()` below is the one the
 * runtime uses, so the process holds a single listener however often the runtime is built.
 */
export const nativeOnlineSignal = (netInfo: NetInfoSource): TransportPorts['online'] => {
    let online = true;
    const listeners = new Set<() => void>();

    netInfo.addEventListener((state: NetInfoState) => {
        const next = state.isConnected !== false;
        if (next === online) return;
        online = next;
        [...listeners].forEach(listener => listener());
    });

    return {
        read: () => online,
        subscribe: listener => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
    };
};

let processSignal: TransportPorts['online'] | null = null;

/**
 * The process's online signal over NetInfo, made on first use and kept. A second build of the runtime
 * (Fast Refresh re-running the entry) reuses it instead of stacking another NetInfo listener.
 */
export const processOnlineSignal = (): TransportPorts['online'] => (processSignal ??= nativeOnlineSignal(NetInfo));

/** The React Native `WebSocket` constructor, with the handshake headers its options take. */
export type NativeWebSocketConstructor = new (
    url: string,
    protocols?: string | string[],
    options?: { headers: Record<string, string> }
) => ReturnType<TransportPorts['createSocket']>;

/**
 * Opens a socket with React Native's `WebSocket`, sending `userAgent` as the handshake's `User-Agent`.
 *
 * A page's `WebSocket` sends the browser's User-Agent by itself; React Native's sends none (iOS) or
 * its HTTP client's own (Android). The server checks the handshake's User-Agent against the one the
 * socket signature was computed over — `device().userAgent` — so the header carries exactly that
 * string, and a socket opened without it is refused once its token is refreshed.
 *
 * The global `WebSocket` is looked up when a socket is opened, not when the factory is made, so the
 * one in place at that moment is used. A test passes its own `Socket`.
 */
export const nativeSocketFactory =
    (userAgent: string, Socket?: NativeWebSocketConstructor): TransportPorts['createSocket'] =>
    ({ url, protocols }) => {
        const Constructor: NativeWebSocketConstructor = Socket ?? WebSocket;
        return new Constructor(url, protocols, { headers: { 'User-Agent': userAgent } });
    };

/** What the app tells the transport about the device. */
export interface NativeDeviceOptions {
    /**
     * The user agent the app reports for this device: the input for the device's platform and label,
     * and the string the socket signature is computed over. The app builds it (the system user agent
     * plus the app's own suffix) before it builds the runtime, because reading it is asynchronous and
     * the transport reads it synchronously.
     */
    userAgent: string;
}

/**
 * The transport's ports for React Native: NetInfo, the OS and the app's user agent, and React
 * Native's `WebSocket` with the User-Agent header.
 *
 * `appPlatform` is `Platform.OS` — `ios` or `android`, the same value the phone shell injects into
 * the page as `CHATIC_APP_PLATFORM`, so the device introduces itself the same way from either side.
 */
export const nativeTransportPorts = (options: NativeDeviceOptions): TransportPorts => ({
    online: processOnlineSignal(),
    device: () => ({ appPlatform: Platform.OS, userAgent: options.userAgent }),
    createSocket: nativeSocketFactory(options.userAgent),
});
