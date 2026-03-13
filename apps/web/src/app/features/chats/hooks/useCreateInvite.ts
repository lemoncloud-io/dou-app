import { useMutation } from '@tanstack/react-query';

import { firebaseDeeplinkService } from '../apis/firebase-service';
import { inviteUser } from '../apis/invite-api';

import type { MyUserInviteBody } from '@lemoncloud/chatic-backend-api';

interface CreateInviteParams {
    channelId: string;
    name: string;
    type?: 'phone' | 'email';
    alias?: string;
}

export const useCreateInvite = () => {
    const mutation = useMutation({
        mutationFn: async (params: CreateInviteParams) => {
            const body: MyUserInviteBody = {
                channelId: params.channelId,
                name: params.name,
                type: params.type ?? 'phone',
                alias: params.alias,
            };

            // Step 1: Create invite via backend API
            const invite = await inviteUser(body);

            if (!invite.code) {
                throw new Error('Failed to create invite: no code returned');
            }

            // Step 2: Create deeplink in Firebase
            const deeplinkUrl = await firebaseDeeplinkService.createDeeplink(invite);

            return {
                invite,
                deeplinkUrl,
            };
        },
    });

    return {
        createInvite: mutation.mutateAsync,
        isPending: mutation.isPending,
        isError: mutation.isError,
        error: mutation.error,
    };
};
