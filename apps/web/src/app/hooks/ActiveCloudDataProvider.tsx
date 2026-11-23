import { useMemo, type ReactNode } from 'react';

import { ActiveCloudDataContext, type ActiveCloudData } from './activeCloudDataContext';
import { useActiveCloudChannelsSource } from './useActiveCloudChannels';
import { useChannelUnreads } from './useChannelUnreads';
import { useMyJoins } from './useMyJoins';

export const ActiveCloudDataProvider = ({ children }: { children: ReactNode }) => {
    const { channels, isLoaded } = useActiveCloudChannelsSource();
    const myJoins = useMyJoins(channels, { sync: false });
    const unreads = useChannelUnreads(channels, myJoins);

    const value = useMemo<ActiveCloudData>(
        () => ({ channels, isLoaded, myJoins, unreads }),
        [channels, isLoaded, myJoins, unreads]
    );

    return <ActiveCloudDataContext.Provider value={value}>{children}</ActiveCloudDataContext.Provider>;
};
