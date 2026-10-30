import { useSyncExternalStore } from 'react';

import { useRuntimeSocketState } from './useRuntimeSocketState';
import { useVerifiedClouds } from './useVerifiedClouds';
import { isLinkDown, readBrowserOnline } from '@chatic/transport';
import type { LinkSignals, SocketState } from '@chatic/transport';

/** What the app should TELL THE USER about the connection. `online` means "nothing to warn about". */
export type ConnectivityStatus = 'online' | 'reconnecting' | 'offline';

/** Inputs of the derivation, split out so the truth table is testable without a socket manager. */
export interface ConnectivitySignals extends SocketState, LinkSignals {}

/**
 * Composes the browser's network signal with the socket transport state.
 *
 * `navigator.onLine` is asymmetric and the derivation encodes that asymmetry:
 * - **strong negative** — `false` means there is no network, so it outranks the active socket's
 *   transport state (a dropped link can sit in `connected` until the next frame fails). It is not
 *   proof, though: Chromium can latch it at `false` while requests succeed, so a verified socket on
 *   any slot overrules it. `isLinkDown` owns that rule and says why.
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
    hasVerifiedSocket,
    state,
    isConnected,
    isVerified,
}: ConnectivitySignals): ConnectivityStatus => {
    if (isLinkDown({ isBrowserOnline, hasVerifiedSocket })) return 'offline';
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

/** Live connection status for the app shell. See `deriveConnectivity` for the semantics. */
export const useConnectivity = (): ConnectivityStatus => {
    const isBrowserOnline = useSyncExternalStore(subscribeBrowserOnline, readBrowserOnline, readBrowserOnline);
    const socketState = useRuntimeSocketState();
    const hasVerifiedSocket = useVerifiedClouds().length > 0;

    return deriveConnectivity({ ...socketState, isBrowserOnline, hasVerifiedSocket });
};
