import { useCallback, useState } from 'react';

import type { MyInviteView, MyUserInviteBody } from '@lemoncloud/chatic-backend-api';

import { useSessionSelection } from '@chatic/web-core';
import { useRuntimeRepositories } from '@chatic/app-runtime';

import { buildInviteLink } from '../utils/buildInviteLink';

/**
 * Generate a shareable invite link for a channel by inviting a phone number.
 *
 * Mirrors apps/web useCreateInviteBatch + the v2 server contract: the engine's
 * `requestInviteBatch` derives the recipient list from `alias` (phone), so the
 * body carries `alias`/`type`/`channelId`. The server returns
 * `ListResult<MyInviteView>` ({ total, list }); the first entry carries the
 * fully-formed `Location` deep link (the same form our invite-login parser
 * consumes), which we return.
 */
export const useCreateInvite = () => {
    const { user: userRepository } = useRuntimeRepositories();
    const { selectedCloudId } = useSessionSelection();
    const [isCreating, setIsCreating] = useState(false);

    const createInvite = useCallback(
        async (channelId: string, phone: string): Promise<string> => {
            const to = phone.trim();
            if (!channelId) throw new Error('channelId is required');
            if (!to) throw new Error('phone is required');

            setIsCreating(true);
            try {
                // The installed MyUserInviteBody type lags the server contract; cast —
                // same as apps/web does. The engine reads `alias` to build the SMS list.
                const body = {
                    alias: to,
                    type: 'phone',
                    name: '',
                    channelId,
                    cloudId: selectedCloudId,
                } as unknown as MyUserInviteBody;
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
        [userRepository, selectedCloudId]
    );

    return { createInvite, isCreating };
};
