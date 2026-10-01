import { useMemo } from 'react';

import type { DomainChannel } from '@chatic/data';

import { useActiveCloudData } from '../../../hooks';
import { isInCloudSelfSection } from '../lib';

export interface CloudSelfChannelsResult {
    channels: DomainChannel[];
    isLoading: boolean;
}

/**
 * The notes-to-self room of the connected cloud, read cloud-wide for home's section of its own.
 *
 * It belongs to the account rather than to a place, so a place-scoped read would show it under
 * whichever place it was tagged with and in none of the others.
 *
 * Reads the section rule through `isInCloudSelfSection` rather than testing a field here, so "what
 * the section holds" stays one rule. Opens no observer of its own — it is a slice of the observation
 * the home list already holds.
 */
export const useCloudSelfChannels = (): CloudSelfChannelsResult => {
    const { channels, isLoaded } = useActiveCloudData();

    const scoped = useMemo(() => channels.filter(isInCloudSelfSection), [channels]);

    return { channels: scoped, isLoading: !isLoaded };
};
