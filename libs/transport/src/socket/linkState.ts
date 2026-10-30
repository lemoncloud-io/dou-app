import { getSocketManager } from './runtime';

/** The two observations the link verdict is made from. */
export interface LinkSignals {
    /** `navigator.onLine`. */
    isBrowserOnline: boolean;
    /** Whether any bound socket slot — relay or cloud — is connected AND verified. */
    hasVerifiedSocket: boolean;
}

/**
 * "Is the network link known to be down?" — the answer the runtime's offline skips read, except
 * the relay terminal-expiry decision, which ends the session and so keeps the raw flag.
 *
 * `navigator.onLine === false` is strong evidence of a dead link, but not proof: Chromium can latch it
 * at `false` for the life of the process while requests keep succeeding. Observed on the macOS desktop
 * shell when it started at login before Wi-Fi had associated — main's `net.isOnline()` and the
 * renderer's `navigator.onLine` both stayed `false` while a same-origin fetch returned 200, and only a
 * full quit cleared it. Read on its own, that latched value parked the app behind a permanent
 * "no network" banner and stopped every credential renewal that skips while offline.
 *
 * So a verified socket outranks it: a socket that completed its handshake and is still connected is
 * positive proof that packets are moving. The cost is the opposite edge — when the link really drops,
 * a socket can sit `connected` until its next frame fails, and for that short window this reports the
 * link as up. That delay is bounded by the socket noticing; the latched `false` is not bounded at all.
 */
export const isLinkDown = ({ isBrowserOnline, hasVerifiedSocket }: LinkSignals): boolean =>
    !isBrowserOnline && !hasVerifiedSocket;

// Outside a DOM there is no signal to read; default to the unreliable positive rather than asserting
// an offline we cannot observe.
export const readBrowserOnline = (): boolean => (typeof navigator === 'undefined' ? true : navigator.onLine);

export const hasAnyVerifiedSocket = (): boolean => {
    const manager = getSocketManager();
    return manager.getSlotKeys().some(key => manager.isSlotVerified(key));
};

/**
 * Live read of {@link isLinkDown} for imperative guards, taken at decision time rather than captured.
 * The sockets are only consulted when the browser already claims to be offline.
 */
export const isLinkKnownDown = (): boolean =>
    !readBrowserOnline() && isLinkDown({ isBrowserOnline: false, hasVerifiedSocket: hasAnyVerifiedSocket() });
