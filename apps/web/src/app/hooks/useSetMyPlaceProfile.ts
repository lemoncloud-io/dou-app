import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { runtime } from '@chatic/runtime-react';

export interface MyPlaceProfileInput {
    nick: string;
    thumbnail?: string;
}

export const useSetMyPlaceProfile = (): ((value: MyPlaceProfileInput) => Promise<void>) => {
    const { profile: profileRepository } = runtime.data.useRuntimeRepositories();
    const { selectedSiteId } = runtime.session.useSessionSelection();
    const queryClient = useQueryClient();

    return useCallback(
        async ({ nick, thumbnail }: MyPlaceProfileInput) => {
            if (!selectedSiteId) throw new Error('[useSetMyPlaceProfile] no active place');
            if (queryClient.isMutating({ mutationKey: runtime.session.SWITCH_SITE_MUTATION_KEY }) > 0) {
                throw new Error('[useSetMyPlaceProfile] a place switch is in flight');
            }
            await profileRepository.setMyProfile({ nick, thumbnail }, selectedSiteId);
        },
        [profileRepository, selectedSiteId, queryClient]
    );
};
