import { useIssueCloudToken } from '@chatic/auth';
import { usePlaces } from '@chatic/places';
import { useGlobalLoader } from '@chatic/shared';
import { cloudCore, useWebCoreStore } from '@chatic/web-core';
import type { UserProfile$ } from '@lemoncloud/chatic-backend-api';

export const getCloudSession = () => {
    const wss = cloudCore.getWss();
    const identityToken = cloudCore.getIdentityToken();
    const backend = cloudCore.getBackend();
    if (!wss || !identityToken || !backend) return null;
    return { wss, identityToken, backend };
};

export const clearCloudSession = (): void => {
    cloudCore.clearSession();
};

export const useCloudSession = () => {
    const { mutateAsync: issueCloudToken, isPending } = useIssueCloudToken();
    const { setProfile, isGuest } = useWebCoreStore();
    const { setIsLoading } = useGlobalLoader();
    const { data, isError: isFetchError, isFetching, refetch } = usePlaces({ stereo: 'place' }, !isGuest);

    const clouds = data?.list ?? [];
    const isCloudsError = !isFetching && (isFetchError || clouds.length === 0);

    const selectPlace = async (placeId: string) => {
        setIsLoading(true);
        try {
            const { cloudDelegationToken, userToken } = await issueCloudToken(placeId);

            cloudCore.saveDelegationToken(cloudDelegationToken);
            cloudCore.saveCloudToken(userToken);
            cloudCore.saveSelectedPlaceId(placeId);

            const currentProfile = useWebCoreStore.getState().profile;
            const { Token, ...cloudProfile } = userToken;
            setProfile({ ...currentProfile, ...cloudProfile } as unknown as UserProfile$);
        } finally {
            setIsLoading(false);
        }
    };

    return { selectPlace, isPending, clouds, isCloudsError, isFetchingClouds: isFetching, refetchClouds: refetch };
};
