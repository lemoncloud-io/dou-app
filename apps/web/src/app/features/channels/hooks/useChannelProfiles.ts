import { useEffect, useMemo, useState } from 'react';

import { runtime, type DomainProfile } from '@chatic/runtime-react';

import { readSelectedCloudId, useSelectedCloudId } from '../../../hooks/useCloudScope';
import { getSocketErrorCode } from '../../../utils/errors';

const PROFILE_SYNC_INTERVAL_MS = 20_000;

export const useChannelProfiles = (
    sid: string | null,
    activeMemberIds: string[],
    syncIntervalMs: number = PROFILE_SYNC_INTERVAL_MS
) => {
    const { profile: profileRepository } = runtime.data.useRuntimeRepositories();
    const cid = useSelectedCloudId();
    const isVerified = runtime.connection.useCloudVerified(cid);
    const uid = runtime.session.useUidInCloud(cid);

    const [profiles, setProfiles] = useState<DomainProfile[]>([]);

    const memberKey = activeMemberIds.join(',');

    useEffect(() => {
        if (!sid) {
            setProfiles([]);
            return;
        }
        return profileRepository.observeList({ sid }, result => {
            setProfiles(result?.list ?? []);
        });
    }, [profileRepository, sid]);

    useEffect(() => {
        if (!sid || !isVerified || activeMemberIds.length === 0) return;

        const disposers: Array<() => void> = [];
        let disposed = false;
        const register = (userId: string) => {
            if (disposed) return;
            disposers.push(
                runtime.sync.registerSyncTarget(
                    { type: 'profile', id: `${sid}@${userId}`, intervalMs: syncIntervalMs },
                    { cid }
                )
            );
        };

        void (async () => {
            let cachedUserIds: Set<string | undefined>;
            try {
                const cached = await profileRepository.cacheReadList({ sid });
                cachedUserIds = new Set(
                    (cached?.list ?? []).map(profile => profile.userId ?? profile.uid).filter(Boolean)
                );
            } catch {
                activeMemberIds.forEach(register);
                return;
            }

            const uncached = activeMemberIds.filter(userId => !cachedUserIds.has(userId));

            activeMemberIds.filter(userId => cachedUserIds.has(userId)).forEach(register);

            if (disposed || readSelectedCloudId() !== cid) {
                uncached.forEach(register);
                return;
            }
            await Promise.all(
                uncached.map(userId =>
                    profileRepository.refreshItem(`${sid}@${userId}`).then(
                        () => register(userId),
                        error => {
                            if (getSocketErrorCode(error) !== 404) register(userId);
                        }
                    )
                )
            );
        })();

        return () => {
            disposed = true;
            disposers.forEach(dispose => dispose());
        };
    }, [profileRepository, sid, cid, isVerified, memberKey, syncIntervalMs, uid]);

    const profileMap = useMemo(() => {
        const map = new Map<string, DomainProfile>();
        for (const profile of profiles) {
            const key = profile.userId ?? profile.uid;
            if (key) map.set(key, profile);
        }
        return map;
    }, [profiles]);

    return { profileMap };
};
