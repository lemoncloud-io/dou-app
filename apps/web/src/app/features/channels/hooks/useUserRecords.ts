import { useEffect, useState } from 'react';

import { runtime, type DomainUser } from '@chatic/runtime';

export const useUserRecords = (ids: string[]): Map<string, DomainUser> => {
    const { user: userRepository } = runtime.data.useRuntimeRepositories();
    const [records, setRecords] = useState<Map<string, DomainUser>>(new Map());

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
