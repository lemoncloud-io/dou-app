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
    /**
     * The invite login this entry follows. Its answer is entered with as it is, instead of a
     * `delegate-cloud` re-issue — see `SwitchCloudOptions.issuedTokens` for why.
     */
    inviteLogin?: InviteLogin;
}

/**
 * A switch that commits tokens the server already issued (an invite login's) onto a live background
 * slot has to hand them to that slot's socket. The slot registered with the tokens it was booted on,
 * and a cloud slot is never re-authenticated on its own — its binding carries no identity token — so
 * without this the socket would go on as the user it booted as while the store names another.
 */
const reregisterSlot = async (cloudId: string): Promise<void> => {
    try {
        await reauthenticateActiveSocket({
            manager: getSocketManager(),
            delegate: createReauthDelegate(),
            slot: slotKeyOf(cloudId),
        });
    } catch (error) {
        // The store already holds the issued tokens; the socket registers from it on its next
        // handshake anyway, so the switch does not fail for this half.
        logger.warn('SOCKET', '[switchCloudSession] slot re-registration failed', { error, data: { cloudId } });
    }
};

/**
 * A switch onto a live background slot commits that slot's tokens as they are, without re-issuing —
 * including ones that ran low while nothing was looking (a laptop asleep, say). The credential guard
 * would renew them on its next tick, which can be minutes away; the user just walked into this
 * cloud, so renew now. Renewal re-issues and re-registers the socket in one step.
 */
const renewIfLapsing = (cloudId: string): void => {
    const renewer = credentialRenewers.forSlot(slotKeyOf(cloudId));
    const left = renewer.timeToExpiry();
    if (left != null && left <= SDK_REFRESH_CYCLE_MS) void renewer.renew();
};

/**
 * Makes `cloudId` the active cloud, as a user's selection does: the cloud sheet, search navigation, an
 * invite entry, a push deep link. Resolves with nothing — what the switch committed is the session's,
 * and the session view shows it; the switch's own answer carries the cloud's token.
 *
 * Not `cloudSession.switchTo`, which cloud-refresh recovery also calls: this adds what only a selection
 * needs — entering with an invite login's answer, and carrying a live background slot along.
 *
 * Throws `INVITE_LOGIN_UNKNOWN` for an invite login the runtime does not hold, and what the switch throws.
 */
export const switchCloudSession = async (cloudId: string, options: SwitchCloudSessionOptions = {}): Promise<void> => {
    const { inviteLogin } = options;
    // Asked at the moment of the switch: a background slot for the target may have bound or gone since
    // the screen rendered, and whether one is up decides which tokens the switch may commit.
    const hasLiveSlot = getSocketManager()
        .getSlotKeys()
        .some(key => key === cloudId);
    // A handle this runtime does not hold is refused, not entered the ordinary way: a re-issue answers
    // for the relay user as it is now, which after a sign-in is not the invitee the invite was accepted
    // as. Only an answer that is held but cannot be entered with falls back.
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
    // In: the answer is the session's now. Forgotten only here, so a switch that failed is retried with
    // the same handle and enters with the same answer.
    if (inviteLogin) forgetInviteLogin(inviteLogin.handle);
    if (hasLiveSlot && issuedTokens) await reregisterSlot(cloudId);
    else if (hasLiveSlot) renewIfLapsing(cloudId);
};
