import { useMemo } from 'react';

import type { DomainChannel } from '@chatic/data';

import { useActiveCloudData } from '../../../hooks';
import { dmLineageOf } from '../lib';

export interface CloudDmChannelsResult {
    channels: DomainChannel[];
    isLoading: boolean;
}

/**
 * The cloud 1:1 rooms of the connected cloud — every one of them, whatever place they carry.
 *
 * **This is the read that `sid` must not scope.** The server puts a 1:1 in a place (the creator's,
 * at the moment they opened it) and that tag says nothing about the pair, so a place-scoped read
 * would show the room to one participant and hide it from the other. `useHomeChannels` keeps its
 * `sid` filter because a group really does live in a place; a 1:1 is read cloud-wide instead and
 * shown in a section of its own.
 *
 * Reads the lineage through `dmLineageOf` rather than testing a field here, so "what makes a 1:1 a
 * cloud one" stays one rule. Opens no observer of its own — it is a slice of the observation the
 * home list already holds.
 */
export const useCloudDmChannels = (): CloudDmChannelsResult => {
    const { channels, isLoaded } = useActiveCloudData();

    const scoped = useMemo(() => channels.filter(channel => dmLineageOf(channel) === 'cloud'), [channels]);

    return { channels: scoped, isLoading: !isLoaded };
};
