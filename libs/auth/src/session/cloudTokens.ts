import type { CloudDelegationTokenView, UserTokenView } from '@lemoncloud/chatic-backend-api';

import { logger } from '@chatic/logger';

import { authRepositorySource } from './authRepository';
import { cloudStore, msUntilExpiration, getUidInCloud, rebuildSessionIdentity, sessionSignal } from '@chatic/session';
import { recordCloudIdentity, uidOfCloudToken } from './cloudIdentity';
import { RELAY_CLOUD_ID, type IAuthRepository } from '@chatic/data';

const authRepository = (): IAuthRepository => authRepositorySource.get();

export interface IssuedCloudTokens {
    delegationToken: CloudDelegationTokenView;
    cloudToken: UserTokenView;
}

export interface InviteLoginEntry {
    cloudToken: UserTokenView;
    backend?: string;
    wss?: string;
}

export const tokensFromInviteLogin = (cloudId: string, entry: InviteLoginEntry): IssuedCloudTokens | null => {
    const { cloudToken, backend, wss } = entry;
    if (!cloudId || !cloudToken?.Token?.identityToken || !backend || !wss) return null;
    const now = Date.now();
    const remaining = msUntilExpiration(cloudToken.Token.credential?.Expiration, now);
    return {
        delegationToken: {
            delegationToken: '',
            cloudId,
            backend,
            wss,
            expiredAt: remaining == null ? 0 : now + remaining,
        },
        cloudToken,
    };
};

export const isInviteLoginEntry = (delegationToken?: CloudDelegationTokenView | null): boolean =>
    delegationToken?.delegationToken === '';

const exchangesInFlight = new Map<string, Promise<IssuedCloudTokens>>();

const lastIssuedFor = new Map<string, string | null>();

export class CloudIdentityChangedError extends Error {
    constructor(
        readonly cloudId: string,
        readonly recordedUid: string,
        readonly issuedUid: string
    ) {
        super(`cloud[${cloudId}] re-issue named user[${issuedUid}], not the recorded user[${recordedUid}]`);
        this.name = 'CloudIdentityChangedError';
    }
}

const roleOfCloudToken = (token: UserTokenView): unknown => {
    const view = token as { userRole?: unknown; $user?: { userRole?: unknown } };
    return view.userRole ?? view.$user?.userRole;
};

const assertSameCloudIdentity = (cloudId: string, cloudToken: UserTokenView): void => {
    const recordedUid = cloudStore.getCloudIdentity(cloudId)?.uid;
    const issuedUid = uidOfCloudToken(cloudToken);
    if (!recordedUid || !issuedUid || recordedUid === issuedUid) return;
    if (roleOfCloudToken(cloudToken) === 'owner') return;
    logger.error('SESSION', '[cloudTokens] cloud re-issue named a different user — refused', {
        data: { cloudId, recordedUid, issuedUid },
    });
    refusals.set(cloudId, { recordedUid, issuedUid });
    throw new CloudIdentityChangedError(cloudId, recordedUid, issuedUid);
};

const refusals = new Map<string, { recordedUid: string; issuedUid: string }>();

export const resetCloudIdentityRefusals = (): void => {
    refusals.clear();
};

const throwIfRefusedBefore = (cloudId: string): void => {
    const refusal = refusals.get(cloudId);
    if (!refusal) return;
    if (cloudStore.getCloudIdentity(cloudId)?.uid !== refusal.recordedUid) {
        refusals.delete(cloudId);
        return;
    }
    throw new CloudIdentityChangedError(cloudId, refusal.recordedUid, refusal.issuedUid);
};

const exchange = async (cloudId: string): Promise<IssuedCloudTokens> => {
    throwIfRefusedBefore(cloudId);
    const issuedFor = getUidInCloud(RELAY_CLOUD_ID);
    const delegationToken = await authRepository().delegateCloud(cloudId);
    const cloudToken = await authRepository().exchangeToken({
        baseURL: delegationToken.backend as string,
        body: { delegationToken: delegationToken.delegationToken },
    });
    assertSameCloudIdentity(cloudId, cloudToken);

    cloudStore.setCachedCloudTokens(cloudId, { delegationToken, cloudToken });
    recordCloudIdentity(cloudId, cloudToken);
    lastIssuedFor.set(cloudId, issuedFor);
    return { delegationToken, cloudToken };
};

export const isExchangeInFlight = (cloudId: string): boolean => exchangesInFlight.has(cloudId);

export const lastIssuedForOf = (cloudId: string): string | null | undefined => lastIssuedFor.get(cloudId);

export const issueCloudTokens = async (
    cloudId: string,
    { allowCache }: { allowCache: boolean }
): Promise<IssuedCloudTokens> => {
    if (allowCache) {
        const cached = cloudStore.getCachedCloudTokens(cloudId);
        if (cached) {
            return cached;
        }
    }

    const running = exchangesInFlight.get(cloudId);
    if (running) return running;

    const started = exchange(cloudId);
    exchangesInFlight.set(cloudId, started);
    try {
        return await started;
    } finally {
        exchangesInFlight.delete(cloudId);
    }
};

export const reissueCloudTokens = async (cloudId: string): Promise<IssuedCloudTokens> => {
    const issued = await issueCloudTokens(cloudId, { allowCache: false });

    if (cloudStore.getDelegationToken()?.cloudId !== cloudId) {
        logger.info('SESSION', '[cloudTokens] cloud tokens re-issued into the cache', { data: { cloudId } });
        return issued;
    }

    const storedToken = cloudStore.getCloudToken();
    const storedUid = storedToken ? uidOfCloudToken(storedToken) : null;
    const issuedUid = uidOfCloudToken(issued.cloudToken);
    const replacesAnotherUser =
        isInviteLoginEntry(cloudStore.getDelegationToken()) || (!!storedUid && !!issuedUid && storedUid !== issuedUid);
    sessionSignal.batch(() => {
        cloudStore.saveDelegationToken(issued.delegationToken);
        const existing = replacesAnotherUser ? null : storedToken;
        cloudStore.saveCloudToken(
            existing ? ({ ...existing, ...issued.cloudToken } as UserTokenView) : issued.cloudToken
        );
        if (replacesAnotherUser) cloudStore.clearSelectedSite();

        rebuildSessionIdentity();
    });
    logger.info('SESSION', '[cloudTokens] committed cloud tokens re-issued', { data: { cloudId } });
    return issued;
};
