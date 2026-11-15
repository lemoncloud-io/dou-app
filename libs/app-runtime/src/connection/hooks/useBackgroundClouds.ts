import { useEffect } from 'react';

import { runtimeConnection } from '../connectionCommands';

/**
 * Hands the runtime the clouds this account belongs to, so each of them keeps a socket session while
 * the user is looking at another one. The app owns membership — its owned catalog and invited-cloud
 * cache — and the runtime owns the policy: it leaves out relay and the committed cloud, orders the
 * rest by recent use and applies the cap — the engine's `setBackgroundClouds`.
 *
 * Mount it once, inside the connection host. Unmounting it withdraws the list, which tears every
 * background slot down — the committed cloud's slot is unaffected.
 *
 * `null` means the app does not know the membership yet, and hands nothing over: the runtime keeps
 * the list it has. That is not the same as an empty list, which withdraws every background cloud. The
 * difference matters where the runtime outlives the page — a phone shell that runs the session keeps
 * its sockets across a page reload, and a reloaded page that announced `[]` while its first reads were
 * still in flight would tear down every background socket only to open them again a moment later.
 *
 * The list is compared by content, so handing a fresh array on every render costs nothing.
 */
export const useBackgroundClouds = (cids: readonly string[] | null): void => {
    // Keyed on the content: the app's list is a new array whenever its queries re-render.
    const key = cids === null ? null : cids.join('\n');

    useEffect(() => {
        if (key === null) return;
        runtimeConnection().setBackgroundClouds(key ? key.split('\n') : []);
    }, [key]);

    // Unmount only — a changed list is handled above without passing through an empty one.
    useEffect(() => () => runtimeConnection().setBackgroundClouds([]), []);
};
