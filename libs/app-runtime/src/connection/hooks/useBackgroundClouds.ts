import { useEffect } from 'react';

import { backgroundClouds } from '../../socket/backgroundClouds';

/**
 * Hands the runtime the clouds this account belongs to, so each of them keeps a socket session while
 * the user is looking at another one. The app owns membership — its owned catalog and invited-cloud
 * cache — and the runtime owns the policy: it leaves out relay and the committed cloud, orders the
 * rest by recent use and applies the cap (`MAX_BACKGROUND_CLOUDS`).
 *
 * Mount it once, inside the connection host. Unmounting it withdraws the list, which tears every
 * background slot down — the committed cloud's slot is unaffected.
 *
 * The list is compared by content, so handing a fresh array on every render costs nothing.
 */
export const useBackgroundClouds = (cids: readonly string[]): void => {
    // Keyed on the content: the app's list is a new array whenever its queries re-render.
    const key = cids.join('\n');

    useEffect(() => {
        backgroundClouds.setJoined(key ? key.split('\n') : []);
    }, [key]);

    // Unmount only — a changed list is handled above without passing through an empty one.
    useEffect(() => () => backgroundClouds.setJoined([]), []);
};
