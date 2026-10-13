import { useCallback, useState } from 'react';

import type { MyInviteView } from '@lemoncloud/chatic-backend-api';

import { runtime } from '@chatic/app-runtime';

/**
 * Desktop invite-write hook. Wraps the engine's invite repository (number-bound
 * `invite.create` / `cancel` / `list`) and the user repository's place-bound
 * `requestInvite` for every invite write the desktop UI needs.
 *
 * WHY HERE (not libs/app-runtime): same app-side convention as
 * `useDesktopChannelMutations` — the engine exposes the repositories, the app
 * owns the write shapes. Invite rows are relay-scoped (the invite repository
 * is cid-gated to the default cloud), so callers gate entry on the default
 * cloud rather than this hook guessing.
 *
 * A single `isMutating` flag covers writes only — `listInvites` polls on a
 * cadence and must not flip it.
 */
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
            // Every link this client issues lives 24 hours, the same lifetime
            // the web app gives its invites — defaulted here, not at the call
            // sites, so a new invite and a re-invite cannot drift apart.
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

    /**
     * A place invite comes back from `user.invite`, which puts the link in `Location` rather than the
     * `deeplink` that `invite.create` answers with. It is read into `deeplink` here, so callers handle
     * both kinds of invite the same way; without it every place invite was reported as having no link.
     */
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
