import { useCallback, useState } from 'react';

import type { MyInviteView } from '@lemoncloud/chatic-backend-api';

import { runtime } from '@chatic/runtime-react';

export const useDesktopInviteMutations = () => {
    const { invite: inviteRepository, user: userRepository } = runtime.data.useRuntimeRepositories();
    const [isMutating, setIsMutating] = useState(false);

    const run = useCallback(<T>(op: () => Promise<T>): Promise<T> => {
        setIsMutating(true);
        return op().finally(() => setIsMutating(false));
    }, []);

    const createInvite = useCallback(
        ({ phone, name, channelId }: { phone: string; name: string; channelId?: string }): Promise<MyInviteView> => {
            if (!phone) return Promise.reject(new Error('phone is required'));
            if (!name.trim()) return Promise.reject(new Error('name is required'));
            return run(() =>
                inviteRepository.create(
                    channelId ? { phone, name, channelId, expiresDays: 1 } : { phone, name, expiresDays: 1 }
                )
            );
        },
        [inviteRepository, run]
    );

    const cancelInvite = useCallback(
        (code: string): Promise<MyInviteView> => {
            if (!code) return Promise.reject(new Error('code is required'));
            return run(() => inviteRepository.cancel(code));
        },
        [inviteRepository, run]
    );

    const listInvites = useCallback((): Promise<MyInviteView[]> => {
        return inviteRepository.list();
    }, [inviteRepository]);

    const requestPlaceInvite = useCallback(
        ({ phone, name }: { phone: string; name: string }): Promise<MyInviteView> => {
            if (!phone) return Promise.reject(new Error('phone is required'));
            if (!name.trim()) return Promise.reject(new Error('name is required'));
            return run(async () => {
                const view = await userRepository.requestInvite({ phone, name });
                const location = (view as { Location?: unknown }).Location;
                if (view.deeplink || typeof location !== 'string' || !location) return view;
                return { ...view, deeplink: location };
            });
        },
        [userRepository, run]
    );

    return {
        createInvite,
        cancelInvite,
        listInvites,
        requestPlaceInvite,
        isMutating,
    };
};
