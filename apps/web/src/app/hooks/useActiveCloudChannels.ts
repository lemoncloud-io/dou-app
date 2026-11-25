import { useEffect, useMemo, useRef, useState } from 'react';

import { runtime, ACCOUNT_CHANNEL_SID, isRelayDm, type DomainChannel } from '@chatic/runtime-react';

import { useHasChannelSync } from '../stores/useChannelSyncMarkStore';
import { useColdListWindowElapsed } from './useColdListWindow';
import { useCloudPlaceIds, type CloudPartition } from './useAccessiblePlaceIds';
import { useActiveCloudData } from './activeCloudDataContext';

export const useActiveCloudChannelsSource = (): { channels: DomainChannel[]; isLoaded: boolean } => {
    const { selectedCloudId } = runtime.session.useSessionSelection();
    const uid = runtime.session.useGlobalSession().identity.userId ?? undefined;
    return useCloudChannelsSource({ cid: selectedCloudId ?? 'default', uid });
};

export const useCloudChannelsSource = ({
    cid,
    uid,
}: CloudPartition): { channels: DomainChannel[]; isLoaded: boolean } => {
    const { channel } = runtime.data.useRuntimeRepositories();
    const accessiblePlaceIds = useCloudPlaceIds({ cid, uid });

    const [channels, setChannels] = useState<DomainChannel[]>([]);
    const [hasCacheAnswered, setHasCacheAnswered] = useState(false);
    const hasChannelSync = useHasChannelSync(cid, uid);
    const hasColdWindowElapsed = useColdListWindowElapsed(`channel:${cid}:${uid ?? ''}`);

    const scopeRef = useRef(`${cid}|${uid ?? ''}`);

    useEffect(() => {
        if (!channel) return;
        const scope = `${cid}|${uid ?? ''}`;
        if (scopeRef.current !== scope) {
            scopeRef.current = scope;
            setChannels([]);
            setHasCacheAnswered(false);
        }
        return channel.observeList(
            { sid: '' },
            result => {
                setChannels(result?.list ?? []);
                setHasCacheAnswered(true);
            },
            { cid, uid }
        );
    }, [channel, cid, uid]);

    const inCloud = useMemo(() => channels.filter(row => row.cid === cid), [channels, cid]);

    const isLoaded = hasCacheAnswered && (inCloud.length > 0 || hasChannelSync || hasColdWindowElapsed);

    const accessible = useMemo(() => {
        if (!accessiblePlaceIds) return inCloud;
        return inCloud.filter(
            row => !row.sid || row.sid === ACCOUNT_CHANNEL_SID || isRelayDm(row) || accessiblePlaceIds.has(row.sid)
        );
    }, [inCloud, accessiblePlaceIds]);

    return useMemo(() => ({ channels: accessible, isLoaded }), [accessible, isLoaded]);
};

export const useActiveCloudChannels = (): DomainChannel[] => useActiveCloudData().channels;
