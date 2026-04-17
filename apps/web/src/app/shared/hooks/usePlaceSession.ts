import { useIssueCloudToken } from '@chatic/auth';
import { cloudCore, useWebCoreStore } from '@chatic/web-core';

export const getPlaceSession = () => {
    const wss = cloudCore.getWss();
    const identityToken = cloudCore.getIdentityToken();
    const backend = cloudCore.getBackend();
    if (!wss || !identityToken || !backend) return null;
    return { wss, identityToken, backend };
};

export const clearPlaceSession = (): void => {
    cloudCore.clearSession();
};

export const usePlaceSession = () => {
    const { mutateAsync: issueCloudToken, isPending } = useIssueCloudToken();
    const { setProfile } = useWebCoreStore();

    const selectPlace = async (placeId: string) => {
        const { cloudDelegationToken, userToken } = await issueCloudToken(placeId);

        cloudCore.saveDelegationToken(cloudDelegationToken);
        cloudCore.saveCloudToken(userToken);
        cloudCore.saveSelectedCloudId(placeId);

        const { Token, ...profile } = userToken;
        setProfile(profile);
    };

    return { selectPlace, isPending };
};
