import { logger } from '@chatic/logger';
import { SDK_REFRESH_CYCLE_MS, getSocketManager, slotKeyOf } from '@chatic/transport';

import { cloudSession } from '../session/cloudSession';
import { tokensFromInviteLogin } from '../session/cloudTokens';
import { INVITE_LOGIN_UNKNOWN, forgetInviteLogin, readInviteLogin } from '../session/inviteLogins';
import type { InviteLogin } from '../session/inviteLogins';
import { createReauthDelegate } from './reauthDelegate';
import { reauthenticateActiveSocket } from './reauthenticateActiveSocket';
import { credentialRenewers } from './renewers';

export interface SwitchCloudSessionOptions {
    inviteLogin?: InviteLogin;
}

const reregisterSlot = async (cloudId: string): Promise<void> => {
    try {
        await reauthenticateActiveSocket({
            manager: getSocketManager(),
            delegate: createReauthDelegate(),
            slot: slotKeyOf(cloudId),
        });
    } catch (error) {
        logger.warn('SOCKET', '[switchCloudSession] slot re-registration failed', { error, data: { cloudId } });
    }
};

const renewIfLapsing = (cloudId: string): void => {
    const renewer = credentialRenewers.forSlot(slotKeyOf(cloudId));
    const left = renewer.timeToExpiry();
    if (left != null && left <= SDK_REFRESH_CYCLE_MS) void renewer.renew();
};

export const switchCloudSession = async (cloudId: string, options: SwitchCloudSessionOptions = {}): Promise<void> => {
    const { inviteLogin } = options;
    const hasLiveSlot = getSocketManager()
        .getSlotKeys()
        .some(key => key === cloudId);
    const answer = inviteLogin ? readInviteLogin(inviteLogin.handle) : null;
    if (inviteLogin && !answer) {
        throw Object.assign(new Error('The invite login this switch names is not held by the runtime'), {
            code: INVITE_LOGIN_UNKNOWN,
        });
    }
    const issuedTokens = answer
        ? (tokensFromInviteLogin(cloudId, {
              cloudToken: answer,
              backend: inviteLogin?.backend,
              wss: inviteLogin?.wss,
          }) ?? undefined)
        : undefined;
    if (inviteLogin && !issuedTokens) {
        logger.warn('SESSION', '[switchCloudSession] invite login answer not enterable; re-issuing', {
            data: { cloudId },
        });
    }
    await cloudSession.switchTo(cloudId, { hasLiveSlot, issuedTokens });
    if (inviteLogin) forgetInviteLogin(inviteLogin.handle);
    if (hasLiveSlot && issuedTokens) await reregisterSlot(cloudId);
    else if (hasLiveSlot) renewIfLapsing(cloudId);
};
