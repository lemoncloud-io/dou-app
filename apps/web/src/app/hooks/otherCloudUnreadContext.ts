import { createContext, useContext } from 'react';

import type { OtherCloudUnread } from './useOtherCloudUnread';

export type OtherCloudUnreadValue = OtherCloudUnread;

/**
 * The inactive clouds' unread, read once for the whole app.
 *
 * Separate from {@link ActiveCloudData} because the two are different kinds of reading: the active
 * cloud is OBSERVED (live cache subscriptions), while this is a one-shot cross-cloud cache scan that
 * only re-runs when someone asks. Both providers are mounted together in `AppRuntime`.
 */
export const OtherCloudUnreadContext = createContext<OtherCloudUnread | null>(null);

/** See {@link useActiveCloudData} for why a missing provider throws rather than falling back. */
export const useOtherCloudUnreadContext = (): OtherCloudUnread => {
    const value = useContext(OtherCloudUnreadContext);
    if (!value) {
        throw new Error('[useOtherCloudUnread] OtherCloudUnreadProvider is missing above this component.');
    }
    return value;
};
