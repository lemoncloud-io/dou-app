import { useEffect, useMemo, useState } from 'react';

import type { DomainUser } from '@chatic/runtime-client';
import { getActiveSessionUser } from '@chatic/runtime-client';
import { useGlobalSession } from './useGlobalSession';

import { useRuntimeRepositories } from '../../../../data/hooks/useRuntimeRepositories';

type SessionUserView = DomainUser & { userRole?: string; userStatus?: string; photo?: string };

export interface SessionProfile {
    userRole: string | null;
    isGuest: boolean;
    isCloudActive: boolean;
    userName: string;
    photo?: string;
}

export const useRuntimeProfile = (): SessionProfile => {
    const { user } = useRuntimeRepositories();
    const session = useGlobalSession();
    const uid = session.identity.userId ?? '';
    const isCloudActive = session.cloud.isActive;

    const [cachedUser, setCachedUser] = useState<SessionUserView | null>(
        () => getActiveSessionUser() as SessionUserView | null
    );

    useEffect(() => {
        if (!uid) {
            setCachedUser(null);
            return;
        }
        setCachedUser(getActiveSessionUser() as SessionUserView | null);
        return user.observeItem(uid, next => {
            if (next) setCachedUser(next as unknown as SessionUserView);
        });
    }, [user, uid]);

    return useMemo(() => {
        const cached = cachedUser;
        const seed = getActiveSessionUser() as SessionUserView | null;
        const userRole = cached?.userRole ?? seed?.userRole ?? null;
        return {
            userRole,
            isGuest: userRole === 'guest',
            isCloudActive,
            userName: cached?.name || seed?.name || 'Unknown',
            photo: cached?.photo ?? seed?.photo,
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cachedUser, session]);
};
