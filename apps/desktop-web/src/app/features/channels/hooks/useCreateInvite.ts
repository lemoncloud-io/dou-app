import { useCallback, useState } from 'react';

import type { MyInviteView, MyUserInviteBody } from '@lemoncloud/chatic-backend-api';

import { cloudCore } from '@chatic/web-core';
import { useRuntimeRepositories } from '@chatic/app-runtime';

import { buildInviteLink } from '../utils/buildInviteLink';

/**
 * Generate a shareable invite link for a channel by inviting a phone number.
 *
 * Mirrors apps/web useCreateInviteBatch + the server contract
 * (chatic-sockets-api user.invite-batch → POST /users/0/invite-bulk?sms):
 * the body REQUIRES `to: string[]` (phone list); channelId/cloudId are optional.
 * The server returns `ListResult<MyInviteView>` ({ total, list }); the first
 * entry carries the fully-formed `Location` deep link (the same form our
 * invite-login parser consumes), which we return.
 */
export const useCreateInvite = () => {
    const { user: userRepository } = useRuntimeRepositories();
    const [isCreating, setIsCreating] = useState(false);

    const createInvite = useCallback(
        async (channelId: string, phone: string): Promise<string> => {
            const to = phone.trim();
            if (!channelId) throw new Error('channelId is required');
            if (!to) throw new Error('phone is required');

            setIsCreating(true);
            try {
                const cloudId = cloudCore.getSelectedCloudId() ?? undefined;
                // The installed MyUserInviteBody type lags the server contract (it lacks
                // `to`, which user.invite-batch requires). Cast — same as apps/web does.
                const body = { to: [to], channelId, cloudId } as unknown as MyUserInviteBody;
                const res = await userRepository.requestInviteBatch(body);

                // Server returns ListResult { total, list }; the engine mis-types it as
                // MyInviteView[]. Unwrap both shapes defensively (no lib change).
                const list: MyInviteView[] = Array.isArray(res)
                    ? res
                    : ((res as unknown as { list?: MyInviteView[] }).list ?? []);

                const invite = list[0];
                if (!invite) throw new Error('invite creation returned no result');

                const link = buildInviteLink(invite);
                if (!link) throw new Error('invite response is missing a shareable link');
                return link;
            } finally {
                setIsCreating(false);
            }
        },
        [userRepository]
    );

    return { createInvite, isCreating };
};
