import { useMemo } from 'react';

import type { DomainChannel } from '@chatic/runtime-react';

import { useActiveCloudData } from '../../../hooks';
import { isInCloudSelfSection } from '../lib';

export interface CloudSelfChannelsResult {
    channels: DomainChannel[];
    isLoading: boolean;
}

export const useCloudSelfChannels = (): CloudSelfChannelsResult => {
    const { channels, isLoaded } = useActiveCloudData();

    const scoped = useMemo(() => channels.filter(isInCloudSelfSection), [channels]);

    return { channels: scoped, isLoading: !isLoaded };
};
