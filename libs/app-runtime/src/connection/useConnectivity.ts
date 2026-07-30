import { useSyncExternalStore } from 'react';

import { useRuntimeSocketState } from '../runtime/useRuntimeSocketState';
import type { SocketState } from '../socket';

/** What the app should TELL THE USER about the connection. `online` means "nothing to warn about". */
export type ConnectivityStatus = 'online' | 'reconnecting' | 'offline';

/** Inputs of the derivation, split out so the truth table is testable without a socket manager. */
export interface ConnectivitySignals extends SocketState {
    /** `navigator.onLine` — see the asymmetry documented on `deriveConnectivity`. */
    isBrowserOnline: boolean;
}

/**
 * Composes the browser's network signal with the socket transport state.
 *
 * `navigator.onLine` is asymmetric and the derivation encodes that asymmetry:
 * - **reliable negative** — `false` proves there is no network, so it outranks every socket
 *   state (a dropped link can sit in `connected` until the next frame fails).
 * - **unreliable positive** — `true` only proves a network interface is up, never that the
 *   server is reachable, so it never promotes us to `online` on its own. Only a socket that is
 *   connected AND verified is proof of reachability.
 *
 * The consequence, and the reason this exists: with the browser online, a `closed` socket reads
 * as **reconnecting, not offline**. The network is fine — our socket or the server is down — so
 * claiming "you are offline" sends the user to check their wifi for a fault that is ours. It is
 * also what is literally about to happen: the SDK auto-redials from `closed`.
 */
export const deriveConnectivity = ({
    isBrowserOnline,
    state,
    isConnected,
    isVerified,
}: ConnectivitySignals): ConnectivityStatus => {
    if (!isBrowserOnline) return 'offline';
    if (isConnected && isVerified) return 'online';
    // Pre-connect boot: nothing has been attempted yet, so there is nothing to warn about.
    if (state === 'idle') return 'online';
    return 'reconnecting';
};

const subscribeBrowserOnline = (onStoreChange: () => void): (() => void) => {
    window.addEventListener('online', onStoreChange);
    window.addEventListener('offline', onStoreChange);
    return () => {
        window.removeEventListener('online', onStoreChange);
        window.removeEventListener('offline', onStoreChange);
    };
};

// Outside a DOM there is no signal to read; default to the unreliable positive rather than
// asserting an offline we cannot observe.
const getBrowserOnline = (): boolean => (typeof navigator === 'undefined' ? true : navigator.onLine);

/** Live connection status for the app shell. See `deriveConnectivity` for the semantics. */
export const useConnectivity = (): ConnectivityStatus => {
    const isBrowserOnline = useSyncExternalStore(subscribeBrowserOnline, getBrowserOnline, getBrowserOnline);
    const socketState = useRuntimeSocketState();

    return deriveConnectivity({ ...socketState, isBrowserOnline });
};
