import { useEffect, useState } from 'react';

import type { DomainUser } from '@chatic/data';
import { useRepositories } from '@chatic/app-runtime';

/**
 * Reactive single-user lookup for the profile card. `subscribeItem` emits the
 * cached record first (instant paint when the member list already loaded it),
 * then streams live updates. A null emission never clears a value we already
 * have, so a resync blip can't blank an open card. Returns null until the first
 * hit; callers fall back to the identity they already hold (name/initial).
 */
export const useUser = (userId: string | null): DomainUser | null => {
    const { user: userRepository } = useRepositories();
    const [user, setUser] = useState<DomainUser | null>(null);

    useEffect(() => {
        setUser(null);
        if (!userId) return;
        return userRepository.subscribeItem(userId, next => setUser(prev => next ?? prev));
    }, [userId, userRepository]);

    return user;
};
