import { useIssueCloudToken } from '@chatic/auth';
import { useGlobalLoader } from '@chatic/shared';
import { cloudCore, useWebCoreStore } from '@chatic/web-core';

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
    const { setProfile } = useWebCoreStore();
    const { setIsLoading } = useGlobalLoader();

    const selectPlace = async (placeId: string) => {
        setIsLoading(true);
        try {
            const { cloudDelegationToken, userToken } = await issueCloudToken(placeId);

            cloudCore.saveDelegationToken(cloudDelegationToken);
            cloudCore.saveCloudToken(userToken);
            cloudCore.saveSelectedPlaceId(placeId);

            const { Token, ...profile } = userToken;
            setProfile(profile);
        } finally {
            setIsLoading(false);
        }
    };

    return { selectPlace, isPending };
};
