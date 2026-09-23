import { useEffect, useState } from 'react';

import { runtime } from '@chatic/app-runtime';
import type { DomainUser } from '@chatic/data';

/**
 * Cached user rows for a set of ids, as the middle rung of the display-name chain.
 *
 * Read one id at a time rather than observed as a list: `observeList` is keyed by `channelId`
 * (`ChannelListUserRequestData` requires it), and these ids are gathered across many channels, so
 * no single scoped query covers them. A per-id `cacheRead` is a supported call, runs once per id
 * set, and opens no observers and no network.
 *
 * **A fallback, never the primary source.** The place profile is, and `useChannelProfiles`
 * bootstraps the ones the cache is missing, so most rows never reach this at all.
 *
 * The whole row is kept rather than just `name`: the shared chain reads `nick` first, and it needs
 * the id to recognise the raw id the server seeds an unnamed user's `name` with.
 */
export const useUserRecords = (ids: string[]): Map<string, DomainUser> => {
    const { user: userRepository } = runtime.data.useRuntimeRepositories();
    const [records, setRecords] = useState<Map<string, DomainUser>>(new Map());

    // Stands in for the id array so a re-derived array of the same ids does not re-read the cache
    // on every render.
    const key = ids.join(',');

    useEffect(() => {
        let cancelled = false;
        const targets = key ? key.split(',') : [];
        void Promise.all(targets.map(id => userRepository.cacheRead(id).catch(() => null))).then(
            (users: Array<DomainUser | null>) => {
                if (cancelled) return;
                const next = new Map<string, DomainUser>();
                users.forEach(user => {
                    if (user?.id) next.set(user.id, user);
                });
                setRecords(next);
            }
        );
        return () => {
            cancelled = true;
        };
    }, [userRepository, key]);

    return records;
};
