import { setSelectedSiteId } from '@chatic/session';

/**
 * Forgets which place of the active cloud is selected, and does nothing else: no `auth.switch`, no
 * switch token. The socket session stays where it is.
 *
 * For one situation — the place that was selected is gone and the cloud has no place left (the user
 * left the last one). There is no place to switch to, and keeping the old id would leave the app
 * showing a place the user is no longer in. Every place-scoped read keys off the selection, so with
 * it empty they stand down, and the next place that appears in the list is auto-selected as usual.
 *
 * Switching places is `useSiteSwitch`; this is not a way to leave one.
 */
export const clearSiteSelection = (): void => {
    setSelectedSiteId(null);
};
