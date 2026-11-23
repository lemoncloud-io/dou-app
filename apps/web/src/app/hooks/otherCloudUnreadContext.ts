import { createContext, useContext } from 'react';

import type { OtherCloudUnread } from './useOtherCloudUnread';

export type OtherCloudUnreadValue = OtherCloudUnread;

export const OtherCloudUnreadContext = createContext<OtherCloudUnread | null>(null);

export const useOtherCloudUnreadContext = (): OtherCloudUnread => {
    const value = useContext(OtherCloudUnreadContext);
    if (!value) {
        throw new Error('[useOtherCloudUnread] OtherCloudUnreadProvider is missing above this component.');
    }
    return value;
};
