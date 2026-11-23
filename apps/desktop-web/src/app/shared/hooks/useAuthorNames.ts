import { useEffect, useMemo, useRef, useState } from 'react';

import { runtime } from '@chatic/runtime';

import { displayName } from '../utils';

export interface CloudProfile {
    name?: string;
    thumbnail?: string;
}

const profileMemo = new Map<string, CloudProfile>();

const seedFromMemo = (ids: string[]): Map<string, CloudProfile> => {
    const map = new Map<string, CloudProfile>();
    for (const id of ids) {
        const profile = profileMemo.get(id);
        if (profile) map.set(id, profile);
    }
    return map;
};

export const useCloudProfiles = (ids: readonly (string | undefined)[]): ReadonlyMap<string, CloudProfile> => {
    const { user: userRepository } = runtime.data.useRuntimeRepositories();

    const idsKey = useMemo(() => [...new Set(ids.filter((id): id is string => !!id))].sort().join(','), [ids]);
    const keyedIds = useMemo(() => (idsKey ? idsKey.split(',') : []), [idsKey]);

    const [tick, setTick] = useState(0);

    const resolved = useMemo(() => seedFromMemo(keyedIds), [keyedIds, tick]);
    const resolvedRef = useRef(resolved);
    resolvedRef.current = resolved;

    useEffect(() => {
        if (keyedIds.length === 0) return;
        const unsubs = keyedIds.map(id =>
            userRepository.observeItem(id, user => {
                if (!user) return;
                const resolved = displayName(user);
                const name = resolved && resolved !== id ? resolved : undefined;
                const thumbnail = user.thumbnail || undefined;
                if (!name && !thumbnail) return;
                profileMemo.set(id, { name, thumbnail });
                const shown = resolvedRef.current.get(id);
                if (shown?.name !== name || shown?.thumbnail !== thumbnail) setTick(t => t + 1);
            })
        );
        return () => unsubs.forEach(unsub => unsub());
    }, [keyedIds, userRepository]);

    return resolved;
};

export const useAuthorNames = (ownerIds: readonly (string | undefined)[]): ReadonlyMap<string, string> => {
    const profiles = useCloudProfiles(ownerIds);
    return useMemo(() => {
        const names = new Map<string, string>();
        for (const [id, { name }] of profiles) if (name) names.set(id, name);
        return names;
    }, [profiles]);
};
