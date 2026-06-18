import { logger } from '@chatic/bridges';
import { cloudCore, useWebCoreStore } from '@chatic/web-core';
import type { CloudDelegationTokenView, UserProfile$, UserTokenView, UserView } from '@lemoncloud/chatic-backend-api';

type IssueCloudTokenResult = {
    cloudDelegationToken: CloudDelegationTokenView;
    userToken: UserTokenView;
};

export type IssueCloudToken = (cloudId: string) => Promise<IssueCloudTokenResult>;

/**
 * Preserve the canonical profile identity when cloud tokens only provide a flat
 * user shape. Without this, early cloud selection can collapse profile fields
 * until the next full profile fetch.
 */
export const mergeCloudProfile = (current: UserProfile$ | null, cloudUser: Partial<UserView>): UserProfile$ =>
    ({
        ...current,
        ...cloudUser,
        uid: current?.uid ?? (cloudUser as { id?: string }).id,
        $user: current?.$user ?? (cloudUser as unknown as UserView),
    }) as unknown as UserProfile$;

export interface CloudSessionSnapshot {
    cloudId: string;
    placeId: string | null;
    identityToken: string | null;
    backend: string | null;
    wss: string | null;
}

export const getCloudSessionSnapshot = (): CloudSessionSnapshot | null => {
    const wss = cloudCore.getWss();
    const identityToken = cloudCore.getIdentityToken();
    const backend = cloudCore.getBackend();
    if (!wss || !identityToken || !backend) return null;
    return {
        cloudId: cloudCore.getSelectedCloudId() ?? 'default',
        placeId: cloudCore.getSelectedPlaceId(),
        identityToken,
        backend,
        wss,
    };
};

export const clearCloudSession = (): void => {
    cloudCore.clearSession();
};

export const selectCloudSession = async ({
    cloudId,
    issueCloudToken,
}: {
    cloudId: string;
    issueCloudToken: IssueCloudToken;
}): Promise<CloudSessionSnapshot> => {
    try {
        const previousCloudId = cloudCore.getSelectedCloudId();
        const { cloudDelegationToken, userToken } = await issueCloudToken(cloudId);

        cloudCore.saveDelegationToken(cloudDelegationToken);
        const existingToken = previousCloudId === cloudId ? cloudCore.getCloudToken() : null;
        cloudCore.saveCloudToken(existingToken ? ({ ...existingToken, ...userToken } as typeof userToken) : userToken);
        cloudCore.saveSelectedCloudId(cloudId);

        if (previousCloudId !== cloudId) {
            cloudCore.clearSelectedPlace();
            cloudCore.clearPlaceOrder(cloudId);
        }

        const currentProfile = useWebCoreStore.getState().profile;
        const { Token: _Token, ...cloudProfile } = userToken;
        useWebCoreStore.getState().setProfile(mergeCloudProfile(currentProfile, cloudProfile));
        useWebCoreStore.getState().setSelectedCloudId(cloudId);

        return (
            getCloudSessionSnapshot() ?? {
                cloudId,
                placeId: cloudCore.getSelectedPlaceId(),
                identityToken: cloudCore.getIdentityToken(),
                backend: cloudCore.getBackend(),
                wss: cloudCore.getWss(),
            }
        );
    } catch (error) {
        logger.error('SESSION', '[cloudSessionService] selectCloudSession failed', { error, data: { cloudId } });
        throw error;
    }
};

export const restoreInvitedCloudSession = async (cloudId: string): Promise<CloudSessionSnapshot> => {
    try {
        if (
            !(
                cloudCore as typeof cloudCore & { applyInvitedCloud?: (targetCloudId: string) => boolean }
            ).applyInvitedCloud?.(cloudId)
        ) {
            throw new Error(`No invited-cloud session for ${cloudId}`);
        }

        const cloudToken = cloudCore.getCloudToken();
        if (cloudToken) {
            const currentProfile = useWebCoreStore.getState().profile;
            const { Token: _Token, ...cloudProfile } = cloudToken;
            useWebCoreStore.getState().setProfile(mergeCloudProfile(currentProfile, cloudProfile));
        }

        const placeId = cloudCore.getSelectedPlaceId();
        useWebCoreStore.getState().setSelectedCloudId(cloudId);
        if (placeId) useWebCoreStore.getState().setSelectedPlaceId(placeId);

        return (
            getCloudSessionSnapshot() ?? {
                cloudId,
                placeId,
                identityToken: cloudCore.getIdentityToken(),
                backend: cloudCore.getBackend(),
                wss: cloudCore.getWss(),
            }
        );
    } catch (error) {
        logger.error('SESSION', '[cloudSessionService] restoreInvitedCloudSession failed', {
            error,
            data: { cloudId },
        });
        throw error;
    }
};

export const refreshCloudPlaceSession = async (placeId: string): Promise<CloudSessionSnapshot> => {
    const cloudToken = cloudCore.getCloudToken();
    const uid = cloudToken?.id;
    if (!uid) throw new Error('No cloud token uid for place auth');

    const refreshed = await cloudCore.refreshToken(`${uid}@${placeId}`);
    cloudCore.saveSelectedSiteId(placeId);
    useWebCoreStore.getState().setSelectedPlaceId(placeId);

    const currentProfile = useWebCoreStore.getState().profile;
    const { Token: _token, ...cloudProfile } = refreshed;
    useWebCoreStore.getState().setProfile(mergeCloudProfile(currentProfile, cloudProfile));

    return (
        getCloudSessionSnapshot() ?? {
            cloudId: cloudCore.getSelectedCloudId() ?? 'default',
            placeId,
            identityToken: cloudCore.getIdentityToken(),
            backend: cloudCore.getBackend(),
            wss: cloudCore.getWss(),
        }
    );
};
