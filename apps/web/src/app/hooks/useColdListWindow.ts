import { useEffect, useState } from 'react';

/**
 * How long an empty list may keep reading as "still arriving" before the screen has to say
 * something. It is a backstop, not the normal path: rows landing in the cache (or, for channels, the
 * first delta answering) closes the wait long before this, usually in well under a second.
 *
 * 15s is chosen against the slowest thing it has to cover — a first-ever cloud switch on mobile
 * data, which is two HTTP token exchanges, a socket reboot, an auth handshake and only then the list
 * round trip. Shorter and a slow-but-working switch would flash the empty state on the way in, which
 * is the bug this whole gate exists to remove.
 */
export const COLD_LIST_WINDOW_MS = 15_000;

/**
 * A wait that ends.
 *
 * The lists home renders are observed from a local cache that answers an unvisited scope instantly,
 * with nothing — so an empty list is ambiguous between "this cloud holds none" and "nobody has
 * asked yet", and the screens hold their loading state while it is. Something has to end that hold
 * even when no answer ever arrives: a device that cannot reach the server never fetches, so without
 * a bound the skeleton would simply never stop. A wrong-but-terminal screen beats a spinner that
 * runs forever, and the user can still act on it.
 *
 * The window restarts whenever `scopeKey` changes, so a cloud switch gets the full wait again rather
 * than inheriting the previous cloud's expired one. The cid half of that key is pre-applied at the
 * very start of a switch, which is why the window covers the switch from the tap rather than from
 * its commit.
 */
export const useColdListWindowElapsed = (scopeKey: string, windowMs: number = COLD_LIST_WINDOW_MS): boolean => {
    const [hasElapsed, setHasElapsed] = useState(false);

    useEffect(() => {
        setHasElapsed(false);
        const timer = setTimeout(() => setHasElapsed(true), windowMs);
        return () => clearTimeout(timer);
    }, [scopeKey, windowMs]);

    return hasElapsed;
};
