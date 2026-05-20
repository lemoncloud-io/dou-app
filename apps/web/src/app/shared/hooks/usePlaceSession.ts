import { useIssueCloudToken } from '@chatic/auth';
import { useWebSocketV2Store } from '@chatic/socket';
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
        // 서버가 반환하지 않는 로컬 커스텀 필드(thumbnail 등)를 보존
        const existing = cloudCore.getCloudToken();
        cloudCore.saveCloudToken(existing ? ({ ...existing, ...userToken } as typeof userToken) : userToken);
        cloudCore.saveSelectedSiteId(placeId);
        useWebSocketV2Store.getState().setSelectedPlaceId(placeId);

        const { Token, ...profile } = userToken;
        setProfile(profile);
    };

    return { selectPlace, isPending };
};
