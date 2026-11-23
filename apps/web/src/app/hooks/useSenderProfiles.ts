import { useEffect, useMemo, useState } from 'react';

import { runtime, type DomainProfile } from '@chatic/runtime';
import { logger } from '@chatic/bridges';

export interface SenderProfileRef {
    sid: string;
    userId: string;
}

const profileId = (sid: string, userId: string) => `${sid}@${userId}`;

const memberIdOf = (profile: DomainProfile) => profile.userId || profile.uid;

export const useSenderProfiles = (refs: SenderProfileRef[]): Map<string, DomainProfile> => {
    const { profile: profileRepository } = runtime.data.useRuntimeRepositories();
    const [profiles, setProfiles] = useState<Map<string, DomainProfile>>(new Map());

    const requestKey = useMemo(() => {
        const ids = refs
            .filter(ref => ref.sid && ref.userId)
            .map(ref => profileId(ref.sid, ref.userId))
            .sort();
        return JSON.stringify([...new Set(ids)]);
    }, [refs]);

    useEffect(() => {
        const ids = JSON.parse(requestKey) as string[];
        if (ids.length === 0) {
            setProfiles(new Map());
            return;
        }

        const sids = [...new Set(ids.map(id => id.slice(0, id.lastIndexOf('@'))))];
        let cancelled = false;
        const resolved = new Map<string, DomainProfile>();

        const disposers = sids.map(sid =>
            profileRepository.observeList({ sid }, result => {
                (result?.list ?? []).forEach(profile => {
                    const memberId = memberIdOf(profile);
                    if (!profile.sid || !memberId) return;
                    resolved.set(profileId(profile.sid, memberId), profile);
                });
                if (!cancelled) setProfiles(new Map(resolved));
            })
        );

        void (async () => {
            try {
                const cachedIds = new Set<string>();
                await Promise.all(
                    sids.map(async sid => {
                        const cached = await profileRepository.cacheReadList({ sid });
                        (cached?.list ?? []).forEach(profile => {
                            const memberId = memberIdOf(profile);
                            if (profile.sid && memberId) cachedIds.add(profileId(profile.sid, memberId));
                        });
                    })
                );
                if (cancelled) return;

                const missing = ids.filter(id => !cachedIds.has(id));
                await Promise.all(missing.map(id => profileRepository.refreshItem(id).catch(() => null)));
            } catch (error) {
                if (!cancelled) logger.warn('SEARCH', 'Failed to load sender profiles', { error });
            }
        })();

        return () => {
            cancelled = true;
            disposers.forEach(dispose => dispose());
        };
    }, [profileRepository, requestKey]);

    return profiles;
};
