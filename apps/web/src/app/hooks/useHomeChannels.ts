import { useMemo } from 'react';

import { isInPlaceList, type DomainChannel } from '@chatic/runtime';

import { useActiveCloudData } from './activeCloudDataContext';

export interface HomeChannelsResult {
    channels: DomainChannel[];
    isLoading: boolean;
}

export const useHomeChannels = (sid: string | null): HomeChannelsResult => {
    const { channels, isLoaded } = useActiveCloudData();

    const scoped = useMemo(() => (sid ? channels.filter(channel => isInPlaceList(channel, sid)) : []), [channels, sid]);

    return { channels: scoped, isLoading: !!sid && !isLoaded };
};
