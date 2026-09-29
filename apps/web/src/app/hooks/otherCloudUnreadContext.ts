import { createContext, useContext } from 'react';

import type { OtherCloudUnread } from './useOtherCloudUnread';

export type OtherCloudUnreadValue = OtherCloudUnread;

/**
 * The inactive clouds' unread, observed once for the whole app.
 *
 * Separate from {@link ActiveCloudData} because the two answer different surfaces: the active cloud
 * feeds per-channel and per-place counts, while this is one number per cloud for the cloud sheet, the
 * switcher dot and the app-icon badge. Both providers are mounted together in `AppRuntime`.
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
