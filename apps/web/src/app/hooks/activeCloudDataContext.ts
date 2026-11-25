import { createContext, useContext } from 'react';

import type { DomainChannel, DomainJoin } from '@chatic/runtime-react';

import type { ChannelUnreads } from './useChannelUnreads';

export interface ActiveCloudData {
    channels: DomainChannel[];
    isLoaded: boolean;
    myJoins: Map<string, DomainJoin>;
    unreads: ChannelUnreads;
}

export const ActiveCloudDataContext = createContext<ActiveCloudData | null>(null);

export const useActiveCloudData = (): ActiveCloudData => {
    const value = useContext(ActiveCloudDataContext);
    if (!value) {
        throw new Error('[useActiveCloudData] ActiveCloudDataProvider is missing above this component.');
    }
    return value;
};
