import type { RuntimePorts } from '@chatic/runtime-core';

type AuthPorts = RuntimePorts['auth'];

/** The part of the page's `location` these ports use. */
export type PageLocation = Pick<Location, 'search' | 'origin' | 'replace'>;

/**
 * The auth's ports for a web page: its address, and the navigation home at the end of a session.
 *
 * Ending a session replaces the document with the home page — `replace`, not `assign`, so the history
 * keeps no signed-in entry to go back to — and the next document's boot reads the `logout=1` it
 * carries. `location` is the page's own; a test hands in a stand-in, since a page cannot observe its
 * own navigation.
 */
export const webAuthPorts = (location: PageLocation = window.location): AuthPorts => ({
    currentSearch: () => location.search,
    leaveToHome: params => {
        const target = new URL('/', location.origin);
        target.search = params.toString();
        location.replace(target.toString());
    },
});
