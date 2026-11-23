import { useEffect, useState } from 'react';

import type { DomainUser } from '@chatic/runtime';
import { runtime } from '@chatic/runtime';

export const useUser = (userId: string | null): DomainUser | null => {
    const { user: userRepository } = runtime.data.useRuntimeRepositories();
    const [user, setUser] = useState<DomainUser | null>(null);

    useEffect(() => {
        setUser(null);
        if (!userId) return;
        return userRepository.observeItem(userId, next => setUser(prev => next ?? prev));
    }, [userId, userRepository]);

    return user;
};
