import { useEffect, useMemo, useRef, useState } from 'react';

import { runtime, type DomainChannel, type DomainJoin } from '@chatic/runtime';

import type { CloudPartition } from './useAccessiblePlaceIds';
import { useSelectedCloudId } from './useCloudScope';

interface UseMyJoinsOptions {
    sync?: boolean;
}

export const useJoinSyncRegistration = (
    channels: DomainChannel[],
    { enabled = true }: { enabled?: boolean } = {}
): void => {
    const cid = useSelectedCloudId();
    const uid = runtime.session.useUidInCloud(cid);
    const verified = runtime.connection.useCloudVerified(cid);

    const channelIds = channels.map(ch => ch.id);
    const channelKey = channelIds.join(',');

    useEffect(() => {
        if (!enabled || !uid || !verified) return;
        const disposers = channelIds.map(id =>
            runtime.sync.registerSyncTarget({ type: 'join', id: `${id}@${uid}` }, { cid })
        );
        return () => disposers.forEach(dispose => dispose());
    }, [channelKey, cid, uid, verified, enabled]);
};

export const useMyJoins = (channels: DomainChannel[], options: UseMyJoinsOptions = {}): Map<string, DomainJoin> => {
    const { sync: shouldSync = true } = options;
    const cid = useSelectedCloudId();
    const uid = runtime.session.useUidInCloud(cid) ?? undefined;

    useJoinSyncRegistration(channels, { enabled: shouldSync });

    return useCloudJoins(channels, { cid, uid });
};

export const useCloudJoins = (channels: DomainChannel[], { cid, uid }: CloudPartition): Map<string, DomainJoin> => {
    const { join: joinRepository } = runtime.data.useRuntimeRepositories();

    const [joinByChannel, setJoinByChannel] = useState<Map<string, DomainJoin>>(new Map());

    const channelIds = channels.map(ch => ch.id);
    const channelKey = channels.map(ch => `${ch.id}:${ch.sid ?? ''}`).join(',');
    const channelById = useMemo(() => new Map(channels.map(channel => [channel.id, channel] as const)), [channelKey]);

    const mapRef = useRef(new Map<string, DomainJoin>());
    useEffect(() => {
        if (!joinRepository || !uid) return;
        const current = mapRef.current;
        const activeIds = new Set(channelIds);
        for (const id of current.keys()) {
            if (!activeIds.has(id)) current.delete(id);
        }

        const disposers = channelIds.map(id =>
            joinRepository.observeList(
                { channelId: id },
                result => {
                    const mine = result?.list?.find(join => join.userId === uid);
                    if (mine) current.set(id, mine);
                    else current.delete(id);
                    setJoinByChannel(new Map(current));
                },
                { cid, sid: channelById.get(id)?.sid, uid }
            )
        );
        return () => disposers.forEach(dispose => dispose());
    }, [joinRepository, channelKey, uid, cid, channelById]);

    return joinByChannel;
};
