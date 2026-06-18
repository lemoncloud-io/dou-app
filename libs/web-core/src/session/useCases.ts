import { logger } from '@chatic/bridges';
import type { UserProfile$, UserTokenView, UserView } from '@lemoncloud/chatic-backend-api';
import { applyInvitedCloud } from '../cloud';
import { useWebCoreStore } from '../stores';
import { getCloudSessionSnapshot } from './contexts';
import { sessionProfileResolver } from './profiles';
import type { CloudSessionSnapshot, IssueCloudToken } from './types';

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

const buildSnapshotFallback = (cloudId: string, siteId: string | null): CloudSessionSnapshot => {
    const cloudProfile = sessionProfileResolver.getCloudProfile();
    return {
        cloudId,
        siteId,
        identityToken: cloudProfile.getIdentityToken(),
        backend: cloudProfile.getBackend(),
        wss: cloudProfile.getWss(),
    };
};

// Invite-cloud bundle restoration is still backed by the deprecated persisted
// bundle store. Keep that detail inside the usecase boundary while callers
// move away from direct invited-cloud state access.
const restoreInvitedCloudState = (cloudId: string): boolean => {
    return applyInvitedCloud(cloudId);
};

export const switchCloudSessionUseCase = async ({
    cloudId,
    issueCloudToken,
}: {
    cloudId: string;
    issueCloudToken: IssueCloudToken;
}): Promise<CloudSessionSnapshot> => {
    const cloudProfile = sessionProfileResolver.getCloudProfile();

    try {
        const previousCloudId = cloudProfile.getSelectedCloudId();
        const { cloudDelegationToken, userToken } = await issueCloudToken(cloudId);

        cloudProfile.saveDelegationToken(cloudDelegationToken);
        const existingToken = previousCloudId === cloudId ? cloudProfile.getCloudToken() : null;
        cloudProfile.saveCloudToken(
            existingToken ? ({ ...existingToken, ...userToken } as typeof userToken) : userToken
        );
        cloudProfile.saveSelectedCloudId(cloudId);

        if (previousCloudId !== cloudId) {
            cloudProfile.clearSelectedSite();
            cloudProfile.clearPlaceOrder(cloudId);
        }

        const currentProfile = useWebCoreStore.getState().profile;
        const { Token: _token, ...cloudProfileUser } = userToken;
        useWebCoreStore.getState().setProfile(mergeCloudProfile(currentProfile, cloudProfileUser));
        useWebCoreStore.getState().setSelectedCloudId(cloudId);

        return getCloudSessionSnapshot() ?? buildSnapshotFallback(cloudId, cloudProfile.getSelectedSiteId());
    } catch (error) {
        logger.error('SESSION', '[usecase] switchCloudSession failed', { error, data: { cloudId } });
        throw error;
    }
};

export const restoreInvitedCloudSessionUseCase = async (cloudId: string): Promise<CloudSessionSnapshot> => {
    const cloudProfile = sessionProfileResolver.getCloudProfile();

    try {
        if (!restoreInvitedCloudState(cloudId)) {
            throw new Error(`No invited-cloud session for ${cloudId}`);
        }

        const cloudToken = cloudProfile.getCloudToken();
        if (cloudToken) {
            const currentProfile = useWebCoreStore.getState().profile;
            const { Token: _token, ...cloudProfileUser } = cloudToken;
            useWebCoreStore.getState().setProfile(mergeCloudProfile(currentProfile, cloudProfileUser));
        }

        const siteId = cloudProfile.getSelectedSiteId();
        useWebCoreStore.getState().setSelectedCloudId(cloudId);
        if (siteId) {
            useWebCoreStore.getState().setSelectedSiteId(siteId);
        }

        return getCloudSessionSnapshot() ?? buildSnapshotFallback(cloudId, siteId);
    } catch (error) {
        logger.error('SESSION', '[usecase] restoreInvitedCloudSession failed', {
            error,
            data: { cloudId },
        });
        throw error;
    }
};

export const refreshCloudSiteSessionUseCase = async ({
    siteId,
    refreshCloudToken,
}: {
    siteId: string;
    refreshCloudToken: (target?: string) => Promise<UserTokenView>;
}): Promise<CloudSessionSnapshot> => {
    const cloudProfile = sessionProfileResolver.getCloudProfile();
    const cloudToken = cloudProfile.getCloudToken();
    const uid = cloudToken?.id;
    if (!uid) {
        throw new Error('No cloud token uid for site auth');
    }

    const refreshed = await refreshCloudToken(`${uid}@${siteId}`);
    cloudProfile.saveSelectedSiteId(siteId);
    useWebCoreStore.getState().setSelectedSiteId(siteId);

    const currentProfile = useWebCoreStore.getState().profile;
    const { Token: _token, ...cloudProfileUser } = refreshed;
    useWebCoreStore.getState().setProfile(mergeCloudProfile(currentProfile, cloudProfileUser));

    return getCloudSessionSnapshot() ?? buildSnapshotFallback(cloudProfile.getSelectedCloudId() ?? 'default', siteId);
};
