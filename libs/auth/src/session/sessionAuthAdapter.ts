import type { UserTokenView } from '@lemoncloud/chatic-backend-api';

import { logger } from '@chatic/logger';
import { RELAY_CLOUD_ID } from '@chatic/data';

import { cloudStore, relayStore, rebuildSessionIdentity } from '@chatic/session';
import { transportPlatform } from '@chatic/transport';
import { recordCloudIdentity } from './cloudIdentity';
import { calcSignature } from './utils/calcSignature';
import { mergeRefreshedCloudToken, mergeRefreshedRelayToken } from './utils/tokenMerge';

let warnedNoUserAgent = false;
const signingUserAgent = (): string => {
    const userAgent = transportPlatform.ports().device().userAgent;
    if (userAgent === undefined && !warnedNoUserAgent) {
        warnedNoUserAgent = true;
        logger.warn('AUTH', "[signAuth] the platform's device port reports no user agent — signing over ''");
    }
    return userAgent ?? '';
};

export interface AuthRegistration {
    token: string;
    authId: string;
    signing?: { accountId?: string; identityId?: string };
}

export interface ISessionAuthAdapter {
    getAuthRegistration(cid: string): Promise<AuthRegistration | null>;
    signAuth(cid: string, target?: string): Promise<{ signature: string; current: string }>;
    commitRefreshedToken(cid: string, view: UserTokenView): Promise<void>;
}

class SessionAuthAdapter implements ISessionAuthAdapter {
    async getAuthRegistration(cid: string): Promise<AuthRegistration | null> {
        if (cid !== RELAY_CLOUD_ID) {
            const cloudToken = cloudStore.getCloudTokenOf(cid)?.Token;
            const token = cloudToken?.identityToken ?? null;
            const authId = cloudToken?.authId ?? null;
            return token && authId
                ? { token, authId, signing: { accountId: cloudToken?.accountId, identityId: cloudToken?.identityId } }
                : null;
        }

        const relayToken = relayStore.getRelayToken();
        const token = relayStore.getIdentityToken();
        const authId = relayToken?.$auth?.id || null;

        return token && authId
            ? {
                  token,
                  authId,
                  signing: { accountId: relayToken?.Token?.accountId, identityId: relayToken?.Token?.identityId },
              }
            : null;
    }

    async signAuth(cid: string, _target?: string): Promise<{ signature: string; current: string }> {
        if (cid !== RELAY_CLOUD_ID) {
            const cloudToken = cloudStore.getCloudTokenOf(cid)?.Token;
            const authId = cloudToken?.authId;
            const accountId = cloudToken?.accountId;
            const identityId = cloudToken?.identityId;
            if (!authId || !accountId || !identityId) {
                throw new Error('Missing cloud token fields for socket auth signature');
            }
            const current = new Date().toISOString();
            const signature = calcSignature({ authId, accountId, identityId }, current, signingUserAgent());
            return { signature, current };
        }

        const relayToken = relayStore.getRelayToken();
        const relayAuth = relayToken?.$auth;
        const authId = relayAuth?.id;
        const identityId = relayToken?.Token?.identityId;

        const accountId = relayAuth?.accountId ?? relayToken?.Token?.accountId;
        if (
            relayAuth?.accountId &&
            relayToken?.Token?.accountId &&
            relayAuth.accountId !== relayToken.Token.accountId
        ) {
            logger.warn('AUTH', '[signAuth] relay accountId differs between $auth and Token', {
                data: { authId, auth: relayAuth.accountId, token: relayToken.Token.accountId },
            });
        }

        if (!authId || !accountId || !identityId) {
            throw new Error('Missing relay token fields for socket auth signature');
        }
        const current = new Date().toISOString();
        const signature = calcSignature({ authId, accountId, identityId }, current, signingUserAgent());
        return { signature, current };
    }

    async commitRefreshedToken(cid: string, view: UserTokenView): Promise<void> {
        if (cid !== RELAY_CLOUD_ID) {
            this.commitRefreshedCloudToken(cid, view);
            return;
        }
        if (view.Token) {
            const stored = relayStore.getRelayToken();
            const merged = mergeRefreshedRelayToken(stored, view as Parameters<typeof mergeRefreshedRelayToken>[1]);

            const offered = (view as UserTokenView & { $auth?: { id?: string } }).$auth?.id;
            const held = (stored as (UserTokenView & { $auth?: { id?: string } }) | null)?.$auth?.id;
            if (offered && held && offered !== held) {
                logger.warn('AUTH', '[commitServerRefreshedToken] kept the stored $auth, dropped the served one', {
                    data: {
                        cid,
                        held,
                        offered,
                        accountId: merged.Token?.accountId,
                        identityId: merged.Token?.identityId,
                    },
                });
            }
            const issued = view.Token.credential;
            if (!issued?.AccessKeyId || !issued?.SecretKey) {
                logger.warn('AUTH', '[commitServerRefreshedToken] refresh view carried no AWS credential', {
                    data: { cid, hasToken: !!merged.Token.identityToken },
                });
            }
            relayStore.saveRelayToken(merged);
        }

        rebuildSessionIdentity();
    }

    private commitRefreshedCloudToken(cid: string, view: UserTokenView): void {
        const delegationToken = cloudStore.getDelegationToken();
        if (delegationToken?.cloudId === cid) {
            const merged = mergeRefreshedCloudToken(cloudStore.getCloudToken(), view);
            cloudStore.saveCloudToken(merged);
            cloudStore.setCachedCloudTokens(cid, { delegationToken, cloudToken: merged });
            recordCloudIdentity(cid, merged);
            rebuildSessionIdentity();
            return;
        }

        const cached = cloudStore.peekCachedCloudTokens(cid);
        if (!cached) {
            logger.warn(
                'AUTH',
                '[commitRefreshedToken] no cached tokens for a non-committed cloud — writeback dropped',
                {
                    data: { cid },
                }
            );
            return;
        }
        const merged = mergeRefreshedCloudToken(cached.cloudToken, view);
        cloudStore.setCachedCloudTokens(cid, { delegationToken: cached.delegationToken, cloudToken: merged });
        recordCloudIdentity(cid, merged);
    }
}

export const sessionAuthAdapter: ISessionAuthAdapter = new SessionAuthAdapter();
