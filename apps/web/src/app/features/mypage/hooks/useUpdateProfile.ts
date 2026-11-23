import { useMutation } from '@tanstack/react-query';

import type { UserView } from '@lemoncloud/chatic-backend-api';
import { runtime } from '@chatic/runtime';

interface UpdateProfileData {
    name?: string;
    photo?: string;
}

export const useUpdateProfile = () => {
    return useMutation({
        mutationFn: async (data: UpdateProfileData) => {
            const updated: UserView = await runtime.session.updateAccountProfile(data);
            const view = (updated ?? {}) as unknown as Record<string, unknown>;
            runtime.session.patchRelaySessionUser({
                name: (view.name as string | undefined) ?? data.name,
                ...(data.photo !== undefined ? { photo: (view.photo as string | undefined) ?? data.photo } : {}),
            });
            return data;
        },
    });
};
